import { z } from 'zod';
import type { AvatarRef } from './avatar.js';
import type { GamePhase, MiniGameManifest } from './games/contracts.js';

export type RoomPhase = 'LOBBY' | GamePhase | 'NEXT_GAME_VOTE' | 'NEXT_GAME_VOTE_RESULTS' | 'SESSION_RESULTS';
export type MemberRole = 'PLAYER' | 'SPECTATOR';
export const ROOM_ROLES = ['HOST', 'CO_HOST', 'MEMBER'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];
export const assignableRoomRoleSchema = z.enum(['CO_HOST', 'MEMBER']);
export type AssignableRoomRole = z.infer<typeof assignableRoomRoleSchema>;
export const ROOM_PERMISSIONS = ['CHANGE_GAME', 'EDIT_GAME_CONFIG', 'EDIT_SESSION', 'EDIT_GAME_SELECTION', 'START_GAME', 'END_SESSION', 'MANAGE_ROLES', 'KICK_MEMBER', 'TRANSFER_HOST'] as const;
export type RoomPermission = (typeof ROOM_PERMISSIONS)[number];
const ROOM_ROLE_PERMISSIONS: Record<RoomRole, readonly RoomPermission[]> = {
  HOST: ROOM_PERMISSIONS,
  CO_HOST: ['CHANGE_GAME', 'EDIT_GAME_CONFIG', 'EDIT_SESSION', 'EDIT_GAME_SELECTION'],
  MEMBER: [],
};

export function hasRoomPermission(role: RoomRole, permission: RoomPermission): boolean {
  return ROOM_ROLE_PERMISSIONS[role].includes(permission);
}

export function formatPendingReadyNames(displayNames: readonly string[]): string {
  const visible = displayNames.slice(0, 3).join(', ');
  const remaining = displayNames.length - 3;
  return remaining > 0 ? `${visible} y ${remaining} más` : visible;
}

export type PresenceStatus = 'CONNECTED' | 'TEMPORARILY_DISCONNECTED' | 'LEFT';

export interface RoomMemberView {
  id: string;
  displayName: string;
  avatar: AvatarRef;
  connected: boolean;
  presence: PresenceStatus;
  roomRole: RoomRole;
  /** Participation role for the current minigame, independent from room permissions. */
  role: MemberRole;
  isHost: boolean;
  /** Lobby acknowledgement. The host controls starting and does not need to mark ready. */
  ready: boolean;
  sessionPoints: number;
}

export interface SessionStandingView {
  id: string;
  displayName: string;
  avatar: AvatarRef;
  sessionPoints: number;
}

export interface SessionGameSummaryView {
  gameNumber: number;
  gameId: string;
  winnerIds: string[];
  points: Record<string, number>;
}

export type SessionMode =
  | { type: 'INFINITE' }
  | { type: 'GAME_COUNT'; target: number }
  | { type: 'POINT_TARGET'; target: number };

export function isSessionComplete(mode: SessionMode, gamesPlayed: number, sessionPoints: Iterable<number>): boolean {
  if (mode.type === 'INFINITE') return false;
  if (mode.type === 'GAME_COUNT') return gamesPlayed >= mode.target;
  for (const points of sessionPoints) if (points >= mode.target) return true;
  return false;
}

export type GameSelectionMode =
  | { type: 'FIXED' }
  | { type: 'RANDOM'; gameIds: string[] }
  | { type: 'VOTE'; gameIds: string[] };

