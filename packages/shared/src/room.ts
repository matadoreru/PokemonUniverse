import { z } from 'zod';
import type { AvatarRef } from './avatar.js';
import type { GamePhase, MiniGameManifest } from './games/contracts.js';

export type RoomPhase = 'LOBBY' | GamePhase | 'SESSION_RESULTS';
export type MemberRole = 'PLAYER' | 'SPECTATOR';
export const ROOM_ROLES = ['HOST', 'CO_HOST', 'MEMBER'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];
export const assignableRoomRoleSchema = z.enum(['CO_HOST', 'MEMBER']);
export type AssignableRoomRole = z.infer<typeof assignableRoomRoleSchema>;
export const ROOM_PERMISSIONS = ['CHANGE_GAME', 'EDIT_GAME_CONFIG', 'EDIT_SESSION', 'START_GAME', 'END_SESSION', 'MANAGE_ROLES', 'KICK_MEMBER', 'TRANSFER_HOST'] as const;
export type RoomPermission = (typeof ROOM_PERMISSIONS)[number];
const ROOM_ROLE_PERMISSIONS: Record<RoomRole, readonly RoomPermission[]> = {
  HOST: ROOM_PERMISSIONS,
  CO_HOST: ['CHANGE_GAME', 'EDIT_GAME_CONFIG', 'EDIT_SESSION'],
  MEMBER: [],
};

export function hasRoomPermission(role: RoomRole, permission: RoomPermission): boolean {
  return ROOM_ROLE_PERMISSIONS[role].includes(permission);
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
  sessionPoints: number;
}

export type SessionMode =
  | { type: 'INFINITE' }
  | { type: 'GAME_COUNT'; target: number }
  | { type: 'POINT_TARGET'; target: number };

export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string;
  maxPlayers: number;
  members: RoomMemberView[];
  availableGames: MiniGameManifest[];
  selectedGameId: string;
  selectedGameConfig: unknown;
  sessionMode: SessionMode;
  gamesPlayed: number;
  game: unknown | null;
  gamePlayerState: unknown | null;
  serverNow: number;
}

export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
export const displayNameSchema = z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N}_ -]+$/u);
export const sessionModeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('INFINITE') }),
  z.object({ type: z.literal('GAME_COUNT'), target: z.number().int().min(1).max(100) }),
  z.object({ type: z.literal('POINT_TARGET'), target: z.number().int().min(5).max(10000) }),
]);

export interface ClientToServerEvents {
  'room:create': (payload: { maxPlayers?: number }, ack: SocketAck<{ room: RoomView }>) => void;
  'room:join': (payload: { code: string }, ack: SocketAck<{ room: RoomView }>) => void;
  'room:leave': (_: unknown, ack: SocketAck) => void;
  'room:select-game': (payload: { gameId: string }, ack: SocketAck) => void;
  'room:update-config': (payload: { config: unknown }, ack: SocketAck) => void;
  'room:update-session': (payload: { mode: SessionMode }, ack: SocketAck) => void;
  'room:set-role': (payload: { playerId: string; role: AssignableRoomRole }, ack: SocketAck) => void;
  'room:transfer-host': (payload: { playerId: string }, ack: SocketAck) => void;
  'room:kick': (payload: { playerId: string }, ack: SocketAck) => void;
  'room:start-game': (_: unknown, ack: SocketAck) => void;
  'room:return-lobby': (_: unknown, ack: SocketAck) => void;
  'room:end-session': (_: unknown, ack: SocketAck) => void;
  'game:action': (payload: unknown, ack: SocketAck) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:kicked': (reason: string) => void;
  'session:restored': (room: RoomView) => void;
  'error:message': (message: string) => void;
}

export type SocketAck<T = Record<string, never>> = (response: ({ ok: true } & T) | { ok: false; error: string }) => void;
