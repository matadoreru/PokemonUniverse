import { describe, expect, it } from 'vitest';
import { extractSpanishPokedexEntries, normalizePokedexEntryText } from './pokedex-entry-source.js';

describe('Spanish Pokédex entry acquisition', () => {
  it('keeps only Spanish versions with a known generation and normalizes technical whitespace', () => {
    const entries = extractSpanishPokedexEntries('pikachu', [
      { flavor_text: 'Almacena\nelectricidad\f en sus mejillas.', language: { name: 'es' }, version: { name: 'yellow' } },
      { flavor_text: 'Stores electricity.', language: { name: 'en' }, version: { name: 'yellow' } },
      { flavor_text: 'Texto desconocido', language: { name: 'es' }, version: { name: 'future-game' } },
    ]);
    expect(entries).toEqual([{ pokemonId: 'pikachu', text: 'Almacena electricidad en sus mejillas.', language: 'es', generation: 1, version: 'yellow', versionLabel: 'Pokémon Amarillo' }]);
  });

  it('does not rewrite punctuation or official wording', () => {
    expect(normalizePokedexEntryText('  ¡Dicen que…  aparece!  ')).toBe('¡Dicen que… aparece!');
  });
});
