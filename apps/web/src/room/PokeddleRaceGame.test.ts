import { describe, expect, it } from 'vitest';
import { formatPokeddleFeedback } from './PokeddleRaceGame';

describe('Pokédle board accessible feedback', () => {
  it('uses icons and text in addition to colour', () => {
    expect(formatPokeddleFeedback('attack', { kind: 'NUMERIC', value: 84, result: 'HIGHER' })).toMatchObject({ value: 84, result: '↑ Mayor' });
    expect(formatPokeddleFeedback('types', { kind: 'TYPES', value: ['fire'], result: 'PARTIAL' }).result).toBe('~ Parcial');
    expect(formatPokeddleFeedback('types', { kind: 'TYPES', value: ['water'], result: 'NONE' }).result).toBe('× Ninguno');
  });
});
