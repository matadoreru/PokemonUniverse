import { describe, expect, it } from 'vitest';
import { dexStripLayout, NATIONAL_DEX_GENERATIONS } from './dex-strip';

describe('dexStripLayout', () => {
  it('solo pinta las generaciones de la partida, repartiendo toda la tira', () => {
    const { bands, ranges } = dexStripLayout(25, [1]);
    expect(bands.map((band) => band.generation)).toEqual([1]);
    expect(bands[0]!.widthPercent).toBeCloseTo(100);
    expect(ranges).toEqual([{ first: 1, last: 151 }]);
  });
  it('sin configuración, la Pokédex entera, contigua y sin cortes', () => {
    const { bands, ranges } = dexStripLayout(25, []);
    expect(bands).toHaveLength(9);
    expect(bands.reduce((sum, band) => sum + band.widthPercent, 0)).toBeCloseTo(100);
    expect(bands.some((band) => band.gapBefore)).toBe(false);
    for (let i = 1; i < NATIONAL_DEX_GENERATIONS.length; i++) expect(NATIONAL_DEX_GENERATIONS[i]!.first).toBe(NATIONAL_DEX_GENERATIONS[i - 1]!.last + 1);
    expect(ranges).toEqual([{ first: 1, last: 1025 }]);
  });
  it('generaciones no contiguas: corte entre ellas y un tramo por grupo, en orden', () => {
    const { bands, ranges } = dexStripLayout(300, [3, 1, 2, 5]);
    expect(bands.map((band) => [band.generation, band.gapBefore])).toEqual([[1, false], [2, false], [3, false], [5, true]]);
    expect(ranges).toEqual([{ first: 1, last: 386 }, { first: 494, last: 649 }]);
    expect(bands.reduce((sum, band) => sum + band.widthPercent, 0)).toBeCloseTo(100);
  });
  it('sitúa el objetivo dentro de las generaciones en juego y no se sale de la tira', () => {
    const at = (n: number, gens: number[]) => dexStripLayout(n, gens).targetPercent!;
    expect(at(1, [1])).toBeGreaterThan(0);
    expect(at(151, [1])).toBeLessThan(100);
    // Con las generaciones 1 y 3, el #252 (primero de la 3) va justo tras la banda de la 1.
    expect(at(252, [1, 3])).toBeCloseTo(0.5 / (151 + 135) * 100 + 151 / (151 + 135) * 100);
    expect(at(200, [1, 3])).toBeCloseTo(151 / (151 + 135) * 100);
    expect(at(5000, [1])).toBe(100);
    expect(dexStripLayout(null, [1]).targetPercent).toBeNull();
  });
});
