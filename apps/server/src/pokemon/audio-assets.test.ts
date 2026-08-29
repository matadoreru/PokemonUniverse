import { describe, expect, it } from 'vitest';
import { InMemoryPokemonAudioCatalog, metadataCries } from './audio-assets.js';

describe('local Pokémon audio catalog', () => {
  it('indexes persisted cry references without external queries', () => {
    const catalog = new InMemoryPokemonAudioCatalog([
      { pokemonId: 'pikachu', kind: 'CRY_LATEST', url: 'https://raw.githubusercontent.com/PokeAPI/cries/main/a.ogg' },
      { pokemonId: 'pikachu', kind: 'CRY_LEGACY', url: 'https://raw.githubusercontent.com/PokeAPI/cries/main/b.ogg' },
    ]);
    expect(catalog.cryFor('pikachu', 'LATEST')).toMatch(/a\.ogg$/); expect(catalog.cryFor('pikachu', 'LEGACY')).toMatch(/b\.ogg$/);
    expect(catalog.cryFor('missing', 'LATEST')).toBeNull(); expect(catalog.pokemonIds()).toEqual(['pikachu']);
  });
  it('recovers cry references from legacy Pokémon metadata', () => {
    expect(metadataCries('pikachu', { cries: { latest: 'https://raw.githubusercontent.com/PokeAPI/cries/main/latest/25.ogg', legacy: null } })).toEqual([
      { pokemonId: 'pikachu', kind: 'CRY_LATEST', url: 'https://raw.githubusercontent.com/PokeAPI/cries/main/latest/25.ogg' },
    ]);
  });
  it('refreshes the in-memory catalog after a data synchronization', () => {
    const catalog = new InMemoryPokemonAudioCatalog([]);
    catalog.replaceWith(new InMemoryPokemonAudioCatalog([{ pokemonId: 'pikachu', kind: 'CRY_LATEST', url: 'https://raw.githubusercontent.com/PokeAPI/cries/main/a.ogg' }]));
    expect(catalog.cryFor('pikachu', 'LATEST')).toMatch(/a\.ogg$/);
  });
});
