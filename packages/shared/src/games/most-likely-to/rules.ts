import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { MostLikelyToState, MostLikelyToStats } from './types.js';

export const MOST_LIKELY_TO_WIN_POINTS = 3;

export function emptyMostLikelyToStats(): MostLikelyToStats {
  return {
    roundsPlayed: 0,
    answersSubmitted: 0,
    roundsMissed: 0,
    votesCast: 0,
    votesReceived: 0,
    roundWins: 0,
    soloWins: 0,
    sharedWins: 0,
    pointsFromRounds: 0,
  };
}

export function buildMostLikelyToResults(state: MostLikelyToState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before Most Likely To finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyMostLikelyToStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.soloWins - left.stats.soloWins
      || right.stats.roundWins - left.stats.roundWins
      || right.stats.votesReceived - left.stats.votesReceived
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.soloWins}:${entry.stats.roundWins}:${entry.stats.votesReceived}`,
  });
}
