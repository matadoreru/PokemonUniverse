import type { MiniGameManifest, MiniGameModule } from './contracts.js';
import { pokedexDistanceGame } from './pokedex-distance/server.js';
import { shinyVoteGame } from './shiny-vote/server.js';
import { pokemonImpostorGame } from './pokemon-impostor/server.js';
import { higherLowerGame } from './higher-lower/server.js';
import { typeDuelGame } from './type-duel/server.js';
import { learnsetGuessGame } from './learnset-guess/server.js';
import { pokeddleRaceGame } from './pokeddle-race/server.js';
import { pokemonBingoGame } from './pokemon-bingo/server.js';
import { whosThatPokemonGame } from './whos-that-pokemon/server.js';
import { pokedexEntryGuessGame } from './pokedex-entry-guess/server.js';
import { typeChainGame } from './type-chain/server.js';
import { guessFromStatsGame } from './guess-from-stats/server.js';
import { zoomedPokemonGame } from './zoomed-pokemon/server.js';
import { pokeTabooGame } from './poke-taboo/server.js';
import { oneOfUsIsFakeGame } from './one-of-us-is-fake/server.js';
import { pokemonBluffAuctionGame } from './pokemon-bluff-auction/server.js';
import { sketchmonGame } from './sketchmon/server.js';
import { pokemonConnectionsGame } from './pokemon-connections/server.js';
import { pokemonTeamAuctionGame } from './pokemon-team-auction/server.js';
import { secretRankingGame } from './secret-ranking/server.js';
import { mostLikelyToGame } from './most-likely-to/server.js';
import { wouldYouRatherGame } from './would-you-rather/server.js';
import { pokemonRedFlagGame } from './pokemon-red-flag/server.js';
import { whoIsWhoPokemonGame } from './who-is-who-pokemon/server.js';
import { tcgHigherLowerGame } from './tcg-higher-lower/server.js';

export type RegisteredGame = MiniGameModule<any, any, any, any>;

export class GameRegistry {
  private readonly games = new Map<string, RegisteredGame>();
  register(game: RegisteredGame): this {
    if (this.games.has(game.manifest.id)) throw new Error(`Duplicate game id: ${game.manifest.id}`);
    this.games.set(game.manifest.id, game);
    return this;
  }
  get(id: string): RegisteredGame | undefined { return this.games.get(id); }
  list(): RegisteredGame[] { return [...this.games.values()]; }
  manifests(): MiniGameManifest[] {
    return this.list()
      .map((game) => ({ ...game.manifest }))
      .sort((left, right) => Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)));
  }
}

/** Registration is additive: adding a game never replaces an existing module. */
export const gameRegistry = new GameRegistry()
  .register(pokedexDistanceGame)
  .register(shinyVoteGame)
  .register(pokemonImpostorGame)
  .register(higherLowerGame)
  .register(typeDuelGame)
  .register(learnsetGuessGame)
  .register(pokeddleRaceGame)
  .register(pokemonBingoGame)
  .register(whosThatPokemonGame)
  .register(pokedexEntryGuessGame)
  .register(typeChainGame)
  .register(guessFromStatsGame)
  .register(zoomedPokemonGame)
  .register(pokeTabooGame)
  .register(oneOfUsIsFakeGame)
  .register(pokemonBluffAuctionGame)
  .register(sketchmonGame)
  .register(pokemonConnectionsGame)
  .register(pokemonTeamAuctionGame)
  .register(secretRankingGame)
  .register(mostLikelyToGame)
  .register(wouldYouRatherGame)
  .register(pokemonRedFlagGame)
  .register(tcgHigherLowerGame)
  .register(whoIsWhoPokemonGame);
