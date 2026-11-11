import { z } from 'zod';
import type { AchievementsUnlocked } from './achievements.js';
import type { AvatarRef } from './avatar.js';
import type { DailyGameId, DailyRoomInfo } from './daily.js';
import type { GamePhase, MiniGameManifest } from './games/contracts.js';

export type RoomPhase = 'LOBBY' | GamePhase | 'NEXT_GAME_VOTE' | 'NEXT_GAME_VOTE_RESULTS' | 'SESSION_RESULTS';
export type MemberRole = 'PLAYER' | 'SPECTATOR';
export const ROOM_ROLES = ['HOST', 'CO_HOST', 'MEMBER'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];
export const assignableRoomRoleSchema = z.enum(['CO_HOST', 'MEMBER']);
export type AssignableRoomRole = z.infer<typeof assignableRoomRoleSchema>;
export const ROOM_PERMISSIONS = ['CHANGE_GAME', 'EDIT_GAME_CONFIG', 'EDIT_SESSION', 'EDIT_GAME_SELECTION', 'START_GAME', 'END_SESSION', 'MANAGE_ROLES', 'KICK_MEMBER', 'TRANSFER_HOST', 'MODERATE_CHAT'] as const;
export type RoomPermission = (typeof ROOM_PERMISSIONS)[number];
const ROOM_ROLE_PERMISSIONS: Record<RoomRole, readonly RoomPermission[]> = {
  HOST: ROOM_PERMISSIONS,
  CO_HOST: ['CHANGE_GAME', 'EDIT_GAME_CONFIG', 'EDIT_SESSION', 'EDIT_GAME_SELECTION', 'MODERATE_CHAT'],
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
  /** Nivel de la cuenta registrada; `null` para invitados y ausente en el oráculo Node. */
  level?: number | null;
  /** Silenciado en el chat de la sala (dura lo que la sala). */
  chatMuted?: boolean;
}

/** Longitud máxima de un mensaje del chat del lobby, en unidades UTF-16 como `maxLength` (`RoomChat.MAX_LENGTH` en el backend). */
export const CHAT_MESSAGE_MAX_LENGTH = 200;

/** Mensaje del chat del lobby; `seq` crece por sala y no se reutiliza, `sentAt` son milisegundos epoch. */
export interface ChatMessage {
  seq: number;
  authorId: string;
  authorName: string;
  text: string;
  sentAt: number;
}

export interface SessionStandingView {
  id: string;
  displayName: string;
  avatar: AvatarRef;
  sessionPoints: number;
}

export interface SessionGameSummaryView {
  scoringVersion?: 'POSITION_V1';
  rawPoints?: Record<string, number>;
  /** Solo en una partida que valió doble (2): `points` ya lo lleva aplicado y `rawPoints` no. */
  pointsMultiplier?: number;
  gameNumber: number;
  gameId: string;
  winnerIds: string[];
  points: Record<string, number>;
}

export type SessionMode =
  | { type: 'INFINITE' }
  | { type: 'GAME_COUNT'; target: number; /** «La última partida vale doble»; ausente es `false`. */ doubleLastGame?: boolean }
  | { type: 'POINT_TARGET'; target: number };

/** La partida `gameNumber` (empieza en 1) da el doble de puntos de sesión: la última, si la sesión lo pide. Copia de `SessionMode.pointsMultiplier`. */
export function gameCountsDouble(mode: SessionMode, gameNumber: number): boolean {
  return mode.type === 'GAME_COUNT' && mode.doubleLastGame === true && gameNumber >= mode.target;
}

export function isSessionComplete(mode: SessionMode, gamesPlayed: number, sessionPoints: Iterable<number>): boolean {
  if (mode.type === 'INFINITE') return false;
  if (mode.type === 'GAME_COUNT') return gamesPlayed >= mode.target;
  for (const points of sessionPoints) if (points >= mode.target) return true;
  return false;
}

