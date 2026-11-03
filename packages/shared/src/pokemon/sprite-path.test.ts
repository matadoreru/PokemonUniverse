import { describe, expect, it } from 'vitest';
import { pokemonSpritePath } from './sprite-path.js';

describe('pokemonSpritePath', () => {
  it('builds the sprite proxy path', () => {
    expect(pokemonSpritePath('raichu-alola')).toBe('/api/pokemon/raichu-alola/sprite');
  });

  it('encodes the id as a single path segment', () => {
    expect(pokemonSpritePath('mr mime/ü')).toBe('/api/pokemon/mr%20mime%2F%C3%BC/sprite');
  });
});
