import type { MiniGameManifest, MiniGameModule } from './contracts.js';
import { pokedexDistanceGame } from './pokedex-distance/server.js';
import { shinyVoteGame } from './shiny-vote/server.js';
import { pokemonImpostorGame } from './pokemon-impostor/server.js';
import { higherLowerGame } from './higher-lower/server.js';
import { typeDuelGame } from './type-duel/server.js';

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
  manifests(): MiniGameManifest[] { return this.list().map((game) => ({ ...game.manifest })); }
}

/** Registration is additive: adding a game never replaces an existing module. */
export const gameRegistry = new GameRegistry()
  .register(pokedexDistanceGame)
  .register(shinyVoteGame)
  .register(pokemonImpostorGame)
  .register(higherLowerGame)
  .register(typeDuelGame);
