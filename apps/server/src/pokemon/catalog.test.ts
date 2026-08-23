import type { Pokemon } from '@pokemon-universe/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryPokemonCatalog } from './catalog.js';

const battleData = { hp: 35, attack: 100, defense: 50, specialAttack: 50, specialDefense: 70, speed: 120, baseStatTotal: 425 };
const entries: Pokemon[] = [
  { ...battleData, id: 'dugtrio', nationalDexNumber: 51, name: 'Dugtrio', generation: 1, isDefault: true, sprite: '/dugtrio.png', types: ['ground'] },
  { ...battleData, id: 'dugtrio-alola', nationalDexNumber: 51, name: 'Dugtrio de Alola', generation: 1, isDefault: false, sprite: '/dugtrio-alola.png', types: ['ground', 'steel'] },
];

describe('InMemoryPokemonCatalog forms', () => {
  it('keeps the canonical form for National Pokédex lookups', () => {
    const catalog = new InMemoryPokemonCatalog(entries);
    expect(catalog.byDexNumber(51)?.id).toBe('dugtrio');
  });

  it('excludes forms by default and includes them on request', () => {
    const catalog = new InMemoryPokemonCatalog(entries);
    expect(catalog.forGenerations([1]).map((pokemon) => pokemon.id)).toEqual(['dugtrio']);
    expect(catalog.forGenerations([1], { includeForms: true }).map((pokemon) => pokemon.id)).toEqual(['dugtrio', 'dugtrio-alola']);
  });

  it('resolves normalized move metadata and orders level-up learnsets', () => {
    const moves = [
      { id: 'earthquake', name: 'Earthquake', type: 'ground' as const, category: 'physical' as const },
      { id: 'growl', name: 'Growl', type: 'normal' as const, category: 'status' as const },
    ];
    const catalog = new InMemoryPokemonCatalog(entries, moves, [
      { pokemonId: 'dugtrio', moveId: 'earthquake', referenceGeneration: 9, level: 40 },
      { pokemonId: 'dugtrio', moveId: 'growl', referenceGeneration: 9, level: 1 },
    ], { dugtrio: { stage: 2, stages: 2 } });
    expect(catalog.levelUpMoves('dugtrio', 9).map((entry) => [entry.move.name, entry.level])).toEqual([['Growl', 1], ['Earthquake', 40]]);
    expect(catalog.evolutionInfo('dugtrio')).toEqual({ stage: 2, stages: 2 });
  });
});
