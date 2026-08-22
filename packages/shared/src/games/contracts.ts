import type { z } from 'zod';
import type { PokemonCatalog } from '../pokemon/types.js';

export type GamePhase =
  | 'GAME_STARTING'
  | 'ROUND_ACTIVE'
  | 'ROUND_RESULTS'
  | 'TIEBREAKER_ACTIVE'
  | 'GAME_RESULTS';

export interface GamePlayer {
  id: string;
  displayName: string;
}

export interface GameContext {
  players: readonly GamePlayer[];
  pokemon: PokemonCatalog;
  now: number;
  random: () => number;
}

export interface GameActionResult<TState> {
  state: TState;
  accepted: boolean;
  error?: string;
}

export interface MiniGameModule<TConfig, TState, TAction, TPublicState> {
  readonly manifest: {
    id: string;
    name: string;
    description: string;
    minPlayers: number;
    maxPlayers?: number;
  };
  readonly configSchema: z.ZodType<TConfig>;
  readonly actionSchema: z.ZodType<TAction>;
  readonly defaultConfig: TConfig;
  createInitialState(config: TConfig, context: GameContext): TState;
  start(state: TState, context: GameContext): TState;
  handleAction(state: TState, playerId: string, action: TAction, context: GameContext): GameActionResult<TState>;
  handleTimeout(state: TState, context: GameContext): TState;
  getPublicState(state: TState, context: GameContext): TPublicState;
  getPlayerState(state: TState, playerId: string, context: GameContext): unknown;
  isFinished(state: TState): boolean;
  getResults(state: TState): GameResults;
}

export interface GameStanding {
  playerId: string;
  position: number;
  points: number;
  stats: Record<string, number>;
}

export interface GameResults {
  winnerId: string | null;
  standings: GameStanding[];
}
