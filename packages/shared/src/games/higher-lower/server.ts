import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound, resolveWhenRequiredPlayersComplete } from '../infrastructure/timing.js';
import { defaultHigherLowerConfig, higherLowerConfigSchema, type HigherLowerConfig } from './config.js';
import { buildHigherLowerResults, higherLowerAnswer, HIGHER_LOWER_POINTS, pokemonCategoryValue, selectPokemonByDifficulty, streakBonus } from './rules.js';
import { higherLowerActionSchema, type HigherLowerAction, type HigherLowerPlayerState, type HigherLowerPublicState, type HigherLowerState, type HigherLowerStats } from './types.js';

const REVEAL_MS = 3_000;
const manifest = {
  id: 'higher-lower', name: 'Higher or Lower', icon: '📈',
  description: 'Acierta si la stat de dos Pokémon es mayor, menor o igual.', minPlayers: 1,
  profileStats: {
    metrics: [
      { key: 'correct', label: 'Respuestas correctas', aggregation: 'SUM' },
      { key: 'incorrect', label: 'Respuestas incorrectas', aggregation: 'SUM' },
      { key: 'sameCorrect', label: 'SAME acertados', aggregation: 'SUM' },
      { key: 'bestStreak', label: 'Mejor racha', aggregation: 'MAX' },
    ],
    derivedMetrics: [{ key: 'accuracy', label: 'Precisión', kind: 'PERCENT', numerator: 'correct', denominator: ['correct', 'incorrect'] }],
  },
} as const;
function randomItem<T>(items: readonly T[], random: () => number): T { return items[Math.min(Math.floor(random() * items.length), items.length - 1)]!; }
function pokemonView(pokemon: Pokemon, value: number | null) { return { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, value }; }

function beginRound(state: HigherLowerState, context: GameContext): HigherLowerState {
  const pool = context.pokemon.forGenerations(state.config.generations);
  const candidates = pool.filter((entry) => entry.id !== state.previousPokemonId);
  const previous = context.pokemon.byId(state.previousPokemonId)!;
  const category = randomItem(state.config.categories, context.random);
  const current = selectPokemonByDifficulty(previous, candidates, category, state.config.difficulty, context.random);
  return { ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, currentPokemonId: current.id,
    category, answers: {}, roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null };
}
function reveal(state: HigherLowerState, context: GameContext): HigherLowerState {
  if (state.phase !== 'ROUND_ACTIVE' || !state.currentPokemonId || !state.category) return state;
  const previous = context.pokemon.byId(state.previousPokemonId)!; const current = context.pokemon.byId(state.currentPokemonId)!;
  const previousValue = pokemonCategoryValue(previous, state.category); const currentValue = pokemonCategoryValue(current, state.category);
  const correctAnswer = higherLowerAnswer(previousValue, currentValue); const scores = { ...state.scores }; const streaks = { ...state.streaks }; const playerStats = { ...state.playerStats };
  const outcomes = Object.fromEntries(state.playerIds.map((id) => {
    const choice = state.answers[id]?.choice ?? null; const correct = choice === correctAnswer; const streak = correct ? (streaks[id] ?? 0) + 1 : 0;
    const basePoints = correct ? HIGHER_LOWER_POINTS[correctAnswer] : 0; const bonus = correct ? streakBonus(streak) : 0;
    scores[id] = (scores[id] ?? 0) + basePoints + bonus; streaks[id] = streak;
    const prior = playerStats[id]!; playerStats[id] = { correct: prior.correct + (correct ? 1 : 0), incorrect: prior.incorrect + (correct ? 0 : 1), sameCorrect: prior.sameCorrect + (correctAnswer === 'SAME' && correct ? 1 : 0), answered: prior.answered + (choice ? 1 : 0), bestStreak: Math.max(prior.bestStreak, streak) };
    return [id, { choice, correct, basePoints, streakBonus: bonus, awardedPoints: basePoints + bonus, streak }];
  }));
  return { ...state, phase: 'ROUND_RESULTS', scores, streaks, playerStats, roundEndsAt: null, nextTransitionAt: context.now + REVEAL_MS, lastRound: { previousValue, currentValue, correctAnswer, outcomes } };
}
function finish(state: HigherLowerState): HigherLowerState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }
function beginNextRound(state: HigherLowerState, context: GameContext): HigherLowerState { return beginRound({ ...state, previousPokemonId: state.currentPokemonId! }, context); }

export const higherLowerGame: MiniGameModule<HigherLowerConfig, HigherLowerState, HigherLowerAction, HigherLowerPublicState> = {
  manifest, configSchema: higherLowerConfigSchema, actionSchema: higherLowerActionSchema, defaultConfig: defaultHigherLowerConfig,
  createInitialState(config, context) {
    const parsed = higherLowerConfigSchema.parse(config); const pool = context.pokemon.forGenerations(parsed.generations);
    if (pool.length < 2) throw new Error('Se necesitan al menos dos Pokémon en las generaciones seleccionadas.');
    const stats: HigherLowerStats = { correct: 0, incorrect: 0, sameCorrect: 0, answered: 0, bestStreak: 0 };
    return { phase: 'GAME_STARTING', config: parsed, playerIds: context.players.map((p) => p.id), roundNumber: 0, previousPokemonId: randomItem(pool, context.random).id, currentPokemonId: null, category: null, answers: {}, scores: Object.fromEntries(context.players.map((p) => [p.id, 0])), streaks: Object.fromEntries(context.players.map((p) => [p.id, 0])), playerStats: Object.fromEntries(context.players.map((p) => [p.id, { ...stats }])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<HigherLowerState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La ronda no está activa.' };
    if (!state.playerIds.includes(playerId)) return { state, accepted: false, error: 'No participas.' };
    if (!isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No estás conectado como participante.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
    if (state.answers[playerId]) return { state, accepted: false, error: 'Tu respuesta ya está bloqueada.' };
    let next = { ...state, answers: { ...state.answers, [playerId]: { choice: action.choice, answeredAt: context.now } } };
    next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.answers[id]), reveal);
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginNextRound, resolveActive: reveal, finish, isComplete: (current) => current.roundNumber >= current.config.rounds }); },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.answers[id]), reveal); },
  getPublicState(state, context) {
    const revealPhase = state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS'; const previous = context.pokemon.byId(state.previousPokemonId)!; const current = context.pokemon.byId(state.currentPokemonId ?? state.previousPokemonId)!; const category = state.category ?? state.config.categories[0]!;
    const showAnswers = state.config.answerVisibility === 'REALTIME' || revealPhase;
    return { gameId: 'higher-lower', phase: state.phase, playerIds: state.playerIds, roundNumber: state.roundNumber, totalRounds: state.config.rounds, category,
      previousPokemon: pokemonView(previous, revealPhase || state.config.showPreviousValue ? pokemonCategoryValue(previous, category) : null),
      currentPokemon: pokemonView(current, revealPhase ? pokemonCategoryValue(current, category) : null), answers: showAnswers ? state.answers : {}, answeredIds: Object.keys(state.answers), scores: state.scores, streaks: state.streaks, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: revealPhase ? state.lastRound : null, results: state.phase === 'GAME_RESULTS' ? buildHigherLowerResults(state) : null };
  },
  getPlayerState(state, playerId): HigherLowerPlayerState { return { canAnswer: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && !state.answers[playerId], answer: state.answers[playerId] ?? null }; },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; }, getResults(state) { return buildHigherLowerResults(state); },
};
