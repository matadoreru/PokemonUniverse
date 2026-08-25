import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound, cooldownMessage, cooldownRemainingMs, resolveWhenRequiredPlayersComplete, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultGuessFromStatsConfig, guessFromStatsConfigSchema, type GuessFromStatsConfig } from './config.js';
import { buildGuessFromStatsHints, buildGuessFromStatsResults, buildGuessFromStatsSignature, buildGuessFromStatsVisibleStats, emptyGuessFromStatsPlayerStats, guessFromStatsRoundPoints, hasGuessFromStatsHintData, pokemonBaseStatTotal } from './rules.js';
import { guessFromStatsActionSchema, type GuessFromStatsAction, type GuessFromStatsPlayerState, type GuessFromStatsPokemonReveal, type GuessFromStatsPreparedRound, type GuessFromStatsPublicSolve, type GuessFromStatsPublicState, type GuessFromStatsRoundResult, type GuessFromStatsState } from './types.js';

export const GUESS_FROM_STATS_COOLDOWN_MS = 1_000;
export const GUESS_FROM_STATS_REVEAL_MS = 4_000;
export const GUESS_FROM_STATS_MAX_RECENT_ATTEMPTS = 48;

const manifest = {
  id: 'guess-from-stats', name: 'Guess from Stats', icon: '📊', description: 'Reconoce Pokémon por sus estadísticas base y resuelve antes que tus rivales.', minPlayers: 2, maxPlayers: 8,
  profileStats: {
    metrics: [
      { key: 'correct', label: 'Pokémon acertados', aggregation: 'SUM' as const }, { key: 'missed', label: 'Pokémon no acertados', aggregation: 'SUM' as const },
      { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' as const }, { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' as const },
      { key: 'roundFirsts', label: 'Primeras posiciones', aggregation: 'SUM' as const }, { key: 'solveTimeTotalMs', label: 'Tiempo total en aciertos', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
      { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const }, { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'solveRate', label: 'Tasa de resolución', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['correct', 'missed'] },
      { key: 'guessAccuracy', label: 'Precisión de intentos', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['totalAttempts'] },
      { key: 'averageSolveTime', label: 'Tiempo medio de resolución', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const },
    ],
  },
};

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) { const swap = Math.min(Math.floor(random() * (index + 1)), index); [result[index], result[swap]] = [result[swap]!, result[index]!]; }
  return result;
}

function validBaseStats(pokemon: Pokemon): boolean {
  return [pokemon.hp, pokemon.attack, pokemon.defense, pokemon.specialAttack, pokemon.specialDefense, pokemon.speed].every((value) => Number.isFinite(value) && value >= 0);
}

export function guessFromStatsPool(config: GuessFromStatsConfig, context: GameContext): Pokemon[] {
  return context.pokemon.forGenerations(config.generations, { includeForms: true }).filter((pokemon) => validBaseStats(pokemon) && hasGuessFromStatsHintData(pokemon, config));
}

export function prepareGuessFromStatsRoundDeck(config: GuessFromStatsConfig, context: GameContext): GuessFromStatsPreparedRound[] {
  const allowed = guessFromStatsPool(config, context); if (allowed.length < 2) throw new Error('No hay suficientes Pokémon con estadísticas válidas para esta configuración.');
  const bySignature = new Map<string, string[]>();
  for (const pokemon of allowed) { const signature = buildGuessFromStatsSignature(pokemon, config); bySignature.set(signature, [...(bySignature.get(signature) ?? []), pokemon.id]); }
  const deck: GuessFromStatsPreparedRound[] = [];
  while (deck.length < config.rounds) {
    for (const source of shuffle(allowed, context.random)) {
      const signature = buildGuessFromStatsSignature(source, config); const acceptedPokemonIds = bySignature.get(signature) ?? [];
      if (!acceptedPokemonIds.length) continue;
      deck.push({ sourcePokemonId: source.id, signature, acceptedPokemonIds: [...acceptedPokemonIds], visibleStats: buildGuessFromStatsVisibleStats(source, config), hints: buildGuessFromStatsHints(source, config) });
      context.preloadImage?.(source.sprite); if (deck.length >= config.rounds) break;
    }
  }
  return deck;
}

function activeRound(state: GuessFromStatsState): GuessFromStatsPreparedRound | null { return state.roundDeck[state.roundNumber - 1] ?? null; }
const summary = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite });
const reveal = (pokemon: Pokemon): GuessFromStatsPokemonReveal => ({ ...summary(pokemon), generation: pokemon.generation, types: [...pokemon.types], hp: pokemon.hp, attack: pokemon.attack, defense: pokemon.defense, specialAttack: pokemon.specialAttack, specialDefense: pokemon.specialDefense, speed: pokemon.speed, bst: pokemonBaseStatTotal(pokemon) });

function beginRound(state: GuessFromStatsState, context: GameContext): GuessFromStatsState {
  const roundNumber = state.roundNumber + 1; if (!state.roundDeck[roundNumber - 1]) throw new Error('No se pudo preparar la siguiente ronda de estadísticas.');
  return { ...state, phase: 'ROUND_ACTIVE', roundNumber, attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {}, roundStartedAt: context.now, roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null };
}

