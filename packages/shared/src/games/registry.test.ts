import { describe, expect, it } from 'vitest';
import { defaultPokedexDistanceConfig, defaultShinyVoteConfig, GameRegistry, gameRegistry, pokedexDistanceGame, shinyVoteGame } from '../index.js';

describe('multi-game registry', () => {
  it('registers Pokédex Distance and Shiny Quiz simultaneously', () => {
    expect(gameRegistry.manifests().map((game) => [game.id, game.name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
    ]);
  });

  it('keeps both modules available when selecting either id', () => {
    const pokedex = gameRegistry.get('pokedex-distance');
    const shiny = gameRegistry.get('shiny-vote');
    expect(pokedex).toBe(pokedexDistanceGame);
    expect(shiny).toBe(shinyVoteGame);
    expect(gameRegistry.list()).toHaveLength(2);
    expect(pokedex?.defaultConfig).toEqual(defaultPokedexDistanceConfig);
    expect(shiny?.defaultConfig).toEqual(defaultShinyVoteConfig);
  });

  it('rejects duplicate ids instead of silently replacing a game', () => {
    const registry = new GameRegistry().register(pokedexDistanceGame).register(shinyVoteGame);
    expect(() => registry.register(pokedexDistanceGame)).toThrow(/Duplicate game id/);
    expect(registry.list()).toEqual([pokedexDistanceGame, shinyVoteGame]);
  });
});
