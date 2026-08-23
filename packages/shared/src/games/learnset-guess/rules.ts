import type { GameResults, GameStanding } from '../contracts.js';
import type { LearnsetGuessPlayerStats, LearnsetGuessState } from './types.js';

export const LEARNSET_INITIAL_POINTS = 5;
export const LEARNSET_MIN_POINTS = 1;

export function learnsetPoints(revealStage: number): number {
  return Math.max(LEARNSET_MIN_POINTS, LEARNSET_INITIAL_POINTS - revealStage);
}

export function emptyLearnsetStats(): LearnsetGuessPlayerStats {
  return { correct: 0, missed: 0, initialSolves: 0, incorrectGuesses: 0, pointsFromSolves: 0, bestRoundPoints: 0 };
}

export function buildLearnsetResults(state: LearnsetGuessState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  const ordered = state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyLearnsetStats() }))
    .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  let prior: number | null = null; let position = 0;
  const standings: GameStanding[] = ordered.map((entry, index) => {
    if (entry.points !== prior) position = index + 1; prior = entry.points;
    return { playerId: entry.playerId, position, points: entry.points, won: position === 1, stats: { ...entry.stats } };
  });
  const leaders = standings.filter((standing) => standing.position === 1);
  return { winnerId: leaders.length === 1 ? leaders[0]!.playerId : null, standings };
}
