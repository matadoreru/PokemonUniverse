import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule, type PokemonCryVersion } from '../contracts.js';
import { advanceTimedRound, cooldownMessage, cooldownRemainingMs, resolveWhenRequiredPlayersComplete, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultPokemonCryQuizConfig, pokemonCryQuizConfigSchema, type PokemonCryQuizConfig } from './config.js';
import { buildPokemonCryResults, emptyPokemonCryStats, pokemonCryScore } from './rules.js';
import { pokemonCryQuizActionSchema, type PokemonCryQuizAction, type PokemonCryQuizPlayerState, type PokemonCryQuizPublicState, type PokemonCryQuizState } from './types.js';

export const POKEMON_CRY_COOLDOWN_MS = 1_000;
export const POKEMON_CRY_REVEAL_MS = 4_000;

const manifest = {
  id: 'pokemon-cry-quiz', name: 'Adivina el Grito', icon: '🔊', recommended: true,
  description: 'Escucha el grito oficial y descubre qué Pokémon lo está haciendo.', minPlayers: 1, maxPlayers: 12,
  profileStats: { metrics: [
    { key: 'correct', label: 'Gritos acertados', aggregation: 'SUM' as const },
    { key: 'missed', label: 'Gritos no acertados', aggregation: 'SUM' as const },
    { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' as const },
    { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' as const },
    { key: 'roundFirsts', label: 'Primeros puestos', aggregation: 'SUM' as const },
    { key: 'solveTimeTotalMs', label: 'Tiempo total en aciertos', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
    { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
    { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
  ], derivedMetrics: [
    { key: 'accuracy', label: 'Precisión', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['totalAttempts'] },
    { key: 'averageSolveTime', label: 'Tiempo medio', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const },
  ] },
} as const;

const reveal = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite });
const cryPath = (state: PokemonCryQuizState, context: GameContext) => `/api/rooms/${encodeURIComponent(context.roomCode ?? 'opaque')}/games/${state.assetToken}/rounds/${state.roundNumber}/options/cry/audio`;

export function pokemonCryPool(config: PokemonCryQuizConfig, context: GameContext): Pokemon[] {
  if (!context.pokemonAudio) return [];
  return context.pokemon.forGenerations(config.generations, { includeForms: config.includeRegionalForms }).filter((pokemon) => {
    if (!pokemon.id || !pokemon.name || !pokemon.sprite) return false;
    if (config.cryVersion === 'LATEST') return Boolean(context.pokemonAudio!.cryFor(pokemon.id, 'LATEST'));
    if (config.cryVersion === 'LEGACY') return Boolean(context.pokemonAudio!.cryFor(pokemon.id, 'LEGACY'));
    return Boolean(context.pokemonAudio!.cryFor(pokemon.id, 'LATEST') || context.pokemonAudio!.cryFor(pokemon.id, 'LEGACY'));
  });
}

function chooseVersion(state: PokemonCryQuizState, pokemonId: string, context: GameContext): PokemonCryVersion {
  if (state.config.cryVersion !== 'RANDOM') return state.config.cryVersion;
  const available = (['LATEST', 'LEGACY'] as const).filter((version) => context.pokemonAudio?.cryFor(pokemonId, version));
  return available[Math.min(Math.floor(context.random() * available.length), available.length - 1)]!;
}

function beginRound(state: PokemonCryQuizState, context: GameContext): PokemonCryQuizState {
  const pool = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  let candidates = pool.filter((pokemon) => !state.usedPokemonIds.includes(pokemon.id));
  if (!candidates.length) candidates = pool;
  if (!candidates.length) throw new Error('No hay gritos disponibles para esta configuración.');
  const target = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)]!;
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, targetPokemonId: target.id, currentCryVersion: chooseVersion(state, target.id, context),
    usedPokemonIds: [...new Set([...state.usedPokemonIds, target.id])], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
    roundStartedAt: context.now, roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null,
  };
}

function resolveRound(state: PokemonCryQuizState, context: GameContext): PokemonCryQuizState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const target = context.pokemon.byId(state.targetPokemonId ?? '');
  if (!target || !state.currentCryVersion) throw new Error('El grito objetivo ya no está disponible.');
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) if (!state.solves[playerId]) {
    const stats = playerStats[playerId] ?? emptyPokemonCryStats(); playerStats[playerId] = { ...stats, missed: stats.missed + 1 };
  }
  return { ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + POKEMON_CRY_REVEAL_MS, lastRound: { pokemon: { ...reveal(target), generation: target.generation }, cryVersion: state.currentCryVersion, solves: { ...state.solves }, attemptCounts: { ...state.attemptCounts } } };
}

const finish = (state: PokemonCryQuizState): PokemonCryQuizState => ({ ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null });

