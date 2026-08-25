import { describe, expect, it, vi } from 'vitest';
import { gameRetainsPlayer, markLeft, markTemporarilyDisconnected, oldestConnectedMember, restoreMember } from './presence.js';
import type { LiveRoom, RoomMember } from './types.js';

function member(id: string, joinedAt: number): RoomMember {
  return { identity: { id, displayName: id, kind: 'GUEST', avatar: { type: 'DEFAULT' } }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', socketId: id, role: 'PLAYER', sessionPoints: 0, joinedAt, disconnectTimer: null };
}

describe('room presence service', () => {
  it('applies the shared reconnect and departure state transitions', () => {
    const current = member('player', 1); current.disconnectTimer = setTimeout(() => undefined, 10_000); const clear = vi.spyOn(global, 'clearTimeout');
    restoreMember(current, { ...current.identity, displayName: 'restored' }, 'new-socket');
    expect(clear).toHaveBeenCalled(); expect(current).toMatchObject({ connected: true, presence: 'CONNECTED', socketId: 'new-socket', disconnectTimer: null });
    markTemporarilyDisconnected(current); expect(current).toMatchObject({ connected: false, presence: 'TEMPORARILY_DISCONNECTED', socketId: null });
    markLeft(current); expect(current).toMatchObject({ connected: false, presence: 'LEFT', socketId: null });
    clear.mockRestore();
  });

  it('selects the oldest connected host candidate', () => {
    const late = member('late', 20); const early = member('early', 10); const offline = member('offline', 1); markTemporarilyDisconnected(offline);
    const room = { members: new Map([[late.identity.id, late], [offline.identity.id, offline], [early.identity.id, early]]) } as LiveRoom;
    expect(oldestConnectedMember(room)?.identity.id).toBe('early');
  });

  it('uses the stable runtime roster without inspecting private game state', () => {
    const room = { phase: 'ROUND_ACTIVE', game: { participantIds: ['player'], state: { secret: 'opaque' } } } as unknown as LiveRoom;
    expect(gameRetainsPlayer(room, 'player')).toBe(true);
    expect(gameRetainsPlayer(room, 'spectator')).toBe(false);
    room.phase = 'GAME_RESULTS';
    expect(gameRetainsPlayer(room, 'player')).toBe(false);
  });
});
