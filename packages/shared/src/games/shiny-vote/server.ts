import type { Pokemon } from '../../pokemon/types.js';
import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultShinyVoteConfig, shinyVoteConfigSchema, type ShinyVoteConfig } from './config.js';
import { AUTHENTIC_SHINY_FILTER, fakeShinyFilter, useShinySpriteForFake } from './filters.js';
import { buildShinyResults, emptyShinyStats } from './rules.js';
import {
  SHINY_OPTION_IDS,
  shinyVoteActionSchema,
  type ShinyOption,
  type ShinyOptionId,
  type ShinyVoteAction,
  type ShinyVotePublicState,
  type ShinyVoteState,
} from './types.js';

const REVEAL_DURATION_MS = 3_000;
const manifest = {
  id: 'shiny-vote',
  name: 'Shiny Quiz',
  icon: '✨',
  description: 'Encuentra el shiny verdadero entre varios candidatos. Los votos se ven en directo.',
  minPlayers: 1,
  profileStats: {
    metrics: [
      { key: 'correctVotes', label: 'Aciertos', aggregation: 'SUM' },
      { key: 'incorrectVotes', label: 'Fallos', aggregation: 'SUM' },
      { key: 'unanswered', label: 'Sin respuesta', aggregation: 'SUM' },
      { key: 'votes', label: 'Respuestas', aggregation: 'SUM' },
    ],
    derivedMetrics: [{ key: 'accuracy', label: 'Precisión', kind: 'PERCENT', numerator: 'correctVotes', denominator: ['votes'] }],
  },
} as const;

function takeRandom<T>(source: readonly T[], count: number, random: () => number): T[] {
  const pool = [...source];
  const selected: T[] = [];
  while (selected.length < count && pool.length > 0) {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    selected.push(pool.splice(index, 1)[0]!);
  }
  return selected;
}

