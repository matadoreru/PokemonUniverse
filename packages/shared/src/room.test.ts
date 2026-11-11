import { describe, expect, it } from 'vitest';
import { formatPendingReadyNames, hasRoomPermission, isSessionComplete, ROOM_PERMISSIONS } from './room.js';

describe('room permissions', () => {
  it('gives the Host every room permission', () => {
    expect(ROOM_PERMISSIONS.every((permission) => hasRoomPermission('HOST', permission))).toBe(true);
  });

  it('limits Co-host to preparation settings', () => {
    expect(hasRoomPermission('CO_HOST', 'CHANGE_GAME')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_GAME_CONFIG')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_SESSION')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_GAME_SELECTION')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'MODERATE_CHAT')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'START_GAME')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'MANAGE_ROLES')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'KICK_MEMBER')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'TRANSFER_HOST')).toBe(false);
  });

  it('gives MODERATE_CHAT to Host and Co-host but not to Members', () => {
    expect(hasRoomPermission('HOST', 'MODERATE_CHAT')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'MODERATE_CHAT')).toBe(true);
    expect(hasRoomPermission('MEMBER', 'MODERATE_CHAT')).toBe(false);
  });

  it('keeps Members read-only', () => {
    expect(ROOM_PERMISSIONS.some((permission) => hasRoomPermission('MEMBER', permission))).toBe(false);
  });
});

describe('session completion', () => {
  it('keeps infinite sessions open and resolves finite targets from authoritative totals', () => {
    expect(isSessionComplete({ type: 'INFINITE' }, 100, [10_000])).toBe(false);
    expect(isSessionComplete({ type: 'GAME_COUNT', target: 3 }, 2, [100])).toBe(false);
    expect(isSessionComplete({ type: 'GAME_COUNT', target: 3 }, 3, [0])).toBe(true);
    expect(isSessionComplete({ type: 'POINT_TARGET', target: 20 }, 1, [19, 4])).toBe(false);
    expect(isSessionComplete({ type: 'POINT_TARGET', target: 20 }, 1, [19, 20])).toBe(true);
  });
});

describe('ready-state copy', () => {
  it('bounds the displayed names in large rooms', () => {
    expect(formatPendingReadyNames(['Ana', 'Leo'])).toBe('Ana, Leo');
    expect(formatPendingReadyNames(['Ana', 'Leo', 'Marta', 'Pablo', 'Eva'])).toBe('Ana, Leo, Marta y 2 más');
  });
});
