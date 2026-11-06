import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_TOTAL, type AchievementsUnlocked } from './achievements.js';

describe('achievementsUnlockedShape', () => {
  it('el evento tiene la forma acordada y el total es 48', () => {
    const event = {
      achievements: [{ id: 'first-win', family: 'GENERAL', gameId: null, name: 'Primera victoria', description: 'Gana una partida.' }],
      records: [{ gameId: 'higher-or-lower', key: 'infinite-streak', label: 'Racha infinita', value: 7, previous: 5 }],
    } satisfies AchievementsUnlocked;
    expect(event.achievements[0]?.family).toBe('GENERAL');
    expect(ACHIEVEMENT_TOTAL).toBe(48);
  });
});
