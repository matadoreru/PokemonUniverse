import { connectedRequiredPlayerIds, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultTypeDuelConfig, typeDuelConfigSchema, type TypeDuelConfig } from './config.js';
import { buildTypeDuelResults, chooseBalancedPair, isValidPokemonForTypes, requiredTypeCombination, TYPE_DUEL_ATTEMPT_COOLDOWN_MS, TYPE_DUEL_MAX_SOLUTIONS, TYPE_DUEL_WIN_POINTS } from './rules.js';
import { typeDuelActionSchema, type TypeDuelAction, type TypeDuelPlayerState, type TypeDuelPublicState, type TypeDuelRoundResult, type TypeDuelState, type TypeDuelStats } from './types.js';
const TYPE_REVEAL_MS = 2_000; const INVALID_COMBINATION_MS = 3_000; export const TYPE_DUEL_RESULT_MS = 10_000;
const manifest = {
  id: 'type-duel', name: 'Type Duel', icon: '⚔️',
  description: 'Elige un tipo en secreto y corre contra otro entrenador para encontrar la combinación exacta.', minPlayers: 2,
  profileStats: {
    metrics: [
      { key: 'duelsPlayed', label: 'Duelos jugados', aggregation: 'SUM' },
      { key: 'duelsWon', label: 'Duelos ganados', aggregation: 'SUM' },
      { key: 'correctAttempts', label: 'Intentos correctos', aggregation: 'SUM' },
      { key: 'incorrectAttempts', label: 'Intentos incorrectos', aggregation: 'SUM' },
      { key: 'correctTimeTotalMs', label: 'Tiempo total al acertar', aggregation: 'SUM', format: 'DURATION_MS' },
    ],
    derivedMetrics: [
      { key: 'duelWinRate', label: 'Winrate de duelos', kind: 'PERCENT', numerator: 'duelsWon', denominator: ['duelsPlayed'] },
      { key: 'averageCorrectTime', label: 'Tiempo medio de acierto', kind: 'AVERAGE', numerator: 'correctTimeTotalMs', denominator: ['correctAttempts'], format: 'DURATION_MS' },
    ],
  },
} as const;
function selectPlayers(state: TypeDuelState, context: GameContext): TypeDuelState {
  const availablePlayerIds = connectedRequiredPlayerIds(context, state.playerIds);
  if (availablePlayerIds.length < 2) return finish(state);
  const participants = chooseBalancedPair(availablePlayerIds, state.participationCounts, state.lastPair, context.random);
  const counts = { ...state.participationCounts }; for (const id of participants) counts[id] = (counts[id] ?? 0) + 1;
  return { ...state, phase: 'SELECTING_TYPES', roundNumber: state.completedRounds + 1, participants, participationCounts: counts, lastPair: participants, typeSelections: {}, requiredTypes: null, validPokemonIds: [], attempts: [], cooldownUntil: {}, roundStartedAt: context.now, roundEndsAt: context.now + state.config.typeSelectSeconds * 1_000, nextTransitionAt: null, lastRound: null };
}
function resolveTypes(state: TypeDuelState, context: GameContext): TypeDuelState {
  const [a, b] = state.participants; const typeA = state.typeSelections[a]!; const typeB = state.typeSelections[b]!;
  const valid = context.pokemon.forGenerations(state.config.generations, { includeForms: true }).filter((pokemon) => isValidPokemonForTypes(pokemon, typeA, typeB));
  return { ...state, phase: valid.length ? 'TYPE_REVEAL' : 'INVALID_COMBINATION', requiredTypes: requiredTypeCombination(typeA, typeB), validPokemonIds: valid.map((p) => p.id), roundEndsAt: null, nextTransitionAt: context.now + (valid.length ? TYPE_REVEAL_MS : INVALID_COMBINATION_MS) };
}
function beginSearch(state: TypeDuelState, context: GameContext): TypeDuelState { return { ...state, phase: 'POKEMON_SEARCH', attempts: [], cooldownUntil: {}, roundStartedAt: context.now, roundEndsAt: context.now + state.config.searchSeconds * 1_000, nextTransitionAt: null }; }
function roundResult(state: TypeDuelState, context: GameContext, reason: TypeDuelRoundResult['reason'], winnerId: string | null): TypeDuelState {
  const canceled = reason === 'TYPE_TIMEOUT' || reason === 'DISCONNECTED';
  const completed = canceled ? state.completedRounds : state.completedRounds + 1; const stats = { ...state.playerStats }; const scores = { ...state.scores };
  if (!canceled) for (const id of state.participants) stats[id] = { ...stats[id]!, duelsPlayed: stats[id]!.duelsPlayed + 1, duelsWon: stats[id]!.duelsWon + (id === winnerId ? 1 : 0) };
  if (winnerId) scores[winnerId] = (scores[winnerId] ?? 0) + TYPE_DUEL_WIN_POINTS;
  const winningPokemonIds = new Set(state.attempts.filter((attempt) => attempt.correct).map((attempt) => attempt.pokemonId));
  const showSolutions = reason === 'TIMEOUT' || reason === 'WINNER';
  const solutions = showSolutions ? state.validPokemonIds.filter((id) => !winningPokemonIds.has(id)).slice(0, TYPE_DUEL_MAX_SOLUTIONS).map((id) => context.pokemon.byId(id)!).map(({ id, name, sprite }) => ({ id, name, sprite })) : [];
  return { ...state, phase: 'ROUND_RESULTS', completedRounds: completed, scores, playerStats: stats, roundEndsAt: null, nextTransitionAt: context.now + TYPE_DUEL_RESULT_MS, lastRound: { reason, winnerId, attempts: [...state.attempts], solutions, requiredTypes: state.requiredTypes } };
}
function finish(state: TypeDuelState): TypeDuelState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }
function advanceAfterResult(state: TypeDuelState, context: GameContext): TypeDuelState { return state.completedRounds >= state.config.rounds ? finish(state) : selectPlayers(state, context); }
export const typeDuelGame: MiniGameModule<TypeDuelConfig, TypeDuelState, TypeDuelAction, TypeDuelPublicState> = {
  manifest, configSchema: typeDuelConfigSchema, actionSchema: typeDuelActionSchema, defaultConfig: defaultTypeDuelConfig,
  createInitialState(config, context) {
    const parsed = typeDuelConfigSchema.parse(config); if (context.players.length < 2) throw new Error('Se necesitan dos jugadores.');
    const stats: TypeDuelStats = { duelsPlayed: 0, duelsWon: 0, correctAttempts: 0, incorrectAttempts: 0, correctTimeTotalMs: 0 };
    return { phase: 'GAME_STARTING', config: parsed, playerIds: context.players.map((p) => p.id), completedRounds: 0, roundNumber: 0, participants: [context.players[0]!.id, context.players[1]!.id], participationCounts: Object.fromEntries(context.players.map((p) => [p.id, 0])), lastPair: null, typeSelections: {}, requiredTypes: null, validPokemonIds: [], attempts: [], cooldownUntil: {}, scores: Object.fromEntries(context.players.map((p) => [p.id, 0])), playerStats: Object.fromEntries(context.players.map((p) => [p.id, { ...stats }])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start(state, context) { return selectPlayers(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<TypeDuelState> {
    if (action.type === 'CONTINUE') {
      if (state.phase !== 'ROUND_RESULTS') return { state, accepted: false, error: 'No hay ningún resultado que avanzar.' };
      if (!context.hostId || context.hostId !== playerId) return { state, accepted: false, error: 'Solo el Host puede avanzar la ronda.' };
      return { state: advanceAfterResult(state, context), accepted: true };
    }
    if (!state.participants.includes(playerId)) return { state, accepted: false, error: 'Observas este duelo.' };
    if (!isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No estás conectado como participante.' };
    if (action.type === 'SELECT_TYPE') {
      if (state.phase !== 'SELECTING_TYPES') return { state, accepted: false, error: 'No se están eligiendo tipos.' };
      if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
      if (state.typeSelections[playerId]) return { state, accepted: false, error: 'Tu tipo ya está bloqueado.' };
      let next = { ...state, typeSelections: { ...state.typeSelections, [playerId]: action.pokemonType } };
      if (next.participants.every((id) => next.typeSelections[id])) next = resolveTypes(next, context);
      return { state: next, accepted: true };
    }
    if (state.phase !== 'POKEMON_SEARCH') return { state, accepted: false, error: 'La carrera no está activa.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
    if (context.now < (state.cooldownUntil[playerId] ?? 0)) return { state, accepted: false, error: `Espera ${((state.cooldownUntil[playerId]! - context.now) / 1_000).toFixed(1)}s antes de intentarlo.` };
    const pokemon = context.pokemon.byId(action.pokemonId); if (!pokemon || !state.config.generations.includes(pokemon.generation)) return { state, accepted: false, error: 'Pokémon fuera del pool.' };
    const correct = state.validPokemonIds.includes(pokemon.id); const attempt = { playerId, pokemonId: pokemon.id, pokemonName: pokemon.name, sprite: pokemon.sprite, correct, attemptedAt: context.now }; const prior = state.playerStats[playerId]!;
    let next: TypeDuelState = { ...state, attempts: [...state.attempts, attempt], cooldownUntil: correct ? state.cooldownUntil : { ...state.cooldownUntil, [playerId]: context.now + TYPE_DUEL_ATTEMPT_COOLDOWN_MS }, playerStats: { ...state.playerStats, [playerId]: { ...prior, correctAttempts: prior.correctAttempts + (correct ? 1 : 0), incorrectAttempts: prior.incorrectAttempts + (correct ? 0 : 1), correctTimeTotalMs: prior.correctTimeTotalMs + (correct ? context.now - (state.roundStartedAt ?? context.now) : 0) } } };
    if (correct) next = roundResult(next, context, 'WINNER', playerId);
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'SELECTING_TYPES' && context.now >= (state.roundEndsAt ?? Infinity)) {
      const playersWhoSelected = state.participants.filter((playerId) => Boolean(state.typeSelections[playerId]));
      return playersWhoSelected.length === 1
        ? roundResult(state, context, 'TYPE_FORFEIT', playersWhoSelected[0]!)
        : roundResult(state, context, 'TYPE_TIMEOUT', null);
    }
    if (state.phase === 'TYPE_REVEAL' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginSearch(state, context);
    if (state.phase === 'INVALID_COMBINATION' && context.now >= (state.nextTransitionAt ?? Infinity)) return { ...state, phase: 'SELECTING_TYPES', typeSelections: {}, requiredTypes: null, validPokemonIds: [], roundStartedAt: context.now, roundEndsAt: context.now + state.config.typeSelectSeconds * 1_000, nextTransitionAt: null };
    if (state.phase === 'POKEMON_SEARCH' && context.now >= (state.roundEndsAt ?? Infinity)) return roundResult(state, context, 'TIMEOUT', null);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return advanceAfterResult(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase === 'SELECTING_TYPES' || state.phase === 'TYPE_REVEAL' || state.phase === 'INVALID_COMBINATION' || state.phase === 'POKEMON_SEARCH') {
      if (state.participants.some((playerId) => !isPlayerRequired(context, playerId))) return roundResult(state, context, 'DISCONNECTED', null);
    }
    return state;
  },
  getPublicState(state) {
    const reveal = state.participants.every((id) => Boolean(state.typeSelections[id])) && state.phase !== 'SELECTING_TYPES';
    return { gameId: 'type-duel', phase: state.phase, playerIds: state.playerIds, completedRounds: state.completedRounds, roundNumber: state.roundNumber, totalRounds: state.config.rounds, participants: state.participants, participationCounts: state.participationCounts, typeSelectionCompletedIds: Object.keys(state.typeSelections), revealedTypes: reveal ? state.typeSelections : {}, requiredTypes: reveal ? state.requiredTypes : null, attempts: state.attempts, scores: state.scores, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS' ? state.lastRound : null, results: state.phase === 'GAME_RESULTS' ? buildTypeDuelResults(state) : null };
  },
  getPlayerState(state, playerId): TypeDuelPlayerState { const participant = state.participants.includes(playerId); return { participant, ownType: state.typeSelections[playerId] ?? null, canSelectType: participant && state.phase === 'SELECTING_TYPES' && !state.typeSelections[playerId], canAttempt: participant && state.phase === 'POKEMON_SEARCH', cooldownUntil: state.cooldownUntil[playerId] ?? 0 }; },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; }, getResults(state) { return buildTypeDuelResults(state); },
};
