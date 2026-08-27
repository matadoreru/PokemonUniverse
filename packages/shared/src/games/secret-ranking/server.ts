import type { Pokemon } from '../../pokemon/types.js';
import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule, type SubjectiveCategory } from '../contracts.js';
import { defaultSecretRankingConfig, secretRankingConfigSchema, type SecretRankingConfig } from './config.js';
import { officialSecretRankingPrompts } from './prompts.js';
import { buildSecretRankingResults, emptySecretRankingStats, secretRankingDistances } from './rules.js';
import { secretRankingActionSchema, type SecretRankingAction, type SecretRankingPlayerState, type SecretRankingPokemon, type SecretRankingPublicState, type SecretRankingRoundResult, type SecretRankingState } from './types.js';

export const SECRET_RANKING_REVEAL_MS = 8_000;

const manifest = {
  id: 'secret-ranking',
  name: 'Secret Ranking',
  icon: '📋',
  description: 'Ordena cinco Pokémon en secreto e intenta pensar como el resto del grupo.',
  minPlayers: 3,
  profileStats: {
    metrics: [
      { key: 'roundsPlayed', label: 'Rondas jugadas', aggregation: 'SUM' as const },
      { key: 'rankingsSubmitted', label: 'Rankings enviados', aggregation: 'SUM' as const },
      { key: 'roundsMissed', label: 'Rondas sin respuesta', aggregation: 'SUM' as const },
      { key: 'roundWins', label: 'Rankings más cercanos', aggregation: 'SUM' as const },
      { key: 'perfectMatches', label: 'Coincidencias perfectas', aggregation: 'SUM' as const },
      { key: 'distanceTotal', label: 'Distancia total', aggregation: 'SUM' as const },
      { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'submissionRate', label: 'Rankings completados', kind: 'PERCENT' as const, numerator: 'rankingsSubmitted', denominator: ['roundsPlayed'] },
      { key: 'averageDistance', label: 'Distancia media', kind: 'AVERAGE' as const, numerator: 'distanceTotal', denominator: ['rankingsSubmitted'] },
    ],
  },
};

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.min(Math.floor(random() * (index + 1)), index);
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function summary(pokemon: Pokemon): SecretRankingPokemon {
  return { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite };
}

function pokemonForIds(ids: readonly string[], context: GameContext): SecretRankingPokemon[] {
  return ids.flatMap((id) => {
    const pokemon = context.pokemon.byId(id);
    return pokemon ? [summary(pokemon)] : [];
  });
}

function promptPool(config: SecretRankingConfig, context: GameContext): SubjectiveCategory[] {
  const official = config.promptSource === 'CUSTOM' ? [] : officialSecretRankingPrompts;
  const custom = config.promptSource === 'OFFICIAL' ? [] : (context.hostCustomCategories ?? []);
  return [...official, ...custom.map((prompt) => ({ id: `secret-ranking-custom-${prompt.id}`, text: prompt.text }))];
}

function choosePrompt(state: SecretRankingState, context: GameContext): { promptId: string; usedPromptIds: string[] } {
  const unused = state.promptPool.filter((prompt) => !state.usedPromptIds.includes(prompt.id));
  const candidates = unused.length > 0 ? unused : state.promptPool;
  const selected = candidates[Math.floor(context.random() * candidates.length)]!;
  const usedPromptIds = unused.length === 0 ? [selected.id] : [...state.usedPromptIds, selected.id];
  return { promptId: selected.id, usedPromptIds: usedPromptIds.length >= state.promptPool.length ? [] : usedPromptIds };
}

