import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { cooldownMessage, cooldownRemainingMs, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultPokeTabooConfig, pokeTabooConfigSchema, type PokeTabooConfig } from './config.js';
import { buildPokeTabooResults, containsTabooPokemonName, emptyPokeTabooStats, POKE_TABOO_DESCRIPTOR_POINTS, pokeTabooGuesserPoints } from './rules.js';
import { pokeTabooActionSchema, type PokeTabooAction, type PokeTabooPlayerState, type PokeTabooPublicState, type PokeTabooSecretPokemon, type PokeTabooState } from './types.js';

export const POKE_TABOO_GUESS_COOLDOWN_MS = 1_000;
export const POKE_TABOO_HINT_COOLDOWN_MS = 500;
export const POKE_TABOO_REVEAL_MS = 4_000;
export const POKE_TABOO_MAX_HINTS = 24;

const manifest = {
  id: 'poke-taboo', name: 'PokéTaboo', icon: '🎙️',
  description: 'Describe un Pokémon sin decir su nombre y ayuda al grupo a descubrirlo.', minPlayers: 2,
  profileStats: {
    metrics: [
      { key: 'guessedPokemon', label: 'Pokémon adivinados', aggregation: 'SUM' },
      { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' },
      { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' },
      { key: 'firstCorrectResponses', label: 'Primeras respuestas correctas', aggregation: 'SUM' },
      { key: 'descriptorRounds', label: 'Rondas como descriptor', aggregation: 'SUM' },
      { key: 'descriptorSuccesses', label: 'Rondas de descriptor exitosas', aggregation: 'SUM' },
      { key: 'descriptorFailures', label: 'Rondas de descriptor fallidas', aggregation: 'SUM' },
      { key: 'pointsFromGuessing', label: 'Puntos por adivinar', aggregation: 'SUM' },
      { key: 'pointsFromDescribing', label: 'Puntos por describir', aggregation: 'SUM' },
    ],
    derivedMetrics: [
      { key: 'descriptorSuccessRate', label: 'Tasa de éxito como descriptor', kind: 'PERCENT', numerator: 'descriptorSuccesses', denominator: ['descriptorSuccesses', 'descriptorFailures'] },
    ],
  },
} as const;

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(Math.floor(random() * (index + 1)), index);
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function pokeTabooPool(config: PokeTabooConfig, context: GameContext): Pokemon[] {
  return context.pokemon.forGenerations(config.generations, { includeForms: config.includeRegionalForms })
    .filter((pokemon) => Boolean(pokemon.id && pokemon.name && pokemon.sprite));
}

function reveal(pokemon: Pokemon) {
  return { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, generation: pokemon.generation, types: [...pokemon.types] };
}

function secret(pokemon: Pokemon): PokeTabooSecretPokemon {
  return {
    ...reveal(pokemon), hp: pokemon.hp, attack: pokemon.attack, defense: pokemon.defense,
    specialAttack: pokemon.specialAttack, specialDefense: pokemon.specialDefense, speed: pokemon.speed,
    baseStatTotal: pokemon.baseStatTotal, evolutionStage: pokemon.evolutionStage ?? null,
    evolutionStageCount: pokemon.evolutionStageCount ?? null, heightDecimeters: pokemon.heightDecimeters ?? null,
    weightHectograms: pokemon.weightHectograms ?? null, legendaryStatus: pokemon.legendaryStatus ?? null,
    abilities: [...(pokemon.abilities ?? [])],
  };
}

function incrementDescriptorFailure(state: PokeTabooState, descriptorId: string): PokeTabooState {
  const stats = state.playerStats[descriptorId] ?? emptyPokeTabooStats();
  return { ...state, playerStats: { ...state.playerStats, [descriptorId]: {
    ...stats, descriptorRounds: stats.descriptorRounds + 1, descriptorFailures: stats.descriptorFailures + 1,
  } } };
}

function finish(state: PokeTabooState): PokeTabooState {
  return {
    ...state, phase: 'GAME_RESULTS', targetPokemonId: null, descriptorId: null, hints: [], attempts: [],
    roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null,
  };
}

function selectTarget(state: PokeTabooState, context: GameContext): Pokemon {
  const pool = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  let candidates = pool.filter((pokemon) => !state.usedPokemonIds.includes(pokemon.id));
  if (!candidates.length) candidates = pool;
  const selected = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)];
  if (!selected) throw new Error('No hay Pokémon disponibles para PokéTaboo.');
  return selected;
}

