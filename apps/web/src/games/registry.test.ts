import { describe, expect, it } from 'vitest';
import { clientGameRegistry } from './registry';

describe('client minigame registry', () => {
  it('registers one presentation strategy for every minigame', () => {
    expect(clientGameRegistry.list().map(({ id }) => id)).toEqual([
      'pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess',
      'pokeddle-race', 'pokemon-bingo', 'whos-that-pokemon', 'pokedex-entry-guess', 'type-chain',
      'guess-from-stats', 'zoomed-pokemon',
      'poke-taboo',
      'one-of-us-is-fake',
      'pokemon-bluff-auction',
      'sketchmon',
      'pokemon-connections',
      'pokemon-team-auction',
      'secret-ranking',
      'most-likely-to',
      'would-you-rather',
      'pokemon-red-flag',
      'tcg-higher-lower',
      'who-is-who-pokemon',
    ]);
  });

  it('keeps configuration, gameplay and results behind React lazy boundaries', () => {
    for (const module of clientGameRegistry.list()) {
      expect(module.ConfigPanel).toHaveProperty('$$typeof', Symbol.for('react.lazy'));
      expect(module.ActiveGame).toHaveProperty('$$typeof', Symbol.for('react.lazy'));
      expect(module.Results).toHaveProperty('$$typeof', Symbol.for('react.lazy'));
    }
  });

  it('can preload every dynamically registered component export', async () => {
    await Promise.all(clientGameRegistry.list().flatMap((module) => [module.preloadConfig(), module.preloadGameplay()]));
  });
});
