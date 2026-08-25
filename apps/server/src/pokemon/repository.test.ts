import type { Pokemon, PokemonCatalog } from '@pokemon-universe/shared';
import { describe, expect, it } from 'vitest';
import { CatalogPokemonRepository, parsePokemonSearchQuery } from './repository.js';

const entries: Pokemon[] = [
  { id: 'form', nationalDexNumber: 1, name: 'Forma', generation: 1, isDefault: false, sprite: '', hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1, baseStatTotal: 6, types: ['normal'] },
  { id: 'default', nationalDexNumber: 1, name: 'Base', generation: 1, isDefault: true, sprite: '', hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1, baseStatTotal: 6, types: ['normal'] },
];
const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((entry) => entry.id === id),
  byDexNumber: () => entries[1],
  forGenerations: (generations, options) => entries.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)),
};

describe('PokemonRepository', () => {
  it('centralizes query parsing and form filtering', () => {
    expect(parsePokemonSearchQuery({ generations: '1,1,20,nope', includeForms: 'true' })).toEqual({ generations: [1], includeForms: true });
    const repository = new CatalogPokemonRepository(catalog);
    expect(repository.search({ generations: [1], includeForms: false }).map((entry) => entry.id)).toEqual(['default']);
    expect(repository.search({ generations: [1], includeForms: true }).map((entry) => entry.id)).toEqual(['default', 'form']);
  });
});
