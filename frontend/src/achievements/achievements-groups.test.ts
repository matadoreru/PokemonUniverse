import { describe, expect, it } from 'vitest';
import type { AchievementResponse } from '../lib/api-contract';
import { groupAchievements, unlockedDate } from './achievements-groups';

const make = (id: string, family: string): AchievementResponse => ({ id, family, gameId: null, name: id, description: '', unlockedAt: null });

describe('achievements-groups', () => {
  it('groupsInOrder', () => {
    const groups = groupAchievements([make('s', 'SECRET'), make('g1', 'GAME'), make('a', 'GENERAL'), make('g2', 'GAME')]);
    expect(groups.map((group) => [group.key, group.title])).toEqual([['GENERAL', 'Generales'], ['GAME', 'Minijuegos'], ['SECRET', 'Secretos']]);
    expect(groups[1]!.items.map((item) => item.id)).toEqual(['g1', 'g2']);
    expect(groupAchievements([make('a', 'GENERAL')]).map((group) => group.key)).toEqual(['GENERAL']);
  });

  it('dateFormat', () => {
    expect(unlockedDate('2026-11-07T10:00:00Z')).toBe('Conseguido el 7 nov 2026');
    expect(unlockedDate('2026-09-03T10:00:00Z')).toBe('Conseguido el 3 sept 2026');
  });
});
