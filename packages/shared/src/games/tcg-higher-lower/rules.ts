import { buildRankedResults } from '../../scoring.js';
import { compareTcgPrices } from './config.js';
import type { TcgHigherLowerChoice, TcgHigherLowerState } from './types.js';

export function tcgPriceComparison(previous: string, current: string): TcgHigherLowerChoice {
  const comparison = compareTcgPrices(current, previous);
  return comparison > 0 ? 'HIGHER' : comparison < 0 ? 'LOWER' : 'SAME';
}

export function buildTcgHigherLowerResults(state: TcgHigherLowerState) {
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId]! })), {
    compare: (a, b) => b.points - a.points || b.stats.bestStreak - a.stats.bestStreak || b.stats.correct - a.stats.correct,
    tieKey: (entry) => `${entry.points}:${entry.stats.bestStreak}:${entry.stats.correct}`,
    mapStats: (entry) => ({ ...entry.stats, accuracy: entry.stats.comparisons ? Math.round(entry.stats.correct / entry.stats.comparisons * 100) : 0 }),
  });
}