export interface NextGameVoteView {
  options: MiniGameManifest[];
  eligibleVoterIds: string[];
  votedPlayerIds: string[];
  ownVoteGameId: string | null;
  endsAt: number | null;
  resolvedGameId: string | null;
  tallies: Record<string, number> | null;
  nextTransitionAt: number | null;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string;
  maxPlayers: number;
  members: RoomMemberView[];
  availableGames: MiniGameManifest[];
  selectedGameId: string;
  selectedGameConfig: unknown;
  /** Lobby-safe configuration for every registered game, keyed by game id. */
  gameConfigs?: Record<string, unknown>;
  /** Games whose saved configuration differs from the registered defaults. */
  customizedGameIds?: string[];
  sessionMode: SessionMode;
  gameSelectionMode: GameSelectionMode;
  nextGameVote: NextGameVoteView | null;
  gamesPlayed: number;
  sessionStandings: SessionStandingView[];
  sessionHistory: SessionGameSummaryView[];
  game: unknown | null;
  gamePlayerState: unknown | null;
  serverNow: number;
  /** Enabled custom categories owned by the host; used for lobby validation only. */
  hostCustomCategoryCount?: number;
  /** Enabled custom Would You Rather pairs owned by the host; used for lobby validation only. */
  hostWouldYouRatherPromptCount?: number;
}

export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
export const displayNameSchema = z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N}_ -]+$/u);
export const sessionModeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('INFINITE') }),
  z.object({ type: z.literal('GAME_COUNT'), target: z.number().int().min(1).max(100) }),
  z.object({ type: z.literal('POINT_TARGET'), target: z.number().int().min(5).max(10000) }),
]);

const randomGameIdsSchema = z.array(z.string().min(1)).min(2, 'Selecciona al menos 2 minijuegos.').refine((ids) => new Set(ids).size === ids.length, 'Los minijuegos no pueden repetirse.');
const voteGameIdsSchema = z.array(z.string().min(1)).min(3, 'Selecciona al menos 3 minijuegos.').refine((ids) => new Set(ids).size === ids.length, 'Los minijuegos no pueden repetirse.');
export const gameSelectionModeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FIXED') }),
  z.object({ type: z.literal('RANDOM'), gameIds: randomGameIdsSchema }),
  z.object({ type: z.literal('VOTE'), gameIds: voteGameIdsSchema }),
]);

export interface ClientToServerEvents {
  'room:create': (payload: { maxPlayers?: number }, ack: SocketAck<{ room: RoomView }>) => void;
  'room:join': (payload: { code: string }, ack: SocketAck<{ room: RoomView }>) => void;
  'room:leave': (_: unknown, ack: SocketAck) => void;
  'room:select-game': (payload: { gameId: string }, ack: SocketAck) => void;
  'room:update-config': (payload: { config: unknown }, ack: SocketAck) => void;
  'room:update-game-config': (payload: { gameId: string; config: unknown }, ack: SocketAck) => void;
  'room:update-session': (payload: { mode: SessionMode }, ack: SocketAck) => void;
  'room:update-game-selection': (payload: { mode: GameSelectionMode }, ack: SocketAck) => void;
  'room:vote-next-game': (payload: { gameId: string }, ack: SocketAck) => void;
  'room:set-role': (payload: { playerId: string; role: AssignableRoomRole }, ack: SocketAck) => void;
  'room:transfer-host': (payload: { playerId: string }, ack: SocketAck) => void;
  'room:kick': (payload: { playerId: string }, ack: SocketAck) => void;
  'room:set-ready': (payload: { ready: boolean }, ack: SocketAck) => void;
  'room:start-game': (_: unknown, ack: SocketAck) => void;
  'room:continue-session': (_: unknown, ack: SocketAck) => void;
  'room:return-lobby': (_: unknown, ack: SocketAck) => void;
  'room:end-session': (_: unknown, ack: SocketAck) => void;
  'game:action': (payload: unknown, ack: SocketAck) => void;
  'who-is-who:cursor': (payload: unknown, ack?: SocketAck) => void;
  'who-is-who:cursor-clear': (_: unknown, ack?: SocketAck) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:kicked': (reason: string) => void;
  'session:restored': (room: RoomView) => void;
  'error:message': (message: string) => void;
  'who-is-who:cursor': (cursor: import('./games/who-is-who-pokemon/types.js').WhoIsWhoCursorEvent) => void;
  'who-is-who:cursor-clear': (payload: { playerId: string }) => void;
  'who-is-who:cursors-reset': () => void;
}

export type SocketAck<T = Record<string, never>> = (response: ({ ok: true } & T) | { ok: false; error: string }) => void;