/**
 * Minijuegos de la sesión (en el orden en que se eligieron) y cómo sale el siguiente: `ORDER` los juega en ese orden y
 * vuelve al primero al acabar la lista; `RANDOM` sortea entre ellos; `VOTE` vota entre hasta 3 de ellos. Basta con un
 * juego compatible en cualquier modo: con uno solo se repite y la votación necesita al menos dos (si no, sale el que hay).
 */
export type GameSelectionMode =
  | { type: 'ORDER'; gameIds: string[] }
  | { type: 'RANDOM'; gameIds: string[] }
  | { type: 'VOTE'; gameIds: string[] };

export type GameSelectionType = GameSelectionMode['type'];

/** Opciones como máximo de la votación del siguiente minijuego (con menos juegos, se vota entre los que haya). */
export const NEXT_GAME_VOTE_OPTIONS = 3;

/**
 * Una opción de la votación del siguiente minijuego: el par juego y modo (`mode` nulo en un juego sin modos). Su `id`
 * es el del juego si sale una sola vez entre las opciones y `juego:MODO` si sale con varios modos.
 */
export interface NextGameVoteOptionView {
  id: string;
  game: MiniGameManifest;
  mode: string | null;
}

/** Los votos, el recuento (`tallies`) y el ganador van por id de opción. */
export interface NextGameVoteView {
  options: NextGameVoteOptionView[];
  eligibleVoterIds: string[];
  votedPlayerIds: string[];
  ownVoteOptionId: string | null;
  endsAt: number | null;
  resolvedOptionId: string | null;
  tallies: Record<string, number> | null;
  nextTransitionAt: number | null;
}

export const setGameSkipVoteRequestSchema = z.object({ gameInstanceId: z.string().uuid(), wantsToSkip: z.boolean() }).strict();
export type SetGameSkipVoteRequest = z.infer<typeof setGameSkipVoteRequestSchema>;

/** Transport envelope prevents late actions from affecting a replacement runtime. */
export const gameActionRequestSchema = z.object({ gameInstanceId: z.string().uuid(), actionEpoch: z.string().min(1).max(512), action: z.unknown() }).strict();
export type GameActionRequest = z.infer<typeof gameActionRequestSchema>;

/** Public, player-specific projection of the vote attached to the active game runtime. */
export interface GameSkipStateView {
  gameInstanceId: string;
  voterIds: string[];
  votes: number;
  requiredVotes: number;
  currentUserVoted: boolean;
  canVote: boolean;
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
  /**
   * Modos que se juegan de cada juego con modos (los marcados por el host o, sin marcar, el `mode` de su
   * configuración): al azar o por votación cada uno es una opción; por orden, un turno de la cola. Ausente en vistas
   * antiguas.
   */
  allowedModes?: Record<string, string[]>;
  nextGameVote: NextGameVoteView | null;
  /** Absent on legacy snapshots; clients wait for a current instance before sending game actions. */
  gameSkipState?: GameSkipStateView | null;
  gamesPlayed: number;
  sessionStandings: SessionStandingView[];
  sessionHistory: SessionGameSummaryView[];
  roomInstanceId?: string;
  revision?: number;
  gameCatalogVersion?: string | null;
  gameActionEpoch?: string | null;
  game: unknown | null;
  gamePlayerState: unknown | null;
  serverNow: number;
  /** Enabled custom categories owned by the host; used for lobby validation only. */
  hostCustomCategoryCount?: number;
  /** Enabled custom Would You Rather pairs owned by the host; used for lobby validation only. */
  hostWouldYouRatherPromptCount?: number;
  /** Sala del reto diario (un jugador, sin código que compartir); `null` en una sala normal. */
  daily: DailyRoomInfo | null;
}

