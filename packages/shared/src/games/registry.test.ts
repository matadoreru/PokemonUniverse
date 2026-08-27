import { describe, expect, it } from 'vitest';
import { defaultGuessFromStatsConfig, defaultHigherLowerConfig, defaultLearnsetGuessConfig, defaultMostLikelyToConfig, defaultOneOfUsIsFakeConfig, defaultPokedexDistanceConfig, defaultPokedexEntryGuessConfig, defaultPokeTabooConfig, defaultPokeddleRaceConfig, defaultPokemonBingoConfig, defaultPokemonBluffAuctionConfig, defaultPokemonConnectionsConfig, defaultPokemonImpostorConfig, defaultPokemonRedFlagConfig, defaultPokemonTeamAuctionConfig, defaultSecretRankingConfig, defaultShinyVoteConfig, defaultSketchmonConfig, defaultTypeChainConfig, defaultTypeDuelConfig, defaultWhosThatPokemonConfig, defaultWouldYouRatherConfig, defaultZoomedPokemonConfig, GameRegistry, gameRegistry, guessFromStatsGame, higherLowerGame, learnsetGuessGame, mostLikelyToGame, oneOfUsIsFakeGame, pokeTabooGame, pokeddleRaceGame, pokemonBingoGame, pokemonBluffAuctionGame, pokemonConnectionsGame, pokemonRedFlagGame, pokemonTeamAuctionGame, pokedexDistanceGame, pokedexEntryGuessGame, pokemonImpostorGame, secretRankingGame, shinyVoteGame, sketchmonGame, typeChainGame, typeDuelGame, whosThatPokemonGame, wouldYouRatherGame, zoomedPokemonGame } from '../index.js';