function choosePokemon(state: SecretRankingState, context: GameContext): { pokemonIds: string[]; usedPokemonIds: string[] } {
  const unused = shuffled(state.pokemonPoolIds.filter((id) => !state.usedPokemonIds.includes(id)), context.random);
  const selected = unused.slice(0, 5);
  if (selected.length === 5) {
    const usedPokemonIds = [...state.usedPokemonIds, ...selected];
    return { pokemonIds: selected, usedPokemonIds: usedPokemonIds.length >= state.pokemonPoolIds.length ? [] : usedPokemonIds };
  }
  const nextCycle = shuffled(state.pokemonPoolIds.filter((id) => !selected.includes(id)), context.random).slice(0, 5 - selected.length);
  return { pokemonIds: [...selected, ...nextCycle], usedPokemonIds: [...nextCycle] };
}

function promptText(state: SecretRankingState): string {
  return state.promptPool.find((prompt) => prompt.id === state.currentPromptId)?.text ?? '';
}

function beginRound(state: SecretRankingState, context: GameContext): SecretRankingState {
  if (state.roundNumber >= state.config.rounds) return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  const prompt = choosePrompt(state, context);
  const pokemon = choosePokemon(state, context);
  return {
    ...state,
    phase: 'ROUND_ACTIVE',
    roundNumber: state.roundNumber + 1,
    currentPromptId: prompt.promptId,
    currentPokemonIds: pokemon.pokemonIds,
    usedPromptIds: prompt.usedPromptIds,
    usedPokemonIds: pokemon.usedPokemonIds,
    submissions: {},
    roundEndsAt: context.now + state.config.roundSeconds * 1_000,
    nextTransitionAt: null,
    lastRound: null,
  };
}

function finishRound(state: SecretRankingState, context: GameContext): SecretRankingState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const submitted = Object.fromEntries(state.playerIds.flatMap((playerId) => state.submissions[playerId] ? [[playerId, state.submissions[playerId]!] as const] : []));
  const distances = secretRankingDistances(submitted);
  const byPlayer = Object.fromEntries(distances.map((distance) => [distance.playerId, distance]));
  const pokemon = pokemonForIds(state.currentPokemonIds, context);
  const pokemonById = new Map(pokemon.map((entry) => [entry.id, entry]));
  const submittedRankings = Object.values(submitted);
  const consensus = submittedRankings.length === 0 ? [] : state.currentPokemonIds.map((pokemonId) => ({
    pokemon: pokemonById.get(pokemonId)!,
    averagePosition: submittedRankings.reduce((total, ranking) => total + ranking.indexOf(pokemonId) + 1, 0) / submittedRankings.length,
  })).sort((left, right) => left.averagePosition - right.averagePosition || state.currentPokemonIds.indexOf(left.pokemon.id) - state.currentPokemonIds.indexOf(right.pokemon.id));
  const scores = { ...state.scores };
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptySecretRankingStats();
    const ranking = state.submissions[playerId];
    const result = byPlayer[playerId];
    if (result) scores[playerId] = (scores[playerId] ?? 0) + result.points;
    return [playerId, {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      rankingsSubmitted: current.rankingsSubmitted + (ranking ? 1 : 0),
      roundsMissed: current.roundsMissed + (ranking ? 0 : 1),
      roundWins: current.roundWins + (result?.position === 1 ? 1 : 0),
      perfectMatches: current.perfectMatches + (result?.distance === 0 ? 1 : 0),
      distanceTotal: current.distanceTotal + (result?.distance ?? 0),
      pointsFromRounds: current.pointsFromRounds + (result?.points ?? 0),
    }];
  }));
  const players = Object.fromEntries(state.playerIds.map((playerId) => {
    const ranking = state.submissions[playerId];
    const result = byPlayer[playerId];
    return [playerId, {
      ranking: ranking ? ranking.map((id) => pokemonById.get(id)!).filter(Boolean) : null,
      distance: result?.distance ?? null,
      position: result?.position ?? null,
      pointsAwarded: result?.points ?? 0,
    }];
  }));
  const lastRound: SecretRankingRoundResult = {
    prompt: promptText(state),
    pokemon,
    consensus,
    players,
  };
  return {
    ...state,
    phase: 'ROUND_RESULTS',
    scores,
    playerStats,
    roundEndsAt: null,
    nextTransitionAt: context.now + SECRET_RANKING_REVEAL_MS,
    lastRound,
  };
}

