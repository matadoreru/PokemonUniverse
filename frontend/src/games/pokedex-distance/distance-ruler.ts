import type { PublicRoundResult } from '@pokemon-universe/shared/public';

/** Marcador de un jugador en la regla de la revelación. Quien no respondió lleva `dexNumber: null` y no se dibuja en ella. */
export interface RulerMarker {
  playerId: string;
  dexNumber: number | null;
  distance: number | null;
  /** Posición horizontal en la regla (el objetivo está en el 50 %), limitada al 2–98 %. */
  offsetPercent: number;
  /** Altura del marcador (0, 1, 2…): sube cuando otro queda a menos de `minGapPercent` puntos en su carril. */
  lane: number;
  eliminated: boolean;
  exact: boolean;
  /** Empatado en la peor distancia y sin caer (igual que la etiqueta «Empate» de las tarjetas). */
  tied: boolean;
}

const MIN_WINDOW = 10;
/** Separación mínima por defecto entre dos marcadores del mismo carril, en puntos de la regla. */
export const DEFAULT_LANE_GAP = 8;

/** Número de la Pokédex con tres cifras como mínimo: `#025`. */
export function formatDexNumber(dexNumber: number): string {
  return `#${String(dexNumber).padStart(3, '0')}`;
}

/**
 * Regla numérica de la revelación: el objetivo en el centro y cada respuesta a su distancia, con una ventana de
 * `max(10, ceil(maxDistance × 1.15))` números a cada lado. Solo usa la ronda ya resuelta (`lastRound`).
 */
export function rulerLayout(lastRound: PublicRoundResult, minGapPercent = DEFAULT_LANE_GAP): { window: number; markers: RulerMarker[] } {
  const target = lastRound.targetDexNumber;
  const distances = lastRound.eligibleIds.map((id) => lastRound.selections[id]?.distance).filter((d): d is number => d !== undefined);
  // 115/100 en enteros: 100 × 1.15 da 114,999… en coma flotante.
  const window = Math.max(MIN_WINDOW, Math.ceil(Math.max(0, ...distances) * 115 / 100));
  const markers: RulerMarker[] = lastRound.eligibleIds.map((playerId) => {
    const selection = lastRound.selections[playerId];
    const eliminated = lastRound.eliminatedIds.includes(playerId);
    const tied = lastRound.tiedIds.includes(playerId) && !eliminated;
    if (!selection) return { playerId, dexNumber: null, distance: null, offsetPercent: 0, lane: 0, eliminated, exact: false, tied };
    const offsetPercent = Math.min(98, Math.max(2, 50 + (selection.dexNumber - target) / window * 50));
    return { playerId, dexNumber: selection.dexNumber, distance: selection.distance, offsetPercent, lane: 0, eliminated, exact: selection.distance === 0, tied };
  });
  // De izquierda a derecha, cada marcador ocupa el carril más bajo libre; si no hay ninguno, abre uno nuevo. Así dos
  // marcadores del mismo carril siempre quedan a `minGapPercent` o más (el ancho de un marcador, medido en la página).
  const laneEnds: number[] = [];
  const placed = markers.filter((m) => m.dexNumber !== null).sort((a, b) => a.offsetPercent - b.offsetPercent);
  for (const marker of placed) {
    let lane = laneEnds.findIndex((end) => marker.offsetPercent - end >= minGapPercent);
    if (lane === -1) lane = laneEnds.length;
    marker.lane = lane;
    laneEnds[lane] = marker.offsetPercent;
  }
  return { window, markers };
}

/** Título de la regla de la revelación. */
export const DISTANCE_RULER_CAPTION = 'Distancia al objetivo';

/** Texto para lectores de pantalla de un marcador: qué eligió el jugador, a qué distancia y si cae. */
export function distanceMarkerLabel(name: string, marker: RulerMarker): string {
  const pick = marker.dexNumber === null || marker.distance === null ? 'sin respuesta'
    : marker.exact ? `${formatDexNumber(marker.dexNumber)}, acierto exacto` : `${formatDexNumber(marker.dexNumber)}, a ${marker.distance}`;
  return `${name}: ${pick}${marker.eliminated ? ', eliminado' : marker.tied ? ', empate' : ''}`;
}
