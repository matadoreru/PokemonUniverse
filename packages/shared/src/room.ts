import { z } from 'zod';
import type { MiniGameManifest } from './games/contracts.js';

export type RoomPhase = 'LOBBY' | 'GAME_STARTING' | 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'TIEBREAKER_ACTIVE' | 'GAME_RESULTS' | 'SESSION_RESULTS';
export type MemberRole = 'PLAYER' | 'SPECTATOR';

export interface RoomMemberView {
  id: string;
  displayName: string;
  avatarSeed: string;
  connected: boolean;
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
