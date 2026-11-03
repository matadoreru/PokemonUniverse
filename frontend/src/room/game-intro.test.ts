import type { GameIntroView, RoomMemberView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { gameIntroProgress, introReadyLabel, introSkipLabel } from './game-intro';

function member(id: string, overrides: Partial<RoomMemberView> = {}): RoomMemberView {
  return {
    id, displayName: id, avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER',
    role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0, ...overrides,
  } as RoomMemberView;
}

const intro: GameIntroView = { gameInstanceId: '6f1c1f2e-3f4b-4c55-8a9b-0c1d2e3f4a5b', endsAt: 20_000, skippedIds: ['a', 'spectator', 'gone'] };

describe('gameIntroProgress', () => {
  it('counts only connected players and excludes spectators and disconnected members', () => {
    const members = [
      member('a'), member('b'),
      member('spectator', { role: 'SPECTATOR' }),
      member('gone', { presence: 'TEMPORARILY_DISCONNECTED', connected: false }),
      member('left', { presence: 'LEFT', connected: false }),
    ];
    expect(gameIntroProgress(intro, members, 'a')).toEqual({ skipped: 1, total: 2, selfSkipped: true, canSkip: true });
    expect(gameIntroProgress(intro, members, 'b')).toEqual({ skipped: 1, total: 2, selfSkipped: false, canSkip: true });
    expect(gameIntroProgress(intro, members, 'spectator')).toEqual({ skipped: 1, total: 2, selfSkipped: true, canSkip: false });
    expect(gameIntroProgress(intro, members, 'gone').canSkip).toBe(false);
  });

  it('handles an empty roster without dividing or going negative', () => {
    expect(gameIntroProgress({ ...intro, skippedIds: [] }, [], 'x')).toEqual({ skipped: 0, total: 0, selfSkipped: false, canSkip: false });
  });
});

describe('intro texts', () => {
  it('says how many players are ready', () => {
    expect(introReadyLabel({ skipped: 2, total: 3 })).toBe('2 de 3 listos');
    expect(introReadyLabel({ skipped: 0, total: 1 })).toBe('0 de 1 listos');
  });

  it('labels the skip button by its state', () => {
    expect(introSkipLabel(false)).toBe('Saltar');
    expect(introSkipLabel(true)).toBe('Esperando al resto');
  });
});