function cloneRoundResult(result: SecretRankingRoundResult | null): SecretRankingRoundResult | null {
  if (!result) return null;
  return {
    ...result,
    pokemon: result.pokemon.map((pokemon) => ({ ...pokemon })),
    consensus: result.consensus.map((entry) => ({ pokemon: { ...entry.pokemon }, averagePosition: entry.averagePosition })),
    players: Object.fromEntries(Object.entries(result.players).map(([playerId, player]) => [playerId, {
      ...player,
      ranking: player.ranking?.map((pokemon) => ({ ...pokemon })) ?? null,
    }])),
  };
}

export const secretRankingGame: MiniGameModule<SecretRankingConfig, SecretRankingState, SecretRankingAction, SecretRankingPublicState> = {
  manifest,
  configSchema: secretRankingConfigSchema,
  actionSchema: secretRankingActionSchema,
  defaultConfig: defaultSecretRankingConfig,
  createInitialState(config, context) {
    const parsed = secretRankingConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error('Secret Ranking necesita al menos 3 jugadores; se recomiendan 4 o más.');
    const pool = context.pokemon.forGenerations(parsed.generations, { includeForms: parsed.includeForms })
      .filter((pokemon) => pokemon.sprite && (parsed.includeForms || pokemon.isDefault !== false));
    if (pool.length < 5) throw new Error('Se necesitan al menos 5 Pokémon con imagen para esta configuración.');
    const prompts = promptPool(parsed, context);
    if (prompts.length === 0) throw new Error('No hay preguntas activas para Secret Ranking.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING',
      config: parsed,
      playerIds,
      pokemonPoolIds: pool.map((pokemon) => pokemon.id),
      promptPool: prompts,
      usedPokemonIds: [],
      usedPromptIds: [],
      roundNumber: 0,
      currentPokemonIds: [],
      currentPromptId: null,
      submissions: {},
      scores: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
      playerStats: Object.fromEntries(playerIds.map((playerId) => [playerId, emptySecretRankingStats()])),
      roundEndsAt: null,
      nextTransitionAt: null,
      lastRound: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<SecretRankingState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La ronda ya está cerrada.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
    if (state.submissions[playerId]) return { state, accepted: false, error: 'Tu ranking ya está bloqueado.' };
    const submittedIds = new Set(action.pokemonIds);
    if (submittedIds.size !== 5 || action.pokemonIds.some((id) => !state.currentPokemonIds.includes(id))) {
      return { state, accepted: false, error: 'Ordena exactamente los cinco Pokémon de esta ronda.' };
    }
    const next = { ...state, submissions: { ...state.submissions, [playerId]: [...action.pokemonIds] } };
    return {
      state: allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(next.submissions[id])) ? finishRound(next, context) : next,
      accepted: true,
    };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return finishRound(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    return state.phase === 'ROUND_ACTIVE' && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.submissions[id])) ? finishRound(state, context) : state;
  },
  getPublicState(state, context) {
    return {
      gameId: 'secret-ranking',
      phase: state.phase,
      roundNumber: state.roundNumber,
      totalRounds: state.config.rounds,
      prompt: promptText(state),
      pokemon: pokemonForIds(state.currentPokemonIds, context),
      submittedPlayerIds: Object.keys(state.submissions),
      scores: { ...state.scores },
      roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS' ? cloneRoundResult(state.lastRound) : null,
      results: state.phase === 'GAME_RESULTS' ? buildSecretRankingResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): SecretRankingPlayerState {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR', canSubmit: false, ownRanking: null };
    const ranking = state.submissions[playerId];
    return {
      role: 'PLAYER',
      canSubmit: state.phase === 'ROUND_ACTIVE' && !ranking,
      ownRanking: ranking ? pokemonForIds(ranking, context) : null,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildSecretRankingResults(state); },
};
