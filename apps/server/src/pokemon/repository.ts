import { GENERATIONS, type Pokemon, type PokemonCatalog } from '@pokemon-universe/shared';

export interface PokemonSearchQuery {
  generations: readonly number[];
  includeForms: boolean;
}

export interface PokemonRepository {
  search(query: PokemonSearchQuery): readonly Pokemon[];
}

/** Read repository backed by the immutable boot-time catalog used by the game engines. */
export class CatalogPokemonRepository implements PokemonRepository {
  constructor(private readonly catalog: PokemonCatalog) {}

  search(query: PokemonSearchQuery): readonly Pokemon[] {
    const source = query.generations.length
      ? this.catalog.forGenerations(query.generations, { includeForms: query.includeForms })
      : this.catalog.all().filter((pokemon) => query.includeForms || pokemon.isDefault !== false);
    return [...source].sort((left, right) => left.nationalDexNumber - right.nationalDexNumber
      || Number(right.isDefault !== false) - Number(left.isDefault !== false)
      || left.name.localeCompare(right.name)).map((pokemon) => {
        const publicPokemon = { ...pokemon };
        delete publicPokemon.palette;
        return publicPokemon;
      });
  }
}

export function parsePokemonSearchQuery(query: Record<string, unknown>): PokemonSearchQuery {
  const allowed = new Set<number>(GENERATIONS);
  const generations = typeof query.generations === 'string'
    ? [...new Set(query.generations.split(',').map(Number).filter((value) => Number.isInteger(value) && allowed.has(value)))]
    : [];
  return { generations, includeForms: query.includeForms === 'true' };
}
