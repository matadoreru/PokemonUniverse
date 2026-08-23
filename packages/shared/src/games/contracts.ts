import type { z } from 'zod';
import type { PokemonCatalog } from '../pokemon/types.js';

export type GamePhase =
  | 'GAME_STARTING'
  | 'ROUND_ACTIVE'
  | 'ROUND_RESULTS'
  | 'TIEBREAKER_ACTIVE'
  | 'ROLE_REVEAL'
  | 'CLUE_PHASE'
  | 'VOTING'
  | 'VOTE_RESULTS'
  | 'ELIMINATION'
  | 'SELECTING_TYPES'
  | 'TYPE_REVEAL'
  | 'INVALID_COMBINATION'
  | 'POKEMON_SEARCH'
  | 'GAME_RESULTS';

export interface GamePlayer {
  id: string;
  displayName: string;
  /** Defaults to true for callers (notably unit tests) that omit presence. */
  connected?: boolean;
  /** False for room spectators and identities whose reconnect grace expired. */
  active?: boolean;
}

export function isPlayerRequired(context: GameContext, playerId: string): boolean {
  const player = context.players.find((candidate) => candidate.id === playerId);
  return Boolean(player && player.connected !== false && player.active !== false);
}

export function connectedRequiredPlayerIds(
  context: GameContext,
  candidateIds: readonly string[],
): string[] {
  return candidateIds.filter((playerId) => isPlayerRequired(context, playerId));
}

export function allConnectedRequiredCompleted(
  context: GameContext,
  candidateIds: readonly string[],
  completed: (playerId: string) => boolean,
): boolean {
  return connectedRequiredPlayerIds(context, candidateIds).every(completed);
}

export interface GameContext {
  players: readonly GamePlayer[];
  pokemon: PokemonCatalog;
  now: number;
  random: () => number;
  roomCode?: string;
  hostId?: string;
  preloadImage?: (source: string) => void;
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
  /** Lets a game advance immediately when the room's presence set changes. */
  handlePresenceChange?(state: TState, context: GameContext): TState;
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
