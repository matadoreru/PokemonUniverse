import { describe, expect, it } from 'vitest';
import { defaultPokemonBingoConfig } from '@pokemon-universe/shared';
import { validatePokemonBingoConfig } from './ConfigPanel';

describe('Pokémon Bingo lobby validation', () => {
  it('requires an active condition family', () => {
    const families = Object.fromEntries(Object.keys(defaultPokemonBingoConfig.families).map((key) => [key, false]));
    expect(validatePokemonBingoConfig({ ...defaultPokemonBingoConfig, families })).toMatch(/al menos una familia/);
  });

  it('detects an obviously impossible single-family board before Start', () => {
    const families = { ...Object.fromEntries(Object.keys(defaultPokemonBingoConfig.families).map((key) => [key, false])), generation: true };
    expect(validatePokemonBingoConfig({ ...defaultPokemonBingoConfig, width: 3, height: 3, generations: [1, 2], families })).toMatch(/No hay suficientes/);
  });

  it('accepts the default responsive configuration', () => { expect(validatePokemonBingoConfig(defaultPokemonBingoConfig)).toBeNull(); });
});
