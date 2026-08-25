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
  if (!needle || limit <= 0) return [];
  const ranked = pokemon
    .map((entry, index) => ({ entry, index, normalizedName: normalizePokemonQuery(entry.name) }))
    .filter(({ normalizedName }) => normalizedName.includes(needle))
    .sort((left, right) => {
      const leftRank = left.normalizedName === needle ? 0 : left.normalizedName.startsWith(needle) ? 1 : 2;
      const rightRank = right.normalizedName === needle ? 0 : right.normalizedName.startsWith(needle) ? 1 : 2;
      return leftRank - rightRank
        || (left.normalizedName === right.normalizedName
          ? Number(right.entry.isDefault !== false) - Number(left.entry.isDefault !== false)
          : 0)
        || left.index - right.index;
    });
  const names = new Set<string>();
  const results: PokemonSearchOption[] = [];
  for (const { entry, normalizedName } of ranked) {
    if (names.has(normalizedName)) continue;
    names.add(normalizedName);
    results.push({ id: entry.id, name: entry.name, sprite: entry.sprite });
    if (results.length >= limit) break;
  }
  return results;
}

export function firstSelectablePokemonOption(pokemon: readonly Pokemon[], query: string, locked: ReadonlySet<string>): PokemonSearchOption | undefined {
  return searchPokemonOptions(pokemon, query).find((entry) => !locked.has(entry.id));
}
