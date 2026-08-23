import type { GameResults, GameStanding } from '../contracts.js';
import type { ShinyVoteState } from './types.js';

export function emptyShinyStats() { return { votes: 0, correctVotes: 0 }; }

export function buildShinyResults(state: ShinyVoteState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  const ordered = state.playerIds.map((playerId) => ({
    playerId,
    score: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyShinyStats(),
  })).sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));

  let previousScore: number | null = null;
  let previousPosition = 0;
  const standings: GameStanding[] = ordered.map((entry, index) => {
    const position = entry.score === previousScore ? previousPosition : index + 1;
    previousScore = entry.score;
    previousPosition = position;
    return {
      playerId: entry.playerId,
      position,
      points: entry.score,
      stats: {
        correctVotes: entry.stats.correctVotes,
        votes: entry.stats.votes,
        incorrectVotes: entry.stats.votes - entry.stats.correctVotes,
        unanswered: Math.max(0, state.config.rounds - entry.stats.votes),
        accuracy: entry.stats.votes === 0 ? 0 : Math.round(entry.stats.correctVotes / entry.stats.votes * 100),
      },
    };
  });
  const leaders = standings.filter((standing) => standing.position === 1);
  return { winnerId: leaders.length === 1 ? leaders[0]!.playerId : null, standings };
}