export interface ClientToServerEvents {
  /** La conexión entra en la sesión de sala (`/play` y `/room`): solo una conexión enganchada ocupa el asiento. */
  'session:attach': (_: unknown, ack: SocketAck) => void;
  'room:create': (payload: { maxPlayers?: number }, ack: SocketAck<{ room: RoomView }>) => void;
  'room:join': (payload: { code: string }, ack: SocketAck<{ room: RoomView }>) => void;
  /** Empieza el reto diario de hoy (el servidor elige el juego): crea la sala del reto y la devuelve. */
  'daily:start': (payload: Record<string, never>, ack: SocketAck<{ room: RoomView }>) => void;
  'room:leave': (_: unknown, ack: SocketAck) => void;
  'room:select-game': (payload: { gameId: string }, ack: SocketAck) => void;
  'room:update-config': (payload: { config: unknown }, ack: SocketAck) => void;
  'room:update-game-config': (payload: { gameId: string; config: unknown }, ack: SocketAck) => void;
  'room:update-session': (payload: { mode: SessionMode }, ack: SocketAck) => void;
  'room:update-game-selection': (payload: { mode: GameSelectionMode }, ack: SocketAck) => void;
  'room:update-allowed-modes': (payload: { gameId: string; modes: string[] }, ack: SocketAck) => void;
  'room:vote-next-game': (payload: { optionId: string }, ack: SocketAck) => void;
  'room:set-role': (payload: { playerId: string; role: AssignableRoomRole }, ack: SocketAck) => void;
  'room:transfer-host': (payload: { playerId: string }, ack: SocketAck) => void;
  'room:kick': (payload: { playerId: string }, ack: SocketAck) => void;
  'room:set-ready': (payload: { ready: boolean }, ack: SocketAck) => void;
  'room:start-game': (_: unknown, ack: SocketAck) => void;
  'room:continue-session': (_: unknown, ack: SocketAck) => void;
  'room:return-lobby': (_: unknown, ack: SocketAck) => void;
  'room:end-session': (_: unknown, ack: SocketAck) => void;
  'game:skip-vote:set': (payload: SetGameSkipVoteRequest, ack: SocketAck) => void;
  'game:action': (payload: GameActionRequest, ack: SocketAck) => void;
  'who-is-who:cursor': (payload: unknown, ack?: SocketAck) => void;
  'who-is-who:cursor-clear': (_: unknown, ack?: SocketAck) => void;
  'room:invite': (payload: { userId: string }, ack: SocketAck) => void;
  'room:chat:send': (payload: { text: string }, ack: SocketAck) => void;
  'room:chat:delete': (payload: { seq: number }, ack: SocketAck) => void;
  'room:chat:mute': (payload: { playerId: string; muted: boolean }, ack: SocketAck) => void;
}

/** Presencia de un amigo: sin conexión, conectado fuera de sala, en una sala, o en una sala con partida en curso. */
export type FriendStatus = 'OFFLINE' | 'ONLINE' | 'IN_ROOM' | 'PLAYING';

/** Invitación de un amigo a su sala (`friends:invite`). No se guarda: caduca en `expiresAt` (ISO, a los 10 min). */
export interface FriendInvite {
  inviteId: string;
  from: { id: string; username: string; avatar: AvatarRef };
  roomCode: string;
  gameName: string | null;
  expiresAt: string;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:kicked': (reason: string) => void;
  'session:restored': (room: RoomView) => void;
  'error:message': (message: string) => void;
  'who-is-who:cursor': (cursor: import('./games/who-is-who-pokemon/types.js').WhoIsWhoCursorEvent) => void;
  'who-is-who:cursor-clear': (payload: { playerId: string }) => void;
  'who-is-who:cursors-reset': () => void;
  'friends:presence': (payload: { userId: string; status: FriendStatus }) => void;
  'friends:changed': (payload: Record<string, never>) => void;
  'friends:invite': (payload: FriendInvite) => void;
  'achievements:unlocked': (payload: AchievementsUnlocked) => void;
  /** El resultado del reto diario ya está guardado: la clasificación puede pedirse otra vez. */
  'daily:recorded': (payload: { date: string; gameId: DailyGameId }) => void;
  /** Lo que había en el chat al unirse o al recuperar la sesión. */
  'room:chat:history': (payload: { roomInstanceId: string; messages: ChatMessage[] }) => void;
  'room:chat:message': (payload: { roomInstanceId: string; message: ChatMessage }) => void;
  'room:chat:deleted': (payload: { roomInstanceId: string; seq: number }) => void;
}

export type SocketAck<T = Record<string, never>> = (response: ({ ok: true } & T) | { ok: false; error: string }) => void;
