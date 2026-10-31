// Parche de catálogo de un escenario dorado (types.ts, GoldenCatalogPatch). GoldenCatalogs.java aplica el mismo.
import type { Pokemon } from '../dist/index.js';
import type { GoldenCatalogPatch } from './types.js';

/** Superpone `palette`/`paletteWeights` a las filas parcheadas; un id que no está en el catálogo es un error. */
export function applyCatalogPatch(pokemon: readonly Pokemon[], patch: GoldenCatalogPatch): Pokemon[] {
  const known = new Set(pokemon.map((row) => row.id));
  const unknown = Object.keys(patch).filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`catalogPatch con Pokémon fuera del catálogo: ${unknown.join(', ')}`);
  return pokemon.map((row) => {
    const entry = patch[row.id];
    return entry ? { ...row, palette: [...entry.palette], paletteWeights: [...entry.paletteWeights] } : row;
  });
}
