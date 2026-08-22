import { pointsForPosition } from '../../scoring.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { EliminationRecord, PlayerRoundStats, PokedexDistanceState, RoundSelection } from './types.js';

export const distanceBetween = (selectedDex: number, targetDex: number): number => Math.abs(selectedDex - targetDex);

export function farthestPlayerIds(selections: Readonly<Record<string, RoundSelection>>): string[] {
  const entries = Object.entries(selections);
  if (entries.length === 0) return [];
  const maximum = Math.max(...entries.map(([, selection]) => selection.distance));
  return entries.filter(([, selection]) => selection.distance === maximum).map(([playerId]) => playerId);
}

export function buildResults(state: PokedexDistanceState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  const total = state.initialPlayerIds.length;
  const positions = new Map<string, number>();
  if (state.winnerId) positions.set(state.winnerId, 1);
  for (const elimination of [...state.eliminations].reverse()) {
    const position = elimination.remainingAfter + 1;
    for (const playerId of elimination.playerIds) positions.set(playerId, position);
  }
  const standings: GameStanding[] = state.initialPlayerIds.map((playerId) => {
    const position = positions.get(playerId) ?? total;
    const stats = state.playerStats[playerId] ?? emptyPlayerStats();
    return {
      playerId,
      position,
      points: !state.winnerId && position === 1 ? 0 : pointsForPosition(total, position),
      stats: {
        exactHits: stats.exactHits,
        roundsSurvived: stats.roundsSurvived,
        selections: stats.selections,
        averageDistance: stats.selections === 0 ? 0 : Math.round((stats.distanceTotal / stats.selections) * 100) / 100,
      },
    };
  });
  standings.sort((a, b) => a.position - b.position || a.playerId.localeCompare(b.playerId));
  return { winnerId: state.winnerId, standings };
}

export function emptyPlayerStats(): PlayerRoundStats {
  return { exactHits: 0, distanceTotal: 0, selections: 0, roundsSurvived: 0 };
}

export function elimination(playerIds: string[], reason: EliminationRecord['reason'], state: PokedexDistanceState): EliminationRecord {
  return { playerIds, reason, roundNumber: state.roundNumber, remainingAfter: state.survivorIds.length - playerIds.length };
}
