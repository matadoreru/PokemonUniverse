import { pointsForPosition } from '../../scoring.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { DistanceRoundRecord, EliminationRecord, PlayerRoundStats, PokedexDistanceState, RoundSelection } from './types.js';

/**
 * Desempates como máximo antes de resolver un empate a la fuerza. En `HIDDEN` los empatados pueden repetir el mismo
 * Pokémon en cada desempate; el tope garantiza que la partida acabe (`maxTiebreaks` configurable es de la Fase 3).
 */
export const MAX_TIEBREAK_DEPTH = 3;

export const distanceBetween = (selectedDex: number, targetDex: number): number => Math.abs(selectedDex - targetDex);

export function farthestPlayerIds(selections: Readonly<Record<string, RoundSelection>>): string[] {
  const entries = Object.entries(selections);
  if (entries.length === 0) return [];
  const maximum = Math.max(...entries.map(([, selection]) => selection.distance));
  return entries.filter(([, selection]) => selection.distance === maximum).map(([playerId]) => playerId);
}

/**
 * Empate en el tope de desempates: caen los empatados que eligieron los últimos (mayor `selectedAt`); si todos
 * eligieron a la vez, caen todos. Siempre elimina al menos a uno.
 */
export function lastToSelectIds(selections: Readonly<Record<string, RoundSelection>>, tiedIds: readonly string[]): string[] {
  const latest = Math.max(...tiedIds.map((id) => selections[id]!.selectedAt));
  return tiedIds.filter((id) => selections[id]!.selectedAt === latest);
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
        tiebreaksWon: stats.tiebreaksWon,
      },
    };
  });
  standings.sort((a, b) => a.position - b.position || a.playerId.localeCompare(b.playerId));
  return { winnerId: state.winnerId, standings };
}

export function emptyPlayerStats(): PlayerRoundStats {
  return { exactHits: 0, distanceTotal: 0, selections: 0, roundsSurvived: 0, tiebreaksWon: 0 };
}

export function elimination(playerIds: string[], reason: EliminationRecord['reason'], state: PokedexDistanceState): EliminationRecord {
  return { playerIds, reason, roundNumber: state.roundNumber, remainingAfter: state.survivorIds.length - playerIds.length };
}

/** Registro de la ronda que se resuelve ahora: una distancia por elegible (`null` si no respondió). */
export function roundRecord(state: PokedexDistanceState, eliminatedIds: string[]): DistanceRoundRecord {
  return {
    roundNumber: state.roundNumber,
    tiebreakDepth: state.tiebreakDepth,
    targetDexNumber: state.targetDexNumber!,
    distances: Object.fromEntries(state.eligibleIds.map((id) => [id, state.selections[id]?.distance ?? null])),
    eliminatedIds: [...eliminatedIds],
  };
}
