import type { AuthUser } from '@pokemon-universe/shared';
import type { LiveRoom, RoomMember } from './types.js';

export function restoreMember(member: RoomMember, identity: AuthUser, socketId: string): void {
  if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
  member.identity = identity;
  member.disconnectTimer = null;
  member.connected = true;
  member.presence = 'CONNECTED';
  member.socketId = socketId;
}

export function markTemporarilyDisconnected(member: RoomMember): void {
  member.connected = false;
  member.presence = 'TEMPORARILY_DISCONNECTED';
  member.socketId = null;
}

export function markLeft(member: RoomMember): void {
  member.disconnectTimer = null;
  member.connected = false;
  member.presence = 'LEFT';
  member.socketId = null;
}

export function oldestConnectedMember(room: LiveRoom): RoomMember | undefined {
  return [...room.members.values()]
    .filter((member) => member.presence === 'CONNECTED')
    .sort((left, right) => left.joinedAt - right.joinedAt)[0];
}

export function gameRetainsPlayer(room: LiveRoom, playerId: string): boolean {
  if (!room.game || room.phase === 'GAME_RESULTS' || room.phase === 'SESSION_RESULTS') return false;
  return room.game.participantIds.includes(playerId);
}
