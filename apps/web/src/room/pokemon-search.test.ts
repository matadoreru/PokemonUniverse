import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@pokemon-universe/shared';
import { firstSelectablePokemonOption, searchPokemonOptions } from './pokemon-search';

const pokemon: Pokemon[] = [
  { id: 'garchomp', nationalDexNumber: 445, name: 'Garchomp', generation: 4, sprite: '/garchomp.png', hp: 108, attack: 130, defense: 95, specialAttack: 80, specialDefense: 85, speed: 102, baseStatTotal: 600, types: ['dragon', 'ground'] },
  { id: 'gardevoir', nationalDexNumber: 282, name: 'Gardevoir', generation: 3, sprite: '/gardevoir.png', hp: 68, attack: 65, defense: 65, specialAttack: 125, specialDefense: 115, speed: 80, baseStatTotal: 518, types: ['psychic', 'fairy'] },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: '/pikachu.png', hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90, baseStatTotal: 320, types: ['electric'] },
  { id: 'dugtrio', nationalDexNumber: 51, name: 'Dugtrio', generation: 1, sprite: '/dugtrio.png', hp: 35, attack: 100, defense: 50, specialAttack: 50, specialDefense: 70, speed: 120, baseStatTotal: 425, types: ['ground'] },
  { id: 'dugtrio-alola', nationalDexNumber: 51, name: 'Dugtrio de Alola', generation: 1, isDefault: false, sprite: '/dugtrio-alola.png', hp: 35, attack: 100, defense: 60, specialAttack: 50, specialDefense: 70, speed: 110, baseStatTotal: 425, types: ['ground', 'steel'] },
  { id: 'remoraid', nationalDexNumber: 223, name: 'Remoraid', generation: 2, sprite: '/remoraid.png', hp: 35, attack: 65, defense: 35, specialAttack: 65, specialDefense: 35, speed: 65, baseStatTotal: 300, types: ['water'] },
  { id: 'emolga', nationalDexNumber: 587, name: 'Emolga', generation: 5, sprite: '/emolga.png', hp: 55, attack: 75, defense: 60, specialAttack: 75, specialDefense: 60, speed: 103, baseStatTotal: 428, types: ['electric', 'flying'] },
  { id: 'morpeko-hangry', nationalDexNumber: 877, name: 'Morpeko', generation: 8, isDefault: false, sprite: '/morpeko.png', hp: 58, attack: 95, defense: 58, specialAttack: 70, specialDefense: 58, speed: 97, baseStatTotal: 436, types: ['electric', 'dark'] },
  { id: 'morpeko', nationalDexNumber: 877, name: 'Morpeko', generation: 8, isDefault: true, sprite: '/morpeko.png', hp: 58, attack: 95, defense: 58, specialAttack: 70, specialDefense: 58, speed: 97, baseStatTotal: 436, types: ['electric', 'dark'] },
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

  it('lists the normal and regional form as separate searchable options', () => {
    expect(searchPokemonOptions(pokemon, 'dug')).toEqual([
      { id: 'dugtrio', name: 'Dugtrio', sprite: '/dugtrio.png' },
      { id: 'dugtrio-alola', name: 'Dugtrio de Alola', sprite: '/dugtrio-alola.png' },
    ]);
  });

  it('ranks exact and prefix matches before matches in the middle of a name', () => {
    expect(searchPokemonOptions(pokemon, 'emo').map((entry) => entry.name)).toEqual(['Emolga', 'Remoraid']);
    expect(searchPokemonOptions(pokemon, 'emolga')[0]?.id).toBe('emolga');
  });

  it('deduplicates cosmetic variants with the same display name and prefers the canonical form', () => {
    expect(searchPokemonOptions(pokemon, 'morpeko')).toEqual([
      { id: 'morpeko', name: 'Morpeko', sprite: '/morpeko.png' },
    ]);
  });

  it('uses the first unlocked ranked result for keyboard submission', () => {
    expect(firstSelectablePokemonOption(pokemon, 'emo', new Set())?.id).toBe('emolga');
    expect(firstSelectablePokemonOption(pokemon, 'emo', new Set(['emolga']))?.id).toBe('remoraid');
  });
});
