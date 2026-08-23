import { describe, expect, it } from 'vitest';
import { hasRoomPermission, ROOM_PERMISSIONS } from './room.js';

describe('room permissions', () => {
  it('gives the Host every room permission', () => {
    expect(ROOM_PERMISSIONS.every((permission) => hasRoomPermission('HOST', permission))).toBe(true);
  });

  it('limits Co-host to preparation settings', () => {
    expect(hasRoomPermission('CO_HOST', 'CHANGE_GAME')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_GAME_CONFIG')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_SESSION')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'START_GAME')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'MANAGE_ROLES')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'KICK_MEMBER')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'TRANSFER_HOST')).toBe(false);
  });

  it('keeps Members read-only', () => {
    expect(ROOM_PERMISSIONS.some((permission) => hasRoomPermission('MEMBER', permission))).toBe(false);
  });
});
