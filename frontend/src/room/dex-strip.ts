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

export interface DexStripBand {
  generation: number;
  first: number;
  last: number;
  /** Ancho en la tira, en % (proporcional a los Pokémon de la generación, entre las de la partida). */
  widthPercent: number;
  /** Hay generaciones fuera de la partida entre esta y la anterior: la tira lo marca con un corte. */
  gapBefore: boolean;
}

/**
 * Tira de la Pokédex de la pantalla de juego: solo las generaciones de la partida (sin configurar, todas), una banda
 * por generación con su ancho proporcional y un corte donde la selección no es contigua; la posición del objetivo
 * (ya público, «Objetivo #N») y los tramos de números en juego («#001–151 · #252–386»). Un número fuera de las
 * generaciones de la partida se queda en el borde más cercano.
 */
export function dexStripLayout(target: number | null, generations: readonly number[]): { bands: DexStripBand[]; targetPercent: number | null; ranges: { first: number; last: number }[] } {
  const chosen = NATIONAL_DEX_GENERATIONS.filter((band) => generations.includes(band.generation));
  const shown = chosen.length > 0 ? chosen : NATIONAL_DEX_GENERATIONS;
  const total = shown.reduce((sum, band) => sum + band.last - band.first + 1, 0);
  const bands = shown.map((band, index) => ({
    ...band,
    widthPercent: (band.last - band.first + 1) / total * 100,
    gapBefore: index > 0 && shown[index - 1]!.last + 1 !== band.first,
  }));
  const ranges: { first: number; last: number }[] = [];
  for (const band of bands) {
    const previous = ranges.at(-1);
    if (previous && !band.gapBefore) previous.last = band.last;
    else ranges.push({ first: band.first, last: band.last });
  }
  return { bands, targetPercent: target === null || target < 1 ? null : stripPercent(target, bands, total), ranges };
}

/** Posición de un número en la tira: dentro de su banda o, fuera de la partida, en el borde de la banda siguiente (o el final). */
function stripPercent(target: number, bands: readonly DexStripBand[], total: number): number {
  let before = 0;
  for (const band of bands) {
    if (target < band.first) return before / total * 100;
    if (target <= band.last) return (before + target - band.first + 0.5) / total * 100;
    before += band.last - band.first + 1;
  }
  return 100;
}
