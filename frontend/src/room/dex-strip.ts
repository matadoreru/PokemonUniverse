/** Primer y último número de la Pokédex nacional de cada generación (de la 1 a la 9). */
export const NATIONAL_DEX_GENERATIONS: readonly { generation: number; first: number; last: number }[] = [
  { generation: 1, first: 1, last: 151 },
  { generation: 2, first: 152, last: 251 },
  { generation: 3, first: 252, last: 386 },
  { generation: 4, first: 387, last: 493 },
  { generation: 5, first: 494, last: 649 },
  { generation: 6, first: 650, last: 721 },
  { generation: 7, first: 722, last: 809 },
  { generation: 8, first: 810, last: 905 },
  { generation: 9, first: 906, last: 1025 },
];

const DEX_TOTAL = NATIONAL_DEX_GENERATIONS.at(-1)!.last;

export interface DexStripBand {
  generation: number;
  first: number;
  last: number;
  /** Ancho en la tira, en % (proporcional a los Pokémon de la generación). */
  widthPercent: number;
  /** Entra en la partida (está en la configuración). */
  active: boolean;
}

/**
 * Tira de la Pokédex nacional de la pantalla de juego: una banda por generación (las de la partida, resaltadas) y la
 * posición del objetivo, que ya es público («Objetivo #N»). Un número fuera de la Pokédex conocida se queda en el borde.
 */
export function dexStripLayout(target: number | null, generations: readonly number[]): { bands: DexStripBand[]; targetPercent: number | null } {
  const bands = NATIONAL_DEX_GENERATIONS.map((band) => ({ ...band, widthPercent: (band.last - band.first + 1) / DEX_TOTAL * 100, active: generations.includes(band.generation) }));
  const targetPercent = target === null || target < 1 ? null : Math.min(100, (target - 0.5) / DEX_TOTAL * 100);
  return { bands, targetPercent };
}
