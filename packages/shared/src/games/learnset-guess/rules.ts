import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { LearnsetGuessPlayerStats, LearnsetGuessState } from './types.js';

export const LEARNSET_INITIAL_POINTS = 5;
export const LEARNSET_MIN_POINTS = 1;
/** Extra for the first and second correct guessers (solveOrder 1 and 2), assigned in server processing order. */
export const LEARNSET_ORDER_BONUSES = [2, 1] as const;
/** When exactly one required player is still missing, the round closes at most this long after the trigger. */
export const LEARNSET_LAST_WARNING_MS = 10_000;

export function learnsetPoints(revealStage: number, solveOrder: number): number {
  const bonus: number = LEARNSET_ORDER_BONUSES[solveOrder - 1] ?? 0;
  return Math.max(LEARNSET_MIN_POINTS, LEARNSET_INITIAL_POINTS - revealStage) + bonus;
}

export function emptyLearnsetStats(): LearnsetGuessPlayerStats {
  return { correct: 0, missed: 0, initialSolves: 0, incorrectGuesses: 0, pointsFromSolves: 0, bestRoundPoints: 0 };
}

export function buildLearnsetResults(state: LearnsetGuessState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyLearnsetStats() })), {
    compare: (left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}
