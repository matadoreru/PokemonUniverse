import { describe, expect, it } from 'vitest';
import { defaultHigherLowerConfig, defaultLearnsetGuessConfig, defaultPokedexDistanceConfig, defaultPokeddleRaceConfig, defaultPokemonBingoConfig, defaultPokemonImpostorConfig, defaultShinyVoteConfig, defaultTypeDuelConfig, GameRegistry, gameRegistry, higherLowerGame, learnsetGuessGame, pokeddleRaceGame, pokemonBingoGame, pokedexDistanceGame, pokemonImpostorGame, shinyVoteGame, typeDuelGame } from '../index.js';

describe('multi-game registry', () => {
  it('registers every minigame simultaneously', () => {
    expect(gameRegistry.manifests().map((game) => [game.id, game.name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
      ['higher-lower', 'Higher or Lower'],
      ['type-duel', 'Type Duel'],
      ['learnset-guess', 'Learnset Guess'],
      ['pokeddle-race', 'Pokédle Race'],
      ['pokemon-bingo', 'Pokémon Bingo'],
    ]);
  });

  it('keeps every module and its own default configuration available', () => {
    const pokedex = gameRegistry.get('pokedex-distance');
    const shiny = gameRegistry.get('shiny-vote');
    const impostor = gameRegistry.get('pokemon-impostor');
    const higherLower = gameRegistry.get('higher-lower'); const typeDuel = gameRegistry.get('type-duel'); const learnset = gameRegistry.get('learnset-guess');
    expect(pokedex).toBe(pokedexDistanceGame);
    expect(shiny).toBe(shinyVoteGame);
    expect(impostor).toBe(pokemonImpostorGame);
    const pokeddle = gameRegistry.get('pokeddle-race'); const bingo = gameRegistry.get('pokemon-bingo');
    expect(higherLower).toBe(higherLowerGame); expect(typeDuel).toBe(typeDuelGame); expect(learnset).toBe(learnsetGuessGame); expect(pokeddle).toBe(pokeddleRaceGame); expect(bingo).toBe(pokemonBingoGame); expect(gameRegistry.list()).toHaveLength(8);
    expect(pokedex?.defaultConfig).toEqual(defaultPokedexDistanceConfig);
    expect(shiny?.defaultConfig).toEqual(defaultShinyVoteConfig);
    expect(impostor?.defaultConfig).toEqual(defaultPokemonImpostorConfig);
    expect(higherLower?.defaultConfig).toEqual(defaultHigherLowerConfig); expect(typeDuel?.defaultConfig).toEqual(defaultTypeDuelConfig); expect(learnset?.defaultConfig).toEqual(defaultLearnsetGuessConfig);
    expect(pokeddle?.defaultConfig).toEqual(defaultPokeddleRaceConfig);
    expect(bingo?.defaultConfig).toEqual(defaultPokemonBingoConfig);
  });

  it('rejects duplicate ids instead of silently replacing a game', () => {
    const registry = new GameRegistry().register(pokedexDistanceGame).register(shinyVoteGame).register(pokemonImpostorGame).register(higherLowerGame).register(typeDuelGame).register(learnsetGuessGame).register(pokeddleRaceGame).register(pokemonBingoGame);
    expect(() => registry.register(pokedexDistanceGame)).toThrow(/Duplicate game id/);
    expect(registry.list()).toEqual([pokedexDistanceGame, shinyVoteGame, pokemonImpostorGame, higherLowerGame, typeDuelGame, learnsetGuessGame, pokeddleRaceGame, pokemonBingoGame]);
  });

  it('exposes a profile statistics definition for every registered game', () => {
    for (const manifest of gameRegistry.manifests()) {
      expect(manifest.icon).toBeTruthy();
      expect(manifest.profileStats.metrics.length + (manifest.profileStats.derivedMetrics?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it('accepts profile statistics metadata from a future game without central profile changes', () => {
    const futureGame = {
      ...pokedexDistanceGame,
      manifest: {
        ...pokedexDistanceGame.manifest,
        id: 'pokemon-cry-quiz',
        name: 'Pokémon Cry Quiz',
        icon: '🔊',
        profileStats: {
          metrics: [{ key: 'correct', label: 'Aciertos', aggregation: 'SUM' as const }],
          derivedMetrics: [],
        },
      },
    };
    const registry = new GameRegistry().register(futureGame);

    expect(registry.manifests()[0]?.profileStats.metrics).toEqual([
      { key: 'correct', label: 'Aciertos', aggregation: 'SUM' },
    ]);
  });
});
