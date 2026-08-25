import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { ShinyVoteState } from './types.js';

export function emptyShinyStats() { return { votes: 0, correctVotes: 0 }; }

export function buildShinyResults(state: ShinyVoteState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyShinyStats(),
  })), {
    compare: (left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
    mapStats: (entry) => ({
        correctVotes: entry.stats.correctVotes,
        votes: entry.stats.votes,
        incorrectVotes: entry.stats.votes - entry.stats.correctVotes,
        unanswered: Math.max(0, state.config.rounds - entry.stats.votes),
        accuracy: entry.stats.votes === 0 ? 0 : Math.round(entry.stats.correctVotes / entry.stats.votes * 100),
    }),
  });
}