export const pokemonCryQuizGame: MiniGameModule<PokemonCryQuizConfig, PokemonCryQuizState, PokemonCryQuizAction, PokemonCryQuizPublicState> = {
  manifest, configSchema: pokemonCryQuizConfigSchema, actionSchema: pokemonCryQuizActionSchema, defaultConfig: defaultPokemonCryQuizConfig,
  createInitialState(config, context) {
    const parsed = pokemonCryQuizConfigSchema.parse(config); const pool = pokemonCryPool(parsed, context);
    if (!context.pokemonAudio) throw new Error('El catálogo local de gritos no está disponible.');
    if (context.pokemonAudio.pokemonIds().length === 0) throw new Error('PostgreSQL no contiene gritos. Ejecuta una sincronización completa de PokéAPI desde Administración y vuelve a intentarlo.');
    if (!pool.length) throw new Error('No hay gritos disponibles en PostgreSQL para las generaciones seleccionadas.');
    const playerIds = context.players.map((player) => player.id); const token = Array.from({ length: 3 }, () => Math.floor(context.random() * 0x1_0000_0000).toString(36)).join('-');
    return { phase: 'GAME_STARTING', config: parsed, assetToken: `${context.now.toString(36)}-${token}`, playerIds, poolIds: pool.map((pokemon) => pokemon.id), roundNumber: 0, targetPokemonId: null, currentCryVersion: null, usedPokemonIds: [], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {}, scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyPokemonCryStats()])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<PokemonCryQuizState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || !state.poolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const attempts = (state.attemptCounts[playerId] ?? 0) + 1; const stats = state.playerStats[playerId] ?? emptyPokemonCryStats();
    if (guessed.id === state.targetPokemonId) {
      const solveOrder = Object.keys(state.solves).length + 1; const elapsedMs = context.now - state.roundStartedAt!; const score = pokemonCryScore(state.roundStartedAt!, state.config.roundSeconds, context.now, solveOrder);
      let next: PokemonCryQuizState = { ...state, attemptCounts: { ...state.attemptCounts, [playerId]: attempts }, solves: { ...state.solves, [playerId]: { solveOrder, solvedAt: context.now, elapsedMs, speedPoints: score.speedPoints, placementBonus: score.placementBonus, points: score.totalPoints, attempts } }, lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'CORRECT', attemptedAt: context.now } }, scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + score.totalPoints }, playerStats: { ...state.playerStats, [playerId]: { ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1, firstTry: stats.firstTry + (attempts === 1 ? 1 : 0), roundFirsts: stats.roundFirsts + (solveOrder === 1 ? 1 : 0), solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs, bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs), pointsFromRounds: stats.pointsFromRounds + score.totalPoints } } };
      next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.solves[id]), resolveRound); return { state: next, accepted: true };
    }
    return { accepted: true, state: { ...state, attempts: [...state.attempts, { playerId, guessedPokemon: reveal(guessed), attemptedAt: context.now }], attemptCounts: { ...state.attemptCounts, [playerId]: attempts }, cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, context.now, POKEMON_CRY_COOLDOWN_MS), lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'INCORRECT', attemptedAt: context.now } }, playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } } } };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginRound, resolveActive: resolveRound, finish, isComplete: (current) => current.roundNumber >= current.config.rounds }); },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.solves[id]), resolveRound); },
  getPublicState(state, context) {
    const revealActive = state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS';
    return { gameId: 'pokemon-cry-quiz', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds, cryUrl: state.phase === 'ROUND_ACTIVE' ? cryPath(state, context) : null, attempts: state.attempts, solvedPlayers: Object.entries(state.solves).map(([playerId, solve]) => ({ playerId, solveOrder: solve.solveOrder })).sort((left, right) => left.solveOrder - right.solveOrder), scores: state.scores, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: state.lastRound && revealActive ? { pokemon: { name: state.lastRound.pokemon.name, sprite: state.lastRound.pokemon.sprite, generation: state.lastRound.pokemon.generation }, cryVersion: state.lastRound.cryVersion, cryUrl: cryPath(state, context), solves: state.lastRound.solves, attemptCounts: state.lastRound.attemptCounts } : null, results: state.phase === 'GAME_RESULTS' ? buildPokemonCryResults(state) : null };
  },
  getPlayerState(state, playerId, context): PokemonCryQuizPlayerState {
    const solve = state.solves[playerId]; const participating = state.playerIds.includes(playerId) && isPlayerRequired(context, playerId);
    return { role: state.playerIds.includes(playerId) ? 'PLAYER' : 'SPECTATOR', canGuess: state.phase === 'ROUND_ACTIVE' && participating && !solve, solved: Boolean(solve), solveOrder: solve?.solveOrder ?? null, cooldownUntil: state.cooldownUntil[playerId] ?? null, roundPoints: solve?.points ?? 0, attemptCount: state.attemptCounts[playerId] ?? 0, lastAttempt: state.lastAttemptResult[playerId] ?? null };
  },
  resolveAsset(state, request, context) {
    if (state.assetToken !== request.assetToken || state.roundNumber !== request.roundNumber || request.assetId !== 'cry' || !state.targetPokemonId || !state.currentCryVersion) return null;
    return context.pokemonAudio?.cryFor(state.targetPokemonId, state.currentCryVersion) ?? null;
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokemonCryResults(state); },
};
