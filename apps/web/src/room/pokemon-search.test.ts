import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@pokemon-universe/shared';
import { searchPokemonOptions } from './pokemon-search';

const pokemon: Pokemon[] = [
  { id: 'garchomp', nationalDexNumber: 445, name: 'Garchomp', generation: 4, sprite: '/garchomp.png' },
  { id: 'gardevoir', nationalDexNumber: 282, name: 'Gardevoir', generation: 3, sprite: '/gardevoir.png' },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: '/pikachu.png' },
];

describe('Pokédex Distance Pokémon search', () => {
  it('returns no suggestions for an empty query', () => {
    expect(searchPokemonOptions(pokemon, '')).toEqual([]);
    expect(searchPokemonOptions(pokemon, '   ')).toEqual([]);
  });

  it('searches by name without exposing Pokédex metadata', () => {
    const results = searchPokemonOptions(pokemon, 'gar');
    expect(results.map((entry) => entry.name)).toEqual(['Garchomp', 'Gardevoir']);
    expect(results[0]).toEqual({ id: 'garchomp', name: 'Garchomp', sprite: '/garchomp.png' });
    expect(JSON.stringify(results)).not.toContain('445');
    expect(JSON.stringify(results)).not.toContain('nationalDexNumber');
    expect(JSON.stringify(results)).not.toContain('generation');
  });
});
