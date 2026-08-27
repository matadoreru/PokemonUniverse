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
  | 'TURN_ACTIVE'
  | 'CHOICE_REVEAL'
  | 'DISCUSSION'
  | 'REVOTE'
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
  /** Server-owned visual sources. Local artwork paths never enter public game state. */
  pokemonVisuals?: PokemonVisualCatalog;
  /** Enabled, persistent categories owned by the current room host. */
  hostCustomCategories?: readonly SubjectiveCategory[];
  /** Enabled, persistent Would You Rather pairs owned by the current room host. */
  hostWouldYouRatherPrompts?: readonly WouldYouRatherPromptPair[];
}

export interface SubjectiveCategory {
  id: string;
  text: string;
}

export interface WouldYouRatherPromptPair {
  id: string;
  optionA: string;
  optionB: string;
}

export interface PokemonVisualAsset {
  pokemonId: string;
  source: 'SPRITE' | 'ARTWORK';
  /** Trusted remote URL or an opaque local-artwork source understood by the server. */
  location: string;
  width?: number;
  height?: number;
  alphaBounds?: { x: number; y: number; width: number; height: number };
}

export interface PokemonVisualCatalog {
  artworkFor(pokemonId: string): PokemonVisualAsset | null;
  artworkPokemonIds(): readonly string[];
}

export interface GameActionResult<TState> {
  state: TState;
  accepted: boolean;
  error?: string;
}

export interface MiniGameManifest {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Marks recently introduced games that may still receive rule or balance changes. */
  experimental?: boolean;
  minPlayers: number;
  maxPlayers?: number;
  profileStats: ProfileStatsDefinition;
}

export function supportsPlayerCount(manifest: MiniGameManifest, playerCount: number): boolean {
  return playerCount >= manifest.minPlayers && (manifest.maxPlayers === undefined || playerCount <= manifest.maxPlayers);
}

export type ProfileMetricAggregation = 'SUM' | 'MAX' | 'MIN';
export interface ProfileMetricDefinition {
  key: string;
  label: string;
  aggregation: ProfileMetricAggregation;
  format?: 'NUMBER' | 'DURATION_MS';
}
export interface ProfileDerivedMetricDefinition {
  key: string;
  label: string;
  kind: 'PERCENT' | 'AVERAGE';
  numerator: string;
  denominator: readonly string[];
  format?: 'NUMBER' | 'DURATION_MS';
}
export interface ProfileStatsDefinition {
  metrics: readonly ProfileMetricDefinition[];
  derivedMetrics?: readonly ProfileDerivedMetricDefinition[];
}

export interface ProfileGameStats {
  gameId: string;
  gamesPlayed: number;
  gamesWon: number;
  points: number;
  metrics: Record<string, number>;
}

export interface UserProfileResponse {
  user: { id: string; username: string; email: string; avatar: import('../avatar.js').AvatarRef; createdAt: string };
  globalStats: { gamesPlayed: number; gamesWon: number; totalPoints: number };
  games: Array<MiniGameManifest & { stats: ProfileGameStats }>;
}

export interface GameAssetRequest {
  assetToken: string;
  roundNumber: number;
  assetId: string;
}

export type GameAssetTransform = 'ORIGINAL' | 'SILHOUETTE' | 'NORMALIZED' | 'FOCUSED_NORMALIZED' | 'PIXEL_ART' | 'PALETTE_RECOLOR';
export interface GameAssetRecolor {
  hueShiftDegrees: number;
  saturationScale: number;
  lightnessScale: number;
  contrast: number;
}
export interface GameAssetResolution {
  source: string;
  transform: GameAssetTransform;
  /** Used only by FOCUSED_NORMALIZED to deterministically select an alpha-safe focus. */
  focusSeed?: number;
  /** Used only by PALETTE_RECOLOR. It is retained in opaque server state. */
  recolor?: GameAssetRecolor;
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
  resolveAsset?(state: TState, request: GameAssetRequest, context: GameContext): string | GameAssetResolution | null;
  isFinished(state: TState): boolean;
  getResults(state: TState): GameResults;
}

export interface GameStanding {
  playerId: string;
  position: number;
  points: number;
  won?: boolean;
  stats: Record<string, number>;
}

export interface GameResults {
  winnerId: string | null;
  standings: GameStanding[];
}
