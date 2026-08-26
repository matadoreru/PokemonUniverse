import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { PokemonConnectionsState, PokemonConnectionsStats } from './types.js';

export const CONNECTIONS_COMPLETION_BONUSES = [3, 2, 1] as const;

export function completionBonus(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) throw new RangeError('Invalid completion rank');
  return CONNECTIONS_COMPLETION_BONUSES[rank - 1] ?? 0;
}

export function emptyPokemonConnectionsStats(): PokemonConnectionsStats {
  return {
    roundsPlayed: 0,
    groupsFound: 0,
    boardsSolved: 0,
    mistakes: 0,
    nearMisses: 0,
    podiumFinishes: 0,
    solveTimeTotalMs: 0,
    bestSolveTimeMs: 0,
  };
}

export function buildPokemonConnectionsResults(state: PokemonConnectionsState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyPokemonConnectionsStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.boardsSolved - left.stats.boardsSolved
      || right.stats.groupsFound - left.stats.groupsFound
      || left.stats.mistakes - right.stats.mistakes
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}
