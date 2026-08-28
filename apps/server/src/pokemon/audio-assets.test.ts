import { describe, expect, it } from 'vitest';
import { InMemoryPokemonAudioCatalog } from './audio-assets.js';

describe('local Pokémon audio catalog', () => {
  it('indexes persisted cry references without external queries', () => {
    const catalog = new InMemoryPokemonAudioCatalog([
      { pokemonId: 'pikachu', kind: 'CRY_LATEST', url: 'https://raw.githubusercontent.com/PokeAPI/cries/main/a.ogg' },
      { pokemonId: 'pikachu', kind: 'CRY_LEGACY', url: 'https://raw.githubusercontent.com/PokeAPI/cries/main/b.ogg' },
    ]);
    expect(catalog.cryFor('pikachu', 'LATEST')).toMatch(/a\.ogg$/); expect(catalog.cryFor('pikachu', 'LEGACY')).toMatch(/b\.ogg$/);
    expect(catalog.cryFor('missing', 'LATEST')).toBeNull(); expect(catalog.pokemonIds()).toEqual(['pikachu']);
  });
});
