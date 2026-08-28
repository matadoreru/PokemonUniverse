import type { PresenceStatus, RoomPhase, RoomRole } from './room.js';
import type { UserRole } from './auth.js';

export const ADMIN_PAGE_SIZE = 20;

export type AdminRoomStatus = 'ACTIVE' | 'CLOSED' | 'INTERRUPTED';
export type AdminGameStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'INTERRUPTED';

export interface AdminSummary {
  activeRooms: number;
  gamesInProgress: number;
  registeredUsers: number;
  interruptedToday: number;
  updatedAt: string;
}

export interface AdminRoomParticipant {
  id: string;
  displayName: string;
  kind: 'USER' | 'GUEST';
  presence: PresenceStatus;
  roomRole: RoomRole;
}

export interface AdminActiveRoom {
  id: string;
  code: string;
  phase: RoomPhase;
  gameId: string | null;
  gameName: string | null;
  connectedPlayers: number;
  totalPlayers: number;
  maxPlayers: number;
  hostDisplayName: string;
  createdAt: string;
  updatedAt: string;
  participants: AdminRoomParticipant[];
}

export interface AdminRoomHistoryItem {
  id: string;
  code: string;
  hostDisplayName: string;
  hostUserId: string | null;
  maxPlayers: number;
  status: AdminRoomStatus;
  closeReason: string | null;
  gamesStarted: number;
  createdAt: string;
  endedAt: string | null;
}

export interface AdminGameParticipant {
  displayName: string;
  userId: string | null;
  position: number;
  points: number;
}

export interface AdminGameHistoryItem {
  id: string;
  roomCode: string;
  gameId: string;
  gameName: string;
  playerCount: number;
  status: AdminGameStatus;
  startedAt: string;
  endedAt: string | null;
  participants: AdminGameParticipant[];
}

export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
}

export type AdminDataSyncSource = 'POKEAPI' | 'TCGDEX';
export type AdminDataSyncStatus = 'IDLE' | 'RUNNING' | 'FAILED' | 'COMPLETED' | 'NOT_READY';

export interface AdminDataSyncItem {
  source: AdminDataSyncSource;
  status: AdminDataSyncStatus;
  ready: boolean;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
  lastFullSyncAt: string | null;
  durationMs: number | null;
  recordsProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  recordsAvailable: number;
  error: string | null;
  nextSyncAt: string;
}

export interface PaginatedAdminResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
