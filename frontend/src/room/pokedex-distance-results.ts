import type { DistanceRoundRecord } from '@pokemon-universe/shared/public';

export interface DistancePlayerSummary {
  playerId: string;
  /** Una columna por registro del historial; `null` si no jugaba esa ronda o no respondió. */
  distances: Array<number | null>;
  bestDistance: number | null;
  /** Número de ronda del registro en el que cayó, o `null` si no cayó. */
  eliminatedInRound: number | null;
}

export interface DistanceBestHit {
  playerId: string;
  distance: number;
  roundNumber: number;
}

/**
 * Resumen de la pantalla de resultados a partir de `roundHistory` (solo público en `GAME_RESULTS`). El mejor acierto
 * es la distancia mínima no nula; si empatan, gana la ronda anterior (comparación estricta, en orden de historial).
 * Sin ninguna distancia, `bestDistance` y `best` son `null`: nunca `Infinity`.
 */
export function distanceResultsSummary(history: readonly DistanceRoundRecord[], playerIds: readonly string[]): { players: DistancePlayerSummary[]; best: DistanceBestHit | null } {
  let best: DistanceBestHit | null = null;
  const players = playerIds.map((playerId): DistancePlayerSummary => {
    const distances: Array<number | null> = [];
    let bestDistance: number | null = null;
    let eliminatedInRound: number | null = null;
    for (const record of history) {
      const distance = record.distances[playerId] ?? null;
      distances.push(distance);
      if (distance !== null && (bestDistance === null || distance < bestDistance)) bestDistance = distance;
      if (eliminatedInRound === null && record.eliminatedIds.includes(playerId)) eliminatedInRound = record.roundNumber;
    }
    return { playerId, distances, bestDistance, eliminatedInRound };
  });
  for (const record of history) {
    for (const playerId of playerIds) {
      const distance = record.distances[playerId] ?? null;
      if (distance !== null && (best === null || distance < best.distance)) best = { playerId, distance, roundNumber: record.roundNumber };
    }
  }
  return { players, best };
}

/** Cabecera de columna: `R3`, o `R3 · D1` para el primer desempate de la ronda 3. */
export function distanceRoundLabel(record: Pick<DistanceRoundRecord, 'roundNumber' | 'tiebreakDepth'>): string {
  return record.tiebreakDepth > 0 ? `R${record.roundNumber} · D${record.tiebreakDepth}` : `R${record.roundNumber}`;
}

/** Línea de cada fila de la clasificación. */
export function distanceStandingLabel(player: DistancePlayerSummary, winnerId: string | null): string {
  if (player.playerId === winnerId) return 'Ganador';
  if (player.eliminatedInRound !== null) return `Cayó en la ronda ${player.eliminatedInRound}`;
  return 'Superviviente';
}

/** Detalle de la tarjeta «Mejor acierto». */
export function distanceBestLabel(best: DistanceBestHit): string {
  const where = `en la ronda ${best.roundNumber}`;
  if (best.distance === 0) return `Acierto exacto ${where}`;
  return `A ${best.distance} ${best.distance === 1 ? 'número' : 'números'} del objetivo ${where}`;
}

/** Distancia a partir de la cual una celda deja de resaltarse como «cerca». */
export const DISTANCE_CLOSE_MAX = 10;

export type DistanceCellTone = 'leaf' | 'aqua' | 'ink' | 'berry' | 'muted';

export interface DistanceCell {
  text: string;
  /** ✓ acierto exacto, ✗ cayó en esa ronda: el estado nunca va solo con color. */
  mark: '✓' | '✗' | null;
  tone: DistanceCellTone;
  /** Texto completo para lectores de pantalla y `title`. */
  label: string;
}

/** Celda de la tabla «Distancia por ronda» para un jugador y un registro. */
export function distanceCell(record: DistanceRoundRecord, playerId: string): DistanceCell {
  const round = distanceRoundLabel(record);
  if (!(playerId in record.distances)) return { text: '—', mark: null, tone: 'muted', label: `${round}: no jugaba` };
  const distance = record.distances[playerId] ?? null;
  const fell = record.eliminatedIds.includes(playerId);
  const text = distance === null ? '—' : String(distance);
  const what = distance === null ? 'sin respuesta' : distance === 0 ? 'acierto exacto' : `a ${distance}`;
  if (fell) return { text, mark: '✗', tone: 'berry', label: `${round}: ${what}, cayó` };
  if (distance === 0) return { text, mark: '✓', tone: 'leaf', label: `${round}: ${what}` };
  if (distance !== null && distance <= DISTANCE_CLOSE_MAX) return { text, mark: null, tone: 'aqua', label: `${round}: ${what}` };
  return { text, mark: null, tone: 'ink', label: `${round}: ${what}` };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Estadísticas de una fila de la clasificación (`GameStanding.stats` de Distance). */
export function distanceStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const parts = [plural(stats.exactHits ?? 0, 'acierto exacto', 'aciertos exactos'), `distancia media ${stats.averageDistance ?? 0}`];
  const tiebreaks = stats.tiebreaksWon ?? 0;
  if (tiebreaks > 0) parts.push(plural(tiebreaks, 'desempate superado', 'desempates superados'));
  return parts.join(' · ');
}
