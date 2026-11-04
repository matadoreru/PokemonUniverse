import { type DistanceRoundRecord, MAX_TIEBREAK_DEPTH } from '@pokemon-universe/shared/public';

export interface DistancePlayerSummary {
  playerId: string;
  /** Una columna por registro del historial; `null` si no jugaba esa ronda o no respondió. */
  distances: Array<number | null>;
  bestDistance: number | null;
  /** Número de ronda del registro en el que cayó, o `null` si no cayó. */
  eliminatedInRound: number | null;
  /** Por qué cayó si fue un empate forzado en el tope de desempates; `null` en el resto de casos. */
  eliminationNote: string | null;
}

export interface DistanceBestHit {
  playerId: string;
  distance: number;
  roundNumber: number;
  tiebreakDepth: number;
}

/**
 * Empate resuelto a la fuerza en el tope de desempates (`MAX_TIEBREAK_DEPTH`): el jugador cayó y otro elegible quedó a
 * su misma distancia. Cae quien eligió más tarde; si todos los empatados cayeron, es que eligieron a la vez.
 */
export function distanceForcedTieNote(record: DistanceRoundRecord, playerId: string): string | null {
  if (record.tiebreakDepth < MAX_TIEBREAK_DEPTH || !record.eliminatedIds.includes(playerId)) return null;
  const distance = record.distances[playerId] ?? null;
  if (distance === null) return null;
  const tied = Object.keys(record.distances).filter((id) => record.distances[id] === distance);
  if (tied.length < 2) return null;
  return tied.every((id) => record.eliminatedIds.includes(id)) ? 'empate forzado: eligieron a la vez' : 'empate forzado: eligió más tarde';
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
    let eliminationNote: string | null = null;
    for (const record of history) {
      const distance = record.distances[playerId] ?? null;
      distances.push(distance);
      if (distance !== null && (bestDistance === null || distance < bestDistance)) bestDistance = distance;
      if (eliminatedInRound === null && record.eliminatedIds.includes(playerId)) {
        eliminatedInRound = record.roundNumber;
        eliminationNote = distanceForcedTieNote(record, playerId);
      }
    }
    return { playerId, distances, bestDistance, eliminatedInRound, eliminationNote };
  });
  for (const record of history) {
    for (const playerId of playerIds) {
      const distance = record.distances[playerId] ?? null;
      if (distance !== null && (best === null || distance < best.distance)) best = { playerId, distance, roundNumber: record.roundNumber, tiebreakDepth: record.tiebreakDepth };
    }
  }
  return { players, best };
}

/** Cabecera de columna: `R3`, o `R3 · D1` para el primer desempate de la ronda 3. */
export function distanceRoundLabel(record: Pick<DistanceRoundRecord, 'roundNumber' | 'tiebreakDepth'>): string {
  return record.tiebreakDepth > 0 ? `R${record.roundNumber} · D${record.tiebreakDepth}` : `R${record.roundNumber}`;
}

/**
 * Línea de cada fila de la clasificación. Quien no ganó siempre cayó en alguna ronda (la partida acaba con un
 * superviviente o ninguno); `null` solo con un historial vacío, y entonces no se pinta nada.
 */
export function distanceStandingLabel(player: DistancePlayerSummary, winnerId: string | null): string | null {
  if (player.playerId === winnerId) return 'Ganador';
  if (player.eliminatedInRound === null) return null;
  const fell = `Cayó en la ronda ${player.eliminatedInRound}`;
  return player.eliminationNote ? `${fell} · ${player.eliminationNote}` : fell;
}

/** Detalle de la tarjeta «Mejor acierto». */
export function distanceBestLabel(best: DistanceBestHit): string {
  const where = `en ${distanceRoundLabel(best)}`;
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
  if (fell) {
    const note = distanceForcedTieNote(record, playerId);
    return { text, mark: '✗', tone: 'berry', label: `${round}: ${what}, cayó${note ? ` (${note})` : ''}` };
  }
  if (distance === 0) return { text, mark: '✓', tone: 'leaf', label: `${round}: ${what}` };
  if (distance !== null && distance <= DISTANCE_CLOSE_MAX) return { text, mark: null, tone: 'aqua', label: `${round}: ${what}` };
  return { text, mark: null, tone: 'ink', label: `${round}: ${what}` };
}

/** Media con coma decimal y dos decimales como mucho: `181,75`. */
const formatAverage = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Estadísticas de una fila de la clasificación (`GameStanding.stats` de Distance). */
export function distanceStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const parts = [plural(stats.exactHits ?? 0, 'acierto exacto', 'aciertos exactos'), `distancia media ${formatAverage(stats.averageDistance ?? 0)}`];
  const tiebreaks = stats.tiebreaksWon ?? 0;
  if (tiebreaks > 0) parts.push(plural(tiebreaks, 'desempate superado', 'desempates superados'));
  return parts.join(' · ');
}
