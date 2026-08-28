import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { WhoIsWhoState } from './types.js';

export const WHO_IS_WHO_WIN_POINTS = 10;
export function emptyWhoIsWhoStats() { return { wins: 0, turnsPlayed: 0, correctGuesses: 0, incorrectGuesses: 0 }; }
export function buildWhoIsWhoResults(state: WhoIsWhoState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  const winners = state.winnerTeam ? new Set(state.teams[state.winnerTeam].playerIds) : new Set<string>();
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId, points: state.scores[playerId] ?? 0, won: winners.has(playerId), stats: state.playerStats[playerId] ?? emptyWhoIsWhoStats(),
  })), { compare: (left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId), tieKey: (entry) => entry.points });
}
