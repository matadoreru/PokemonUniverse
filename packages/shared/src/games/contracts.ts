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
  roomCode?: string;
}

export interface GameActionResult<TState> {
  state: TState;
  accepted: boolean;
  error?: string;
}

export interface MiniGameManifest {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers?: number;
}

export interface GameAssetRequest {
  assetToken: string;
  roundNumber: number;
  assetId: string;
}

export interface MiniGameModule<TConfig, TState, TAction, TPublicState> {
  readonly manifest: MiniGameManifest;
  readonly configSchema: z.ZodType<TConfig>;
  readonly actionSchema: z.ZodType<TAction>;
  readonly defaultConfig: TConfig;
  createInitialState(config: TConfig, context: GameContext): TState;
  start(state: TState, context: GameContext): TState;
  handleAction(state: TState, playerId: string, action: TAction, context: GameContext): GameActionResult<TState>;
  handleTimeout(state: TState, context: GameContext): TState;
  getPublicState(state: TState, context: GameContext): TPublicState;
  getPlayerState(state: TState, playerId: string, context: GameContext): unknown;
  resolveAsset?(state: TState, request: GameAssetRequest, context: GameContext): string | null;
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
