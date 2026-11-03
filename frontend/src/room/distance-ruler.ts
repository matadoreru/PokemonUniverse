import type { PublicRoundResult } from '@pokemon-universe/shared/public';

/** Marcador de un jugador en la regla de la revelación. Quien no respondió lleva `dexNumber: null` y no se dibuja en ella. */
export interface RulerMarker {
  playerId: string;
  dexNumber: number | null;
  distance: number | null;
  /** Posición horizontal en la regla (el objetivo está en el 50 %), limitada al 2–98 %. */
  offsetPercent: number;
  /** Altura del marcador (0–2): sube cuando otro queda a menos de `LANE_GAP` puntos en su carril. */
  lane: number;
  eliminated: boolean;
  exact: boolean;
}

const MIN_WINDOW = 10;
const LANE_GAP = 8;
const MAX_LANE = 2;

/** Número de la Pokédex con tres cifras como mínimo: `#025`. */
export function formatDexNumber(dexNumber: number): string {
  return `#${String(dexNumber).padStart(3, '0')}`;
}

/**
 * Regla numérica de la revelación: el objetivo en el centro y cada respuesta a su distancia, con una ventana de
 * `max(10, ceil(maxDistance × 1.15))` números a cada lado. Solo usa la ronda ya resuelta (`lastRound`).
 */
export function rulerLayout(lastRound: PublicRoundResult): { window: number; markers: RulerMarker[] } {
  const target = lastRound.targetDexNumber;
  const distances = lastRound.eligibleIds.map((id) => lastRound.selections[id]?.distance).filter((d): d is number => d !== undefined);
  // 115/100 en enteros: 100 × 1.15 da 114,999… en coma flotante.
  const window = Math.max(MIN_WINDOW, Math.ceil(Math.max(0, ...distances) * 115 / 100));
  const markers: RulerMarker[] = lastRound.eligibleIds.map((playerId) => {
    const selection = lastRound.selections[playerId];
    const eliminated = lastRound.eliminatedIds.includes(playerId);
    if (!selection) return { playerId, dexNumber: null, distance: null, offsetPercent: 0, lane: 0, eliminated, exact: false };
    const offsetPercent = Math.min(98, Math.max(2, 50 + (selection.dexNumber - target) / window * 50));
    return { playerId, dexNumber: selection.dexNumber, distance: selection.distance, offsetPercent, lane: 0, eliminated, exact: selection.distance === 0 };
  });
  // De izquierda a derecha, cada marcador ocupa el carril más bajo libre; si no hay ninguno, el que dejó más hueco.
  const laneEnds: number[] = [];
  const placed = markers.filter((m) => m.dexNumber !== null).sort((a, b) => a.offsetPercent - b.offsetPercent);
  for (const marker of placed) {
    let lane = laneEnds.findIndex((end) => marker.offsetPercent - end >= LANE_GAP);
    if (lane === -1) lane = laneEnds.length <= MAX_LANE ? laneEnds.length : laneEnds.indexOf(Math.min(...laneEnds));
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
  return `${name}: ${pick}${marker.eliminated ? ', eliminado' : ''}`;
}