describe('multi-game registry', () => {
  it('registers every minigame simultaneously', () => {
    expect(gameRegistry.manifests().map((game) => [game.id, game.name])).toEqual([
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
      ['type-duel', 'Type Duel'],
      ['zoomed-pokemon', 'Zoomed Pokémon'],
      ['pokemon-team-auction', 'Pokémon Team Auction'],
      ['pokemon-red-flag', 'Pokémon Red Flag / Green Flag'],
      ['pokedex-distance', 'Pokédex Distance'],
      ['higher-lower', 'Higher or Lower'],
      ['learnset-guess', 'Learnset Guess'],
      ['pokeddle-race', 'Pokédle Race'],
      ['pokemon-bingo', 'Pokémon Bingo'],
      ['whos-that-pokemon', '¿Quién es ese Pokémon?'],
      ['pokedex-entry-guess', 'Pokédex Entry Guess'],
      ['type-chain', 'Type Chain'],
      ['guess-from-stats', 'Guess from Stats'],
      ['poke-taboo', 'PokéTaboo'],
      ['one-of-us-is-fake', 'One of Us Is Fake'],
      ['pokemon-bluff-auction', 'Pokémon Bluff Auction'],
      ['sketchmon', 'Sketchmon'],
      ['pokemon-connections', 'Pokémon Connections'],
      ['secret-ranking', 'Secret Ranking'],
      ['most-likely-to', 'Most Likely To'],
      ['would-you-rather', 'Would You Rather Pokémon'],
    ]);
  });

  it('marks only the games introduced after the original catalog as experimental', () => {
    expect(gameRegistry.manifests().filter((game) => game.experimental).map((game) => game.id)).toEqual([
      'pokemon-team-auction',
      'pokemon-red-flag',
      'sketchmon',
      'pokemon-connections',
      'secret-ranking',
      'most-likely-to',
      'would-you-rather',
    ]);
  });

  it('exposes the curated recommended games through shared manifest metadata', () => {
    expect(gameRegistry.manifests().filter((game) => game.recommended).map((game) => game.id)).toEqual([
      'shiny-vote', 'pokemon-impostor', 'type-duel', 'zoomed-pokemon', 'pokemon-team-auction', 'pokemon-red-flag',
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
    const pokeddle = gameRegistry.get('pokeddle-race'); const bingo = gameRegistry.get('pokemon-bingo'); const who = gameRegistry.get('whos-that-pokemon'); const entryGuess = gameRegistry.get('pokedex-entry-guess'); const typeChain = gameRegistry.get('type-chain'); const statsGuess = gameRegistry.get('guess-from-stats');
    const zoomed = gameRegistry.get('zoomed-pokemon'); const taboo = gameRegistry.get('poke-taboo'); const fake = gameRegistry.get('one-of-us-is-fake'); const bluff = gameRegistry.get('pokemon-bluff-auction'); const sketchmon = gameRegistry.get('sketchmon'); const connections = gameRegistry.get('pokemon-connections'); const teamAuction = gameRegistry.get('pokemon-team-auction'); const secretRanking = gameRegistry.get('secret-ranking'); const mostLikelyTo = gameRegistry.get('most-likely-to'); const wouldYouRather = gameRegistry.get('would-you-rather'); const redFlag = gameRegistry.get('pokemon-red-flag');
    expect(higherLower).toBe(higherLowerGame); expect(typeDuel).toBe(typeDuelGame); expect(learnset).toBe(learnsetGuessGame); expect(pokeddle).toBe(pokeddleRaceGame); expect(bingo).toBe(pokemonBingoGame); expect(who).toBe(whosThatPokemonGame); expect(entryGuess).toBe(pokedexEntryGuessGame); expect(typeChain).toBe(typeChainGame); expect(statsGuess).toBe(guessFromStatsGame); expect(zoomed).toBe(zoomedPokemonGame); expect(taboo).toBe(pokeTabooGame); expect(fake).toBe(oneOfUsIsFakeGame); expect(bluff).toBe(pokemonBluffAuctionGame); expect(sketchmon).toBe(sketchmonGame); expect(connections).toBe(pokemonConnectionsGame); expect(teamAuction).toBe(pokemonTeamAuctionGame); expect(secretRanking).toBe(secretRankingGame); expect(mostLikelyTo).toBe(mostLikelyToGame); expect(wouldYouRather).toBe(wouldYouRatherGame); expect(redFlag).toBe(pokemonRedFlagGame); expect(gameRegistry.list()).toHaveLength(23);
    expect(pokedex?.defaultConfig).toEqual(defaultPokedexDistanceConfig);
    expect(shiny?.defaultConfig).toEqual(defaultShinyVoteConfig);
    expect(impostor?.defaultConfig).toEqual(defaultPokemonImpostorConfig);
    expect(higherLower?.defaultConfig).toEqual(defaultHigherLowerConfig); expect(typeDuel?.defaultConfig).toEqual(defaultTypeDuelConfig); expect(learnset?.defaultConfig).toEqual(defaultLearnsetGuessConfig);
    expect(pokeddle?.defaultConfig).toEqual(defaultPokeddleRaceConfig);
    expect(bingo?.defaultConfig).toEqual(defaultPokemonBingoConfig);
    expect(who?.defaultConfig).toEqual(defaultWhosThatPokemonConfig);
    expect(entryGuess?.defaultConfig).toEqual(defaultPokedexEntryGuessConfig);
    expect(typeChain?.defaultConfig).toEqual(defaultTypeChainConfig);
    expect(statsGuess?.defaultConfig).toEqual(defaultGuessFromStatsConfig);
    expect(zoomed?.defaultConfig).toEqual(defaultZoomedPokemonConfig);
    expect(taboo?.defaultConfig).toEqual(defaultPokeTabooConfig);
    expect(fake?.defaultConfig).toEqual(defaultOneOfUsIsFakeConfig);
    expect(bluff?.defaultConfig).toEqual(defaultPokemonBluffAuctionConfig);
    expect(sketchmon?.defaultConfig).toEqual(defaultSketchmonConfig);
    expect(connections?.defaultConfig).toEqual(defaultPokemonConnectionsConfig);
    expect(teamAuction?.defaultConfig).toEqual(defaultPokemonTeamAuctionConfig);
    expect(secretRanking?.defaultConfig).toEqual(defaultSecretRankingConfig);
    expect(mostLikelyTo?.defaultConfig).toEqual(defaultMostLikelyToConfig);
    expect(wouldYouRather?.defaultConfig).toEqual(defaultWouldYouRatherConfig);
    expect(redFlag?.defaultConfig).toEqual(defaultPokemonRedFlagConfig);
  });

  it('rejects duplicate ids instead of silently replacing a game', () => {
    const registry = new GameRegistry().register(pokedexDistanceGame).register(shinyVoteGame).register(pokemonImpostorGame).register(higherLowerGame).register(typeDuelGame).register(learnsetGuessGame).register(pokeddleRaceGame).register(pokemonBingoGame).register(whosThatPokemonGame).register(pokedexEntryGuessGame).register(typeChainGame).register(guessFromStatsGame).register(zoomedPokemonGame).register(pokeTabooGame).register(oneOfUsIsFakeGame).register(pokemonBluffAuctionGame).register(sketchmonGame).register(pokemonConnectionsGame).register(pokemonTeamAuctionGame).register(secretRankingGame).register(mostLikelyToGame).register(wouldYouRatherGame).register(pokemonRedFlagGame);
    expect(() => registry.register(pokedexDistanceGame)).toThrow(/Duplicate game id/);
    expect(registry.list()).toEqual([pokedexDistanceGame, shinyVoteGame, pokemonImpostorGame, higherLowerGame, typeDuelGame, learnsetGuessGame, pokeddleRaceGame, pokemonBingoGame, whosThatPokemonGame, pokedexEntryGuessGame, typeChainGame, guessFromStatsGame, zoomedPokemonGame, pokeTabooGame, oneOfUsIsFakeGame, pokemonBluffAuctionGame, sketchmonGame, pokemonConnectionsGame, pokemonTeamAuctionGame, secretRankingGame, mostLikelyToGame, wouldYouRatherGame, pokemonRedFlagGame]);
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
