import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound, cooldownMessage, cooldownRemainingMs, resolveWhenRequiredPlayersComplete, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultPokemonPaletteGuessConfig, pokemonPaletteGuessConfigSchema, type PokemonPaletteGuessConfig } from './config.js';
import { buildPokemonPaletteResults, emptyPokemonPaletteStats, pokemonPaletteScore } from './rules.js';
import { pokemonPaletteGuessActionSchema, type PokemonPaletteGuessAction, type PokemonPaletteGuessPlayerState, type PokemonPaletteGuessPublicState, type PokemonPaletteGuessState } from './types.js';

export const POKEMON_PALETTE_COOLDOWN_MS = 1_000;
export const POKEMON_PALETTE_REVEAL_MS = 4_000;
const manifest = {
  id: 'pokemon-palette-guess', name: 'Adivina por la Paleta', icon: '🎨', recommended: true,
  description: 'Reconoce al Pokémon usando únicamente los colores dominantes de su sprite.', minPlayers: 1, maxPlayers: 12,
  profileStats: { metrics: [
    { key: 'correct', label: 'Paletas acertadas', aggregation: 'SUM' as const }, { key: 'missed', label: 'Paletas no acertadas', aggregation: 'SUM' as const }, { key: 'totalAttempts', label: 'Intentos', aggregation: 'SUM' as const }, { key: 'firstTry', label: 'A la primera', aggregation: 'SUM' as const }, { key: 'roundFirsts', label: 'Primeros puestos', aggregation: 'SUM' as const }, { key: 'solveTimeTotalMs', label: 'Tiempo total', aggregation: 'SUM' as const, format: 'DURATION_MS' as const }, { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const }, { key: 'pointsFromRounds', label: 'Puntos', aggregation: 'SUM' as const },
  ], derivedMetrics: [{ key: 'accuracy', label: 'Precisión', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['totalAttempts'] }, { key: 'averageSolveTime', label: 'Tiempo medio', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const }] },
} as const;

const revealPokemon = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite });
export function pokemonPalettePool(config: PokemonPaletteGuessConfig, context: GameContext): Pokemon[] {
  return context.pokemon.forGenerations(config.generations).filter((pokemon) => pokemon.id && pokemon.name && pokemon.sprite && (pokemon.palette?.length ?? 0) >= config.paletteSize);
}
function beginRound(state: PokemonPaletteGuessState, context: GameContext): PokemonPaletteGuessState {
  const pool = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon)); let candidates = pool.filter((pokemon) => !state.usedPokemonIds.includes(pokemon.id)); if (!candidates.length) candidates = pool;
  if (!candidates.length) throw new Error('No hay paletas persistidas para esta configuración.'); const target = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)]!;
  return { ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, targetPokemonId: target.id, usedPokemonIds: [...new Set([...state.usedPokemonIds, target.id])], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {}, roundStartedAt: context.now, roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null };
}
function resolveRound(state: PokemonPaletteGuessState, context: GameContext): PokemonPaletteGuessState {
  if (state.phase !== 'ROUND_ACTIVE') return state; const target = context.pokemon.byId(state.targetPokemonId ?? ''); if (!target?.palette) throw new Error('La paleta objetivo ya no está disponible.');
  const playerStats = { ...state.playerStats }; for (const playerId of state.playerIds) if (!state.solves[playerId]) { const stats = playerStats[playerId] ?? emptyPokemonPaletteStats(); playerStats[playerId] = { ...stats, missed: stats.missed + 1 }; }
  return { ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + POKEMON_PALETTE_REVEAL_MS, lastRound: { pokemon: { ...revealPokemon(target), generation: target.generation }, palette: [...target.palette].slice(0, state.config.paletteSize), solves: { ...state.solves }, attemptCounts: { ...state.attemptCounts } } };
}
const finish = (state: PokemonPaletteGuessState): PokemonPaletteGuessState => ({ ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null });

