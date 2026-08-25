import { describe, expect, it } from 'vitest';
import { gameSelectionModeSchema, hasRoomPermission, ROOM_PERMISSIONS } from './room.js';

describe('room permissions', () => {
  it('gives the Host every room permission', () => {
    expect(ROOM_PERMISSIONS.every((permission) => hasRoomPermission('HOST', permission))).toBe(true);
  });

  it('limits Co-host to preparation settings', () => {
    expect(hasRoomPermission('CO_HOST', 'CHANGE_GAME')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_GAME_CONFIG')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_SESSION')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'EDIT_GAME_SELECTION')).toBe(true);
    expect(hasRoomPermission('CO_HOST', 'START_GAME')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'MANAGE_ROLES')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'KICK_MEMBER')).toBe(false);
    expect(hasRoomPermission('CO_HOST', 'TRANSFER_HOST')).toBe(false);
  });

  it('keeps Members read-only', () => {
    expect(ROOM_PERMISSIONS.some((permission) => hasRoomPermission('MEMBER', permission))).toBe(false);
  });
});

describe('game selection mode', () => {
  it('enforces unique pools with the required minimum size', () => {
    expect(gameSelectionModeSchema.parse({ type: 'FIXED' })).toEqual({ type: 'FIXED' });
    expect(gameSelectionModeSchema.safeParse({ type: 'RANDOM', gameIds: ['one'] }).success).toBe(false);
    expect(gameSelectionModeSchema.safeParse({ type: 'VOTE', gameIds: ['one', 'two'] }).success).toBe(false);
    expect(gameSelectionModeSchema.safeParse({ type: 'VOTE', gameIds: ['one', 'two', 'two'] }).success).toBe(false);
    expect(gameSelectionModeSchema.parse({ type: 'RANDOM', gameIds: ['one', 'two'] })).toEqual({ type: 'RANDOM', gameIds: ['one', 'two'] });
  });
});
