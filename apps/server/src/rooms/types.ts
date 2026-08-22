import type { AuthUser, MemberRole, SessionMode } from '@pokemon-universe/shared';
import type { RegisteredGame } from '@pokemon-universe/shared';

export interface RoomMember {
  identity: AuthUser;
  avatarSeed: string;
  connected: boolean;
  socketId: string | null;
  role: MemberRole;
  sessionPoints: number;
  joinedAt: number;
  disconnectTimer: NodeJS.Timeout | null;
}

export interface GameRuntime {
  module: RegisteredGame;
  state: any;
  startedAt: number;
  resultsApplied: boolean;
}

export interface LiveRoom {
  code: string;
  hostId: string;
  phase: import('@pokemon-universe/shared').RoomPhase;
  members: Map<string, RoomMember>;
  maxPlayers: number;
  selectedGameId: string;
  gameConfig: unknown;
  sessionMode: SessionMode;
  gamesPlayed: number;
  game: GameRuntime | null;
  transitionTimer: NodeJS.Timeout | null;
}
