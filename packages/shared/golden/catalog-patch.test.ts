import { describe, expect, it } from 'vitest';
import type { Pokemon } from '../dist/index.js';
import { applyCatalogPatch } from './catalog-patch.js';

const row = (id: string): Pokemon => ({
  id, nationalDexNumber: 1, name: id, generation: 1, sprite: `/${id}.png`, hp: 1, attack: 1, defense: 1, specialAttack: 1,
  specialDefense: 1, speed: 1, baseStatTotal: 6, types: ['normal'],
});

describe('applyCatalogPatch', () => {
  it('superpone la paleta solo a las filas parcheadas sin mutar las originales', () => {
    const rows = [row('a'), row('b')];
    const patched = applyCatalogPatch(rows, { b: { palette: ['#000000', '#111111', '#222222'], paletteWeights: [1, 2, 3] } });
    expect(patched[0]).toBe(rows[0]);
    expect(patched[1]).toEqual({ ...rows[1], palette: ['#000000', '#111111', '#222222'], paletteWeights: [1, 2, 3] });
    expect(rows[1]).not.toHaveProperty('palette');
  });

  it('rechaza ids que no están en el catálogo', () => {
    expect(() => applyCatalogPatch([row('a')], { z: { palette: [], paletteWeights: [] } })).toThrow('catalogPatch con Pokémon fuera del catálogo: z');
  });
});