function shinySprite(pokemon: Pokemon): string {
  const marker = '/sprites/pokemon/';
  if (pokemon.sprite.includes(marker)) return pokemon.sprite.replace(marker, `${marker}shiny/`);
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${pokemon.nationalDexNumber}.png`;
}

function createOptions(state: ShinyVoteState, context: GameContext): { options: ShinyOption[]; correctOptionId: ShinyOptionId } {
  const samePokemon = state.config.candidateMode === 'SAME_POKEMON';
  const optionIds = SHINY_OPTION_IDS.slice(0, state.config.optionCount);
  const requiredPokemon = samePokemon ? 1 : optionIds.length;
  const selected = takeRandom(context.pokemon.forGenerations(state.config.generations), requiredPokemon, context.random);
  if (selected.length < requiredPokemon) throw new Error(`At least ${requiredPokemon} Pokémon are required for the selected generations`);
  const candidates = samePokemon ? optionIds.map(() => selected[0]!) : selected;
  const correctIndex = Math.min(Math.floor(context.random() * optionIds.length), optionIds.length - 1);
  let fakeFilterIndex = 0;
  return {
    options: candidates.map((pokemon, index) => {
      const authentic = index === correctIndex;
      const visualFilter = authentic ? AUTHENTIC_SHINY_FILTER : fakeShinyFilter(fakeFilterIndex++);
      const useShinyBase = authentic || useShinySpriteForFake(context.random);
      return {
        id: optionIds[index]!,
        pokemonId: pokemon.id,
        pokemonName: pokemon.name,
        sprite: useShinyBase ? shinySprite(pokemon) : pokemon.sprite,
        visualFilter,
      };
    }),
    correctOptionId: optionIds[correctIndex]!,
  };
}

function prepareNextRound(state: ShinyVoteState, context: GameContext): Pick<ShinyVoteState, 'preparedOptions' | 'preparedCorrectOptionId'> {
  if (state.roundNumber >= state.config.rounds) return { preparedOptions: null, preparedCorrectOptionId: null };
  const generated = createOptions(state, context);
  for (const option of generated.options) context.preloadImage?.(option.sprite);
  return { preparedOptions: generated.options, preparedCorrectOptionId: generated.correctOptionId };
}

function beginRound(state: ShinyVoteState, context: GameContext): ShinyVoteState {
  const generated = state.preparedOptions && state.preparedCorrectOptionId
    ? { options: state.preparedOptions, correctOptionId: state.preparedCorrectOptionId }
    : createOptions(state, context);
  return {
    ...state,
    phase: 'ROUND_ACTIVE',
    roundNumber: state.roundNumber + 1,
    options: generated.options,
    correctOptionId: generated.correctOptionId,
    votes: {},
    roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.roundSeconds * 1_000,
    nextTransitionAt: null,
    lastRound: null,
    preparedOptions: null,
    preparedCorrectOptionId: null,
  };
}

function revealRound(state: ShinyVoteState, context: GameContext): ShinyVoteState {
  if (state.phase !== 'ROUND_ACTIVE' || !state.correctOptionId) return state;
  const correctPlayerIds = state.playerIds.filter((playerId) => state.votes[playerId]?.optionId === state.correctOptionId);
  const missedPlayerIds = state.playerIds.filter((playerId) => state.votes[playerId]?.optionId !== state.correctOptionId);
  const correctSet = new Set(correctPlayerIds);
  const scores = { ...state.scores };
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) {
    const previous = state.playerStats[playerId] ?? emptyShinyStats();
    const voted = Boolean(state.votes[playerId]);
    const correct = correctSet.has(playerId);
    scores[playerId] = (scores[playerId] ?? 0) + (correct ? 1 : 0);
    playerStats[playerId] = {
      votes: previous.votes + (voted ? 1 : 0),
      correctVotes: previous.correctVotes + (correct ? 1 : 0),
    };
  }
  return {
    ...state,
    ...prepareNextRound(state, context),
    phase: 'ROUND_RESULTS',
    scores,
    playerStats,
    roundEndsAt: null,
    nextTransitionAt: context.now + REVEAL_DURATION_MS,
    lastRound: {
      roundNumber: state.roundNumber,
      correctOptionId: state.correctOptionId,
      votes: { ...state.votes },
      correctPlayerIds,
      missedPlayerIds,
    },
  };
}

function finishGame(state: ShinyVoteState): ShinyVoteState {
  return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
}

export const shinyVoteGame: MiniGameModule<ShinyVoteConfig, ShinyVoteState, ShinyVoteAction, ShinyVotePublicState> = {
  manifest,
  configSchema: shinyVoteConfigSchema,
  actionSchema: shinyVoteActionSchema,
  defaultConfig: defaultShinyVoteConfig,

  createInitialState(config, context) {
    const parsed = shinyVoteConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`At least ${manifest.minPlayers} player is required`);
    const requiredPokemon = parsed.candidateMode === 'SAME_POKEMON' ? 1 : parsed.optionCount;
    if (context.pokemon.forGenerations(parsed.generations).length < requiredPokemon) throw new Error(`At least ${requiredPokemon} Pokémon are required for the selected generations`);
    return {
      phase: 'GAME_STARTING',
      config: parsed,
      assetToken: context.now.toString(36),
      playerIds: context.players.map((player) => player.id),
      roundNumber: 0,
      options: [],
      correctOptionId: null,
      votes: {},
      scores: Object.fromEntries(context.players.map((player) => [player.id, 0])),
      playerStats: Object.fromEntries(context.players.map((player) => [player.id, emptyShinyStats()])),
      roundStartedAt: null,
      roundEndsAt: null,
      nextTransitionAt: null,
      lastRound: null,
      preparedOptions: null,
      preparedCorrectOptionId: null,
    };
  },

  start(state, context) {
    if (state.phase !== 'GAME_STARTING') throw new Error('Game already started');
    return beginRound(state, context);
  },

  handleAction(state, playerId, action, context): GameActionResult<ShinyVoteState> {
    if (action.type !== 'VOTE') return { state, accepted: false, error: 'Unknown action' };
    if (!state.playerIds.includes(playerId)) return { state, accepted: false, error: 'No participas en esta partida.' };
    if (!isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No estás conectado como participante.' };
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La ronda no está en fase de votación.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: revealRound(state, context), accepted: false, error: 'La votación ha terminado.' };
    if (state.votes[playerId]) return { state, accepted: false, error: 'Tu voto ya está bloqueado.' };
    if (!state.options.some((option) => option.id === action.optionId)) return { state, accepted: false, error: 'La opción no pertenece a esta ronda.' };

    let next: ShinyVoteState = {
      ...state,
      votes: { ...state.votes, [playerId]: { optionId: action.optionId, votedAt: context.now } },
    };
    if (allConnectedRequiredCompleted(context, next.playerIds, (id) => Boolean(next.votes[id]))) next = revealRound(next, context);
    return { state: next, accepted: true };
  },

  handleTimeout(state, context) {
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) {
      return state.roundNumber >= state.config.rounds ? finishGame(state) : beginRound(state, context);
    }
    if (state.phase !== 'ROUND_ACTIVE' || context.now < (state.roundEndsAt ?? Infinity)) return state;
    return revealRound(state, context);
  },

  handlePresenceChange(state, context) {
    if (state.phase === 'ROUND_ACTIVE'
      && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.votes[id]))) {
      return revealRound(state, context);
    }
    return state;
  },

  getPublicState(state, context) {
    const reveal = state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS';
    const results = state.phase === 'GAME_RESULTS' ? buildShinyResults(state) : null;
    const options = state.options.map((option) => ({
      ...option,
      sprite: context.roomCode
        ? `/api/rooms/${encodeURIComponent(context.roomCode)}/games/${state.assetToken}/rounds/${state.roundNumber}/options/${option.id}/sprite`
        : option.sprite,
    }));
    return {
      gameId: 'shiny-vote',
      phase: state.phase,
      roundNumber: state.roundNumber,
      totalRounds: state.config.rounds,
      playerIds: state.playerIds,
      options,
      votes: reveal || state.config.showVotes ? state.votes : {},
      votedPlayerIds: Object.keys(state.votes),
      showVotes: state.config.showVotes,
      pendingPlayerIds: state.playerIds.filter((playerId) => !state.votes[playerId]),
      scores: state.scores,
      roundStartedAt: state.roundStartedAt,
      roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt,
      correctOptionId: reveal ? state.correctOptionId : null,
      lastRound: reveal ? state.lastRound : null,
      winnerId: results?.winnerId ?? null,
      results,
    };
  },

  getPlayerState(state, playerId) {
    return { canVote: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && !state.votes[playerId], vote: state.votes[playerId] ?? null };
  },
  resolveAsset(state, request) {
    if (state.assetToken !== request.assetToken || state.roundNumber !== request.roundNumber) return null;
    return state.options.find((option) => option.id === request.assetId)?.sprite ?? null;
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildShinyResults(state); },
};