function roundSolves(state: GuessFromStatsState, context: GameContext): Record<string, GuessFromStatsPublicSolve> {
  return Object.fromEntries(Object.entries(state.solves).flatMap(([playerId, solve]) => { const pokemon = context.pokemon.byId(solve.submittedPokemonId); return pokemon ? [[playerId, { solveOrder: solve.solveOrder, solvedAt: solve.solvedAt, elapsedMs: solve.elapsedMs, points: solve.points, attempts: solve.attempts, submittedPokemon: summary(pokemon) }]] : []; }));
}

function resolveRound(state: GuessFromStatsState, context: GameContext): GuessFromStatsState {
  if (state.phase !== 'ROUND_ACTIVE') return state; const prepared = activeRound(state); if (!prepared) throw new Error('La ronda ya no está disponible.');
  const answers = prepared.acceptedPokemonIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon)).map(reveal);
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) if (!state.solves[playerId]) { const stats = playerStats[playerId] ?? emptyGuessFromStatsPlayerStats(); playerStats[playerId] = { ...stats, missed: stats.missed + 1 }; }
  const lastRound: GuessFromStatsRoundResult = { answers, visibleStats: prepared.visibleStats, hints: prepared.hints, solves: roundSolves(state, context), attemptCounts: { ...state.attemptCounts } };
  return { ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + GUESS_FROM_STATS_REVEAL_MS, lastRound };
}

function finish(state: GuessFromStatsState): GuessFromStatsState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }

export const guessFromStatsGame: MiniGameModule<GuessFromStatsConfig, GuessFromStatsState, GuessFromStatsAction, GuessFromStatsPublicState> = {
  manifest, configSchema: guessFromStatsConfigSchema, actionSchema: guessFromStatsActionSchema, defaultConfig: defaultGuessFromStatsConfig,
  createInitialState(config, context) {
    const parsed = guessFromStatsConfigSchema.parse(config); if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const playerIds = context.players.map((player) => player.id); const pool = guessFromStatsPool(parsed, context);
    return { phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), roundDeck: prepareGuessFromStatsRoundDeck(parsed, context), roundNumber: 0, attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {}, scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyGuessFromStatsPlayerStats()])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<GuessFromStatsState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId); if (!guessed || !state.poolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const prepared = activeRound(state); if (!prepared) return { state, accepted: false, error: 'La respuesta no está disponible.' };
    const attemptCount = (state.attemptCounts[playerId] ?? 0) + 1; const stats = state.playerStats[playerId] ?? emptyGuessFromStatsPlayerStats();
    if (prepared.acceptedPokemonIds.includes(guessed.id)) {
      const solveOrder = Object.keys(state.solves).length + 1; const points = guessFromStatsRoundPoints(state.playerIds.length, solveOrder); const elapsedMs = context.now - state.roundStartedAt!;
      let next: GuessFromStatsState = { ...state, attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount }, solves: { ...state.solves, [playerId]: { solveOrder, solvedAt: context.now, elapsedMs, points, attempts: attemptCount, submittedPokemonId: guessed.id } }, lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'CORRECT', attemptedAt: context.now } }, scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + points }, playerStats: { ...state.playerStats, [playerId]: { ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1, firstTry: stats.firstTry + (attemptCount === 1 ? 1 : 0), roundFirsts: stats.roundFirsts + (solveOrder === 1 ? 1 : 0), solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs, bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs), pointsFromRounds: stats.pointsFromRounds + points } } };
      next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.solves[id]), resolveRound);
      return { state: next, accepted: true };
    }
    return { accepted: true, state: { ...state, attempts: [...state.attempts, { playerId, guessedPokemon: summary(guessed), attemptedAt: context.now }].slice(-GUESS_FROM_STATS_MAX_RECENT_ATTEMPTS), attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount }, cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, context.now, GUESS_FROM_STATS_COOLDOWN_MS), lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'INCORRECT', attemptedAt: context.now } }, playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } } } };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginRound, resolveActive: resolveRound, finish, isComplete: (current) => current.roundNumber >= current.config.rounds }); },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.solves[id]), resolveRound); },
  getPublicState(state) {
    const prepared = activeRound(state); const active = state.phase === 'ROUND_ACTIVE';
    return { gameId: 'guess-from-stats', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds, visibleStats: active ? prepared?.visibleStats ?? [] : [], hints: active ? prepared?.hints ?? [] : [], attempts: state.attempts, solvedPlayers: Object.entries(state.solves).map(([playerId, solve]) => ({ playerId, solveOrder: solve.solveOrder })).sort((a, b) => a.solveOrder - b.solveOrder), scores: state.scores, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS' ? state.lastRound : null, results: state.phase === 'GAME_RESULTS' ? buildGuessFromStatsResults(state) : null };
  },
  getPlayerState(state, playerId, context): GuessFromStatsPlayerState {
    const solve = state.solves[playerId]; return { canGuess: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && isPlayerRequired(context, playerId) && !solve, solved: Boolean(solve), solveOrder: solve?.solveOrder ?? null, cooldownUntil: state.cooldownUntil[playerId] ?? null, roundPoints: solve?.points ?? 0, attemptCount: state.attemptCounts[playerId] ?? 0, lastAttempt: state.lastAttemptResult[playerId] ?? null };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; }, getResults(state) { return buildGuessFromStatsResults(state); },
};
