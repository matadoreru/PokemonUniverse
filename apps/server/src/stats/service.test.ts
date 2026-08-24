import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameResults, ProfileMetricDefinition } from '@pokemon-universe/shared';
import type { LiveRoom } from '../rooms/types.js';

const database = vi.hoisted(() => ({
  resultIds: new Set<string>(),
  playerResultsCreated: vi.fn(),
  userStatsUpdated: vi.fn(),
  gameStatsUpdated: vi.fn(),
}));

vi.mock('../db.js', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback({
      gameHistory: { create: vi.fn(({ data }: { data: { resultId: string } }) => {
        if (database.resultIds.has(data.resultId)) throw { code: 'P2002' };
        database.resultIds.add(data.resultId); return { id: `history-${data.resultId}` };
      }) },
      playerGameResult: { create: database.playerResultsCreated },
      userStats: { upsert: database.userStatsUpdated },
      userGameStats: { findUnique: vi.fn(() => null), upsert: database.gameStatsUpdated },
    })),
  },
}));

import { mergeMetrics, persistGameResults } from './service.js';

const definitions: readonly ProfileMetricDefinition[] = [
  { key: 'correct', label: 'Correctas', aggregation: 'SUM' },
  { key: 'bestStreak', label: 'Mejor racha', aggregation: 'MAX' },
  { key: 'bestResolution', label: 'Mejor resolución', aggregation: 'MIN' },
];

describe('profile statistics aggregation', () => {
  beforeEach(() => {
    database.resultIds.clear();
    database.playerResultsCreated.mockClear(); database.userStatsUpdated.mockClear(); database.gameStatsUpdated.mockClear();
  });
  it('sums counters and retains the best maximum', () => {
    expect(mergeMetrics({ correct: 4, bestStreak: 7, bestResolution: 5 }, { correct: 3, bestStreak: 2, bestResolution: 3 }, definitions)).toEqual({
      correct: 7,
      bestStreak: 7,
      bestResolution: 3,
    });
  });

  it('does not persist unregistered or derived client values', () => {
    expect(mergeMetrics(null, { correct: 2, bestStreak: 4, bestResolution: 0, accuracy: 100, injected: 9_999 }, definitions)).toEqual({
      correct: 2,
      bestStreak: 4,
      bestResolution: 0,
    });
  });

  it('persists the same game result id only once', async () => {
    const room = {
      code: 'ABC123',
      members: new Map([['user-1', {
        identity: { id: 'user-1', displayName: 'Eru', kind: 'USER', email: 'eru@example.com', avatar: { type: 'DEFAULT' } },
      }]]),
    } as unknown as LiveRoom;
    const results: GameResults = {
      winnerId: 'user-1',
      standings: [{ playerId: 'user-1', position: 1, points: 4, stats: { correct: 2, incorrect: 0, sameCorrect: 0, bestStreak: 2 } }],
    };

    await persistGameResults(room, results, 'stable-result-id', Date.now(), 'higher-lower', {});
    await persistGameResults(room, results, 'stable-result-id', Date.now(), 'higher-lower', {});

    expect(database.playerResultsCreated).toHaveBeenCalledTimes(1);
    expect(database.userStatsUpdated).toHaveBeenCalledTimes(1);
    expect(database.gameStatsUpdated).toHaveBeenCalledTimes(1);
  });
});
