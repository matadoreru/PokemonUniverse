import type { MiniGameModule } from './contracts.js';
import { pokedexDistanceGame } from './pokedex-distance/server.js';
import { shinyVoteGame } from './shiny-vote/server.js';

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
}

export const gameRegistry = new GameRegistry().register(shinyVoteGame).register(pokedexDistanceGame);
