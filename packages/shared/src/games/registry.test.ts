import { describe, expect, it } from 'vitest';
import { defaultHigherLowerConfig, defaultPokedexDistanceConfig, defaultPokemonImpostorConfig, defaultShinyVoteConfig, defaultTypeDuelConfig, GameRegistry, gameRegistry, higherLowerGame, pokedexDistanceGame, pokemonImpostorGame, shinyVoteGame, typeDuelGame } from '../index.js';

describe('multi-game registry', () => {
  it('registers every minigame simultaneously', () => {
    expect(gameRegistry.manifests().map((game) => [game.id, game.name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
      ['higher-lower', 'Higher or Lower'],
      ['type-duel', 'Type Duel'],
    ]);
  });

  it('keeps every module and its own default configuration available', () => {
    const pokedex = gameRegistry.get('pokedex-distance');
    const shiny = gameRegistry.get('shiny-vote');
    const impostor = gameRegistry.get('pokemon-impostor');
    const higherLower = gameRegistry.get('higher-lower'); const typeDuel = gameRegistry.get('type-duel');
    expect(pokedex).toBe(pokedexDistanceGame);
    expect(shiny).toBe(shinyVoteGame);
    expect(impostor).toBe(pokemonImpostorGame);
    expect(higherLower).toBe(higherLowerGame); expect(typeDuel).toBe(typeDuelGame); expect(gameRegistry.list()).toHaveLength(5);
    expect(pokedex?.defaultConfig).toEqual(defaultPokedexDistanceConfig);
    expect(shiny?.defaultConfig).toEqual(defaultShinyVoteConfig);
    expect(impostor?.defaultConfig).toEqual(defaultPokemonImpostorConfig);
    expect(higherLower?.defaultConfig).toEqual(defaultHigherLowerConfig); expect(typeDuel?.defaultConfig).toEqual(defaultTypeDuelConfig);
  });

  it('rejects duplicate ids instead of silently replacing a game', () => {
    const registry = new GameRegistry().register(pokedexDistanceGame).register(shinyVoteGame).register(pokemonImpostorGame).register(higherLowerGame).register(typeDuelGame);
    expect(() => registry.register(pokedexDistanceGame)).toThrow(/Duplicate game id/);
    expect(registry.list()).toEqual([pokedexDistanceGame, shinyVoteGame, pokemonImpostorGame, higherLowerGame, typeDuelGame]);
  });
});
