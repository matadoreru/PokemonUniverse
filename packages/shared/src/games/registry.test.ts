import { describe, expect, it } from 'vitest';
import { defaultPokedexDistanceConfig, defaultPokemonImpostorConfig, defaultShinyVoteConfig, GameRegistry, gameRegistry, pokedexDistanceGame, pokemonImpostorGame, shinyVoteGame } from '../index.js';

describe('multi-game registry', () => {
  it('registers every minigame simultaneously', () => {
    expect(gameRegistry.manifests().map((game) => [game.id, game.name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
    ]);
  });

  it('keeps both modules available when selecting either id', () => {
    const pokedex = gameRegistry.get('pokedex-distance');
    const shiny = gameRegistry.get('shiny-vote');
    const impostor = gameRegistry.get('pokemon-impostor');
    expect(pokedex).toBe(pokedexDistanceGame);
    expect(shiny).toBe(shinyVoteGame);
    expect(impostor).toBe(pokemonImpostorGame);
    expect(gameRegistry.list()).toHaveLength(3);
    expect(pokedex?.defaultConfig).toEqual(defaultPokedexDistanceConfig);
    expect(shiny?.defaultConfig).toEqual(defaultShinyVoteConfig);
    expect(impostor?.defaultConfig).toEqual(defaultPokemonImpostorConfig);
  });

  it('rejects duplicate ids instead of silently replacing a game', () => {
    const registry = new GameRegistry().register(pokedexDistanceGame).register(shinyVoteGame).register(pokemonImpostorGame);
    expect(() => registry.register(pokedexDistanceGame)).toThrow(/Duplicate game id/);
    expect(registry.list()).toEqual([pokedexDistanceGame, shinyVoteGame, pokemonImpostorGame]);
  });
});