export const pokemonPaletteGuessGame: MiniGameModule<PokemonPaletteGuessConfig, PokemonPaletteGuessState, PokemonPaletteGuessAction, PokemonPaletteGuessPublicState> = {
  manifest, configSchema: pokemonPaletteGuessConfigSchema, actionSchema: pokemonPaletteGuessActionSchema, defaultConfig: defaultPokemonPaletteGuessConfig,
  createInitialState(config, context) {
    const parsed = pokemonPaletteGuessConfigSchema.parse(config); const pool = pokemonPalettePool(parsed, context); if (!pool.length) throw new Error('No hay suficientes paletas en PostgreSQL para las generaciones y tamaño seleccionados. Ejecuta la sincronización Pokémon.');
    const playerIds = context.players.map((player) => player.id); return { phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), roundNumber: 0, targetPokemonId: null, usedPokemonIds: [], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {}, scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyPokemonPaletteStats()])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<PokemonPaletteGuessState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' }; if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' }; if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' }; if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'El tiempo ha terminado.' }; if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId); if (!guessed || !state.poolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const attempts = (state.attemptCounts[playerId] ?? 0) + 1; const stats = state.playerStats[playerId] ?? emptyPokemonPaletteStats();
    if (guessed.id === state.targetPokemonId) {
      const solveOrder = Object.keys(state.solves).length + 1; const elapsedMs = context.now - state.roundStartedAt!; const score = pokemonPaletteScore(state.roundStartedAt!, state.config.roundSeconds, context.now, solveOrder);
      let next: PokemonPaletteGuessState = { ...state, attemptCounts: { ...state.attemptCounts, [playerId]: attempts }, solves: { ...state.solves, [playerId]: { solveOrder, solvedAt: context.now, elapsedMs, speedPoints: score.speedPoints, placementBonus: score.placementBonus, points: score.totalPoints, attempts } }, lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'CORRECT', attemptedAt: context.now } }, scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + score.totalPoints }, playerStats: { ...state.playerStats, [playerId]: { ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1, firstTry: stats.firstTry + (attempts === 1 ? 1 : 0), roundFirsts: stats.roundFirsts + (solveOrder === 1 ? 1 : 0), solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs, bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs), pointsFromRounds: stats.pointsFromRounds + score.totalPoints } } };
      next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.solves[id]), resolveRound); return { state: next, accepted: true };
    }
    return { accepted: true, state: { ...state, attempts: [...state.attempts, { playerId, guessedPokemon: revealPokemon(guessed), attemptedAt: context.now }], attemptCounts: { ...state.attemptCounts, [playerId]: attempts }, cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, context.now, POKEMON_PALETTE_COOLDOWN_MS), lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'INCORRECT', attemptedAt: context.now } }, playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } } } };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginRound, resolveActive: resolveRound, finish, isComplete: (current) => current.roundNumber >= current.config.rounds }); },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.solves[id]), resolveRound); },
  getPublicState(state, context) {
    const target = context.pokemon.byId(state.targetPokemonId ?? ''); const reveal = state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS';
    return { gameId: 'pokemon-palette-guess', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds, colors: state.phase === 'ROUND_ACTIVE' ? [...(target?.palette ?? [])].slice(0, state.config.paletteSize) : state.lastRound?.palette ?? [], attempts: state.attempts, solvedPlayers: Object.entries(state.solves).map(([playerId, solve]) => ({ playerId, solveOrder: solve.solveOrder })).sort((left, right) => left.solveOrder - right.solveOrder), scores: state.scores, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: state.lastRound && reveal ? { pokemon: { name: state.lastRound.pokemon.name, sprite: state.lastRound.pokemon.sprite, generation: state.lastRound.pokemon.generation }, palette: state.lastRound.palette, solves: state.lastRound.solves, attemptCounts: state.lastRound.attemptCounts } : null, results: state.phase === 'GAME_RESULTS' ? buildPokemonPaletteResults(state) : null };
  },
  getPlayerState(state, playerId, context): PokemonPaletteGuessPlayerState { const solve = state.solves[playerId]; const participant = state.playerIds.includes(playerId); return { role: participant ? 'PLAYER' : 'SPECTATOR', canGuess: state.phase === 'ROUND_ACTIVE' && participant && isPlayerRequired(context, playerId) && !solve, solved: Boolean(solve), solveOrder: solve?.solveOrder ?? null, cooldownUntil: state.cooldownUntil[playerId] ?? null, roundPoints: solve?.points ?? 0, attemptCount: state.attemptCounts[playerId] ?? 0, lastAttempt: state.lastAttemptResult[playerId] ?? null }; },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; }, getResults(state) { return buildPokemonPaletteResults(state); },
};
