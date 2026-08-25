import type { AuthUser, GameSelectionMode, MemberRole, PresenceStatus, RoomRole, SessionGameSummaryView, SessionMode } from '@pokemon-universe/shared';
import type { RegisteredGame } from '@pokemon-universe/shared';

export interface RoomMember {
  identity: AuthUser;
  connected: boolean;
  presence: PresenceStatus;
  roomRole: RoomRole;
  socketId: string | null;
  role: MemberRole;
  ready: boolean;
  sessionPoints: number;
  joinedAt: number;
  disconnectTimer: NodeJS.Timeout | null;
}

export interface GameRuntime {
  resultId: string;
  gameId: string;
  /** Stable roster captured at game start; room code never inspects opaque game state. */
  participantIds: readonly string[];
  module: RegisteredGame;
  config: unknown;
  state: any;
  startedAt: number;
  resultsApplied: boolean;
}

export interface NextGameVote {
  optionGameIds: string[];
  votes: Record<string, string>;
  endsAt: number | null;
  resolvedGameId: string | null;
  tallies: Record<string, number> | null;
  nextTransitionAt: number | null;
}

export interface SessionParticipant {
  identity: AuthUser;
  sessionPoints: number;
}

export interface LiveRoom {
  code: string;
  hostId: string;
  phase: import('@pokemon-universe/shared').RoomPhase;
  members: Map<string, RoomMember>;
  maxPlayers: number;
  selectedGameId: string;
  gameConfigs: Map<string, unknown>;
  sessionMode: SessionMode;
  gameSelectionMode: GameSelectionMode;
  nextGameVote: NextGameVote | null;
  gamesPlayed: number;
  sessionParticipants: Map<string, SessionParticipant>;
  sessionHistory: SessionGameSummaryView[];
  game: GameRuntime | null;
  transitionTimer: NodeJS.Timeout | null;
}
