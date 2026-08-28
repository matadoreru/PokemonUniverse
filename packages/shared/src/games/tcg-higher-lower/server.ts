import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound, resolveWhenRequiredPlayersComplete } from '../infrastructure/timing.js';
import { defaultTcgHigherLowerConfig, tcgHigherLowerConfigSchema, type TcgHigherLowerConfig } from './config.js';
import { buildTcgHigherLowerResults, tcgPriceComparison } from './rules.js';
import { tcgHigherLowerActionSchema, type TcgCardPublicView, type TcgHigherLowerAction, type TcgHigherLowerPlayerState, type TcgHigherLowerPublicState, type TcgHigherLowerState, type TcgHigherLowerStats } from './types.js';
import type { TcgComparableCard } from '../../tcg/types.js';

const REVEAL_MS = 3_000;
const manifest = {
  id: 'tcg-higher-lower', name: 'Higher or Lower: Cartas', icon: '🃏', recommended: true,
  description: 'Compara el precio actual de dos cartas Pokémon TCG.', minPlayers: 1,
  profileStats: { metrics: [
    { key: 'comparisons', label: 'Comparaciones', aggregation: 'SUM' },
    { key: 'correct', label: 'Aciertos', aggregation: 'SUM' },
    { key: 'incorrect', label: 'Errores', aggregation: 'SUM' },
    { key: 'sameCorrect', label: 'Igualdades acertadas', aggregation: 'SUM' },
    { key: 'bestStreak', label: 'Mejor racha', aggregation: 'MAX' },
  ], derivedMetrics: [{ key: 'accuracy', label: 'Precisión', kind: 'PERCENT', numerator: 'correct', denominator: ['correct', 'incorrect'] }] },
} as const;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) { const other = Math.min(index, Math.floor(random() * (index + 1))); [result[index], result[other]] = [result[other]!, result[index]!]; }
  return result;
}

function sequenceFor(pool: readonly TcgComparableCard[], length: number, random: () => number): TcgComparableCard[] {
  const result: TcgComparableCard[] = [];
  while (result.length < length) {
    const batch = shuffle(pool, random);
    if (result.length && batch[0]?.id === result.at(-1)?.id) {
      const replacement = batch.findIndex((card) => card.id !== result.at(-1)?.id);
      [batch[0], batch[replacement]] = [batch[replacement]!, batch[0]!];
    }
    for (const card of batch) { if (result.length >= length) break; if (card.id !== result.at(-1)?.id) result.push({ ...card }); }
  }
  return result;
}

function beginRound(state: TcgHigherLowerState, context: GameContext): TcgHigherLowerState {
  return { ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, answers: {}, roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null };
}

function reveal(state: TcgHigherLowerState, context: GameContext): TcgHigherLowerState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const previous = state.sequence[state.roundNumber - 1]!; const current = state.sequence[state.roundNumber]!;
  const correctAnswer = tcgPriceComparison(previous.price, current.price); const scores = { ...state.scores }; const streaks = { ...state.streaks }; const playerStats = { ...state.playerStats };
  const outcomes = Object.fromEntries(state.playerIds.map((id) => {
    const choice = state.answers[id]?.choice ?? null; const correct = choice === correctAnswer; const streak = correct ? (streaks[id] ?? 0) + 1 : 0;
    const awardedPoints = correct ? correctAnswer === 'SAME' ? 2 : 1 : 0; scores[id] = (scores[id] ?? 0) + awardedPoints; streaks[id] = streak;
    const prior = playerStats[id]!; playerStats[id] = { comparisons: prior.comparisons + 1, correct: prior.correct + Number(correct), incorrect: prior.incorrect + Number(!correct), sameCorrect: prior.sameCorrect + Number(correct && correctAnswer === 'SAME'), answered: prior.answered + Number(choice !== null), bestStreak: Math.max(prior.bestStreak, streak) };
    return [id, { choice, correct, awardedPoints, streak }];
  }));
  return { ...state, phase: 'ROUND_RESULTS', scores, streaks, playerStats, roundEndsAt: null, nextTransitionAt: context.now + REVEAL_MS,
    lastRound: { previousPrice: previous.price, currentPrice: current.price, correctAnswer, outcomes } };
}

function finish(state: TcgHigherLowerState): TcgHigherLowerState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }
function cardView(card: TcgComparableCard, price: string | null): TcgCardPublicView { return { id: card.id, name: card.name, localId: card.localId, setId: card.setId, setName: card.setName, rarity: card.rarity, imageUrl: card.imageUrl, price }; }

export const tcgHigherLowerGame: MiniGameModule<TcgHigherLowerConfig, TcgHigherLowerState, TcgHigherLowerAction, TcgHigherLowerPublicState> = {
  manifest, configSchema: tcgHigherLowerConfigSchema, actionSchema: tcgHigherLowerActionSchema, defaultConfig: defaultTcgHigherLowerConfig,
  createInitialState(config, context) {
    const parsed = tcgHigherLowerConfigSchema.parse(config); const pool = context.tcgCards?.cardsFor(parsed) ?? [];
    if (pool.length < 2) throw new Error('No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros. Ajusta los sets, rarezas o precios.');
    const empty: TcgHigherLowerStats = { comparisons: 0, correct: 0, incorrect: 0, sameCorrect: 0, answered: 0, bestStreak: 0 };
    return { phase: 'GAME_STARTING', config: parsed, playerIds: context.players.map(({ id }) => id), sequence: sequenceFor(pool, parsed.rounds + 1, context.random), roundNumber: 0, answers: {}, scores: Object.fromEntries(context.players.map(({ id }) => [id, 0])), streaks: Object.fromEntries(context.players.map(({ id }) => [id, 0])), playerStats: Object.fromEntries(context.players.map(({ id }) => [id, { ...empty }])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start: beginRound,
  handleAction(state, playerId, action, context): GameActionResult<TcgHigherLowerState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La comparación no está activa.' };
    if (!state.playerIds.includes(playerId)) return { state, accepted: false, error: 'No participas en esta partida.' };
    if (!isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No estás conectado como participante.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
    if (state.answers[playerId]) return { state, accepted: false, error: 'Tu respuesta ya está bloqueada.' };
    let next = { ...state, answers: { ...state.answers, [playerId]: { choice: action.choice, answeredAt: context.now } } };
    next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.answers[id]), reveal);
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginRound, resolveActive: reveal, finish, isComplete: (current) => current.roundNumber >= current.config.rounds }); },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.answers[id]), reveal); },
  getPublicState(state) {
    const revealPhase = state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS'; const previous = state.sequence[Math.max(0, state.roundNumber - 1)]!; const current = state.sequence[Math.max(1, state.roundNumber)]!;
    return { gameId: 'tcg-higher-lower', phase: state.phase, playerIds: state.playerIds, roundNumber: state.roundNumber, totalRounds: state.config.rounds, currency: previous.currency,
      previousCard: cardView(previous, previous.price), currentCard: cardView(current, revealPhase ? current.price : null), answeredIds: Object.keys(state.answers), scores: state.scores, streaks: state.streaks, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: revealPhase ? state.lastRound : null, results: state.phase === 'GAME_RESULTS' ? buildTcgHigherLowerResults(state) : null };
  },
  getPlayerState(state, playerId): TcgHigherLowerPlayerState { return { canAnswer: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && !state.answers[playerId], answer: state.answers[playerId] ?? null }; },
  isFinished: (state) => state.phase === 'GAME_RESULTS', getResults: buildTcgHigherLowerResults,
};