function beginNextRound(initial: PokeTabooState, context: GameContext): PokeTabooState {
  let state = initial;
  const totalRounds = state.playerIds.length * state.config.laps;
  while (state.roundNumber < totalRounds) {
    const roundNumber = state.roundNumber + 1;
    const descriptorId = state.descriptorOrder[(roundNumber - 1) % state.descriptorOrder.length]!;
    if (!isPlayerRequired(context, descriptorId)) {
      state = incrementDescriptorFailure({ ...state, roundNumber }, descriptorId);
      continue;
    }
    const target = selectTarget(state, context);
    context.preloadImage?.(target.sprite);
    return {
      ...state, phase: 'ROUND_ACTIVE', roundNumber, descriptorId, targetPokemonId: target.id,
      usedPokemonIds: [...new Set([...state.usedPokemonIds, target.id])], hints: [], hintCooldownUntil: null,
      attempts: [], attemptCounts: {}, cooldownUntil: {}, roundStartedAt: context.now,
      roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null,
    };
  }
  return finish(state);
}

function resolveRound(state: PokeTabooState, context: GameContext, winnerId: string | null): PokeTabooState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const target = context.pokemon.byId(state.targetPokemonId ?? '');
  const descriptorId = state.descriptorId;
  if (!target || !descriptorId) throw new Error('El secreto de PokéTaboo ya no está disponible.');
  const scores = { ...state.scores }; const playerStats = { ...state.playerStats };
  let guesserPoints = 0; let descriptorPoints = 0;
  if (winnerId) {
    guesserPoints = pokeTabooGuesserPoints(state.roundStartedAt!, state.config.roundSeconds, context.now);
    descriptorPoints = POKE_TABOO_DESCRIPTOR_POINTS;
    scores[winnerId] = (scores[winnerId] ?? 0) + guesserPoints;
    scores[descriptorId] = (scores[descriptorId] ?? 0) + descriptorPoints;
    const winnerStats = playerStats[winnerId] ?? emptyPokeTabooStats();
    const attemptCount = state.attemptCounts[winnerId] ?? 0;
    playerStats[winnerId] = {
      ...winnerStats, guessedPokemon: winnerStats.guessedPokemon + 1,
      firstTry: winnerStats.firstTry + (attemptCount === 1 ? 1 : 0),
      firstCorrectResponses: winnerStats.firstCorrectResponses + 1,
      pointsFromGuessing: winnerStats.pointsFromGuessing + guesserPoints,
    };
  }
  const descriptorStats = playerStats[descriptorId] ?? emptyPokeTabooStats();
  playerStats[descriptorId] = {
    ...descriptorStats, descriptorRounds: descriptorStats.descriptorRounds + 1,
    descriptorSuccesses: descriptorStats.descriptorSuccesses + (winnerId ? 1 : 0),
    descriptorFailures: descriptorStats.descriptorFailures + (winnerId ? 0 : 1),
    pointsFromDescribing: descriptorStats.pointsFromDescribing + descriptorPoints,
  };
  return {
    ...state, phase: 'ROUND_RESULTS', scores, playerStats, roundEndsAt: null,
    nextTransitionAt: context.now + POKE_TABOO_REVEAL_MS,
    lastRound: {
      reason: winnerId ? 'GUESSED' : 'TIMEOUT', pokemon: reveal(target), descriptorId, winnerId,
      guesserPoints, descriptorPoints, winnerAttemptCount: winnerId ? state.attemptCounts[winnerId] ?? 0 : null,
    },
  };
}

