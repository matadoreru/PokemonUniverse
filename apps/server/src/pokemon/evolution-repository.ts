import type { PrismaClient } from '@prisma/client';

export interface EvolutionRepository {
  forPokemon(pokemonId: string): Promise<Array<{ fromPokemonId: string; toPokemonId: string; trigger: string | null; minLevel: number | null }>>;
}

export class PrismaEvolutionRepository implements EvolutionRepository {
  constructor(private readonly db: PrismaClient) {}
  forPokemon(pokemonId: string) {
    return this.db.pokemonEvolution.findMany({ where: { OR: [{ fromPokemonId: pokemonId }, { toPokemonId: pokemonId }] }, orderBy: [{ chainId: 'asc' }, { fromPokemonId: 'asc' }], select: { fromPokemonId: true, toPokemonId: true, trigger: true, minLevel: true } });
  }
}
