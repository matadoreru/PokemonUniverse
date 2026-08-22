import type { Pokemon, PokemonCatalog } from '@pokemon-universe/shared';
import { prisma } from '../db.js';

export class InMemoryPokemonCatalog implements PokemonCatalog {
  private readonly idIndex: Map<string, Pokemon>;
  private readonly dexIndex: Map<number, Pokemon>;
  constructor(private readonly entries: readonly Pokemon[]) {
    this.idIndex = new Map(entries.map((pokemon) => [pokemon.id, pokemon]));
    this.dexIndex = new Map(entries.map((pokemon) => [pokemon.nationalDexNumber, pokemon]));
  }
  all(): readonly Pokemon[] { return this.entries; }
  byId(id: string): Pokemon | undefined { return this.idIndex.get(id); }
  byDexNumber(number: number): Pokemon | undefined { return this.dexIndex.get(number); }
  forGenerations(generations: readonly number[]): readonly Pokemon[] {
    const allowed = new Set(generations);
    return this.entries.filter((pokemon) => allowed.has(pokemon.generation));
  }
}

export async function loadPokemonCatalog(): Promise<InMemoryPokemonCatalog> {
  const rows = await prisma.pokemon.findMany({ orderBy: { nationalDexNumber: 'asc' } });
  if (rows.length === 0) throw new Error('Pokémon catalog is empty. Run `npm run db:seed`.');
  return new InMemoryPokemonCatalog(rows.map((row) => ({
    id: row.id, nationalDexNumber: row.nationalDexNumber, name: row.name,
    generation: row.generation, sprite: row.sprite,
    ...(row.names && typeof row.names === 'object' ? { names: row.names as Record<string, string> } : {}),
    types: row.types,
  })));
}