export const pokeTabooGame: MiniGameModule<PokeTabooConfig, PokeTabooState, PokeTabooAction, PokeTabooPublicState> = {
  manifest,
  configSchema: pokeTabooConfigSchema,
  actionSchema: pokeTabooActionSchema,
  defaultConfig: defaultPokeTabooConfig,
  createInitialState(config, context) {
    const parsed = pokeTabooConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const pool = pokeTabooPool(parsed, context);
    if (!pool.length) throw new Error('No hay Pokémon disponibles para esa configuración.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, descriptorOrder: shuffled(playerIds, context.random),
      poolIds: pool.map((pokemon) => pokemon.id), usedPokemonIds: [], roundNumber: 0, targetPokemonId: null,
      descriptorId: null, hints: [], hintCooldownUntil: null, attempts: [], attemptCounts: {}, cooldownUntil: {},
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyPokeTabooStats()])),
      roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) {
    if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.');
    return beginNextRound(state, context);
  },
  handleAction(state, playerId, action, context): GameActionResult<PokeTabooState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context, null), accepted: false, error: 'El tiempo ha terminado.' };
    if (action.type === 'SEND_HINT') {
      if (playerId !== state.descriptorId) return { state, accepted: false, error: 'Solo el descriptor puede escribir pistas.' };
      if (state.hints.length >= POKE_TABOO_MAX_HINTS) return { state, accepted: false, error: 'Ya has enviado el máximo de pistas de esta ronda.' };
      if (cooldownRemainingMs(context.now, state.hintCooldownUntil) > 0) return { state, accepted: false, error: 'Espera un momento antes de enviar otra pista.' };
      const target = context.pokemon.byId(state.targetPokemonId ?? '');
      if (!target) return { state, accepted: false, error: 'El Pokémon secreto no está disponible.' };
      if (containsTabooPokemonName(action.text, target)) return { state, accepted: false, error: 'No puedes escribir el nombre del Pokémon.' };
      return { accepted: true, state: {
        ...state,
        hints: [...state.hints, { id: state.hints.length + 1, text: action.text.trim(), sentAt: context.now }],
        hintCooldownUntil: context.now + POKE_TABOO_HINT_COOLDOWN_MS,
      } };
    }
    if (playerId === state.descriptorId) return { state, accepted: false, error: 'El descriptor no puede adivinar.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || !state.poolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const attemptCount = (state.attemptCounts[playerId] ?? 0) + 1;
    const stats = state.playerStats[playerId] ?? emptyPokeTabooStats();
    let next: PokeTabooState = {
      ...state, attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } },
    };
    if (guessed.id === state.targetPokemonId) return { state: resolveRound(next, context, playerId), accepted: true };
    next = {
      ...next,
      attempts: [...next.attempts, { playerId, guessedPokemon: { id: guessed.id, name: guessed.name, sprite: guessed.sprite }, attemptedAt: context.now }],
      cooldownUntil: setPlayerCooldown(next.cooldownUntil, playerId, context.now, POKE_TABOO_GUESS_COOLDOWN_MS),
    };
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return resolveRound(state, context, null);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginNextRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase !== 'ROUND_ACTIVE' || !state.descriptorId || isPlayerRequired(context, state.descriptorId)) return state;
    const canceled = incrementDescriptorFailure(state, state.descriptorId);
    return beginNextRound({
      ...canceled, targetPokemonId: null, descriptorId: null, hints: [], attempts: [], roundStartedAt: null,
      roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    }, context);
  },
  getPublicState(state) {
    const totalRounds = state.playerIds.length * state.config.laps;
    const nextDescriptorId = state.roundNumber < totalRounds
      ? state.descriptorOrder[state.roundNumber % state.descriptorOrder.length] ?? null : null;
    return {
      gameId: 'poke-taboo', phase: state.phase, roundNumber: state.roundNumber, totalRounds,
      lapNumber: Math.min(state.config.laps, Math.floor(Math.max(0, state.roundNumber - 1) / state.playerIds.length) + 1),
      totalLaps: state.config.laps, descriptorId: state.descriptorId, nextDescriptorId,
      descriptorOrder: [...state.descriptorOrder], hints: [...state.hints], attempts: [...state.attempts],
      scores: { ...state.scores }, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' ? state.lastRound : null,
      results: state.phase === 'GAME_RESULTS' ? buildPokeTabooResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): PokeTabooPlayerState {
    const participating = state.playerIds.includes(playerId) && isPlayerRequired(context, playerId);
    if (!participating) return { role: 'SPECTATOR' };
    if (state.phase === 'ROUND_ACTIVE' && playerId === state.descriptorId) {
      const target = context.pokemon.byId(state.targetPokemonId ?? '');
      return { role: 'DESCRIPTOR', canSendHint: Boolean(target), secretPokemon: target ? secret(target) : null };
    }
    return {
      role: 'GUESSER', canGuess: state.phase === 'ROUND_ACTIVE' && playerId !== state.descriptorId,
      cooldownUntil: state.cooldownUntil[playerId] ?? null, attemptCount: state.attemptCounts[playerId] ?? 0,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokeTabooResults(state); },
};
