import { describe, expect, it } from 'vitest';
import { clientGameRegistry } from './registry';

describe('client minigame registry', () => {
  it('registers one presentation strategy for every minigame', () => {
    expect(clientGameRegistry.list().map(({ id }) => id)).toEqual([
      'pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess',
      'pokeddle-race', 'pokemon-bingo', 'whos-that-pokemon', 'pokedex-entry-guess', 'type-chain',
      'guess-from-stats', 'zoomed-pokemon',
    ]);
  });
});
