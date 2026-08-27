import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { WouldYouRatherState, WouldYouRatherStats } from './types.js';

export const WOULD_YOU_RATHER_MAJORITY_POINTS = 1;
export const WOULD_YOU_RATHER_PREDICTION_POINTS = 2;

export function emptyWouldYouRatherStats(): WouldYouRatherStats {
  return { roundsPlayed: 0, ballotsSubmitted: 0, roundsMissed: 0, majorityChoices: 0, correctPredictions: 0, perfectRounds: 0, pointsFromRounds: 0 };
}

export function buildWouldYouRatherResults(state: WouldYouRatherState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before Would You Rather finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyWouldYouRatherStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.correctPredictions - left.stats.correctPredictions
      || right.stats.majorityChoices - left.stats.majorityChoices
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.correctPredictions}:${entry.stats.majorityChoices}`,
  });
}
