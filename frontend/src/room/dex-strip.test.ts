import { describe, expect, it } from 'vitest';
import { dexStripLayout, NATIONAL_DEX_GENERATIONS } from './dex-strip';

describe('dexStripLayout', () => {
  it('reparte la tira por generaciones, contiguas, sin huecos', () => {
    const { bands } = dexStripLayout(25, [1, 2]);
    expect(bands).toHaveLength(9);
    expect(bands.reduce((sum, band) => sum + band.widthPercent, 0)).toBeCloseTo(100);
    for (let i = 1; i < NATIONAL_DEX_GENERATIONS.length; i++) expect(NATIONAL_DEX_GENERATIONS[i]!.first).toBe(NATIONAL_DEX_GENERATIONS[i - 1]!.last + 1);
    expect(bands.filter((band) => band.active).map((band) => band.generation)).toEqual([1, 2]);
  });
  it('sitúa el objetivo en su generación y no se sale de la tira', () => {
    const at = (n: number) => dexStripLayout(n, [1]).targetPercent!;
    expect(at(1)).toBeGreaterThan(0);
    expect(at(151)).toBeLessThan(151 / 1025 * 100);
    expect(at(152)).toBeGreaterThan(151 / 1025 * 100);
    expect(at(5000)).toBe(100);
    expect(dexStripLayout(null, [1]).targetPercent).toBeNull();
  });
});
