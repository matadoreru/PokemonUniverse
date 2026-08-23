import type { Pokemon } from '@pokemon-universe/shared';

export interface PokemonSearchOption {
  id: string;
  name: string;
  sprite: string;
}

export const normalizePokemonQuery = (value: string): string => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

/** Search results intentionally omit Pokédex number and generation. */
export function searchPokemonOptions(pokemon: readonly Pokemon[], query: string, limit = 40): PokemonSearchOption[] {
  const needle = normalizePokemonQuery(query);
  if (!needle) return [];
  return pokemon
    .filter((entry) => normalizePokemonQuery(entry.name).includes(needle))
    .slice(0, limit)
    .map(({ id, name, sprite }) => ({ id, name, sprite }));
}
