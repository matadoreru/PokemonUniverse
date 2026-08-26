import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameResults, ProfileMetricDefinition } from '@pokemon-universe/shared';
import type { LiveRoom } from '../rooms/types.js';

const database = vi.hoisted(() => ({
  resultIds: new Set<string>(),
  playerResultsCreated: vi.fn(),
  userStatsUpdated: vi.fn(),
  gameStatsUpdated: vi.fn(),
  transactionFailures: 0,
  transactionAttempts: 0,
  transactionOptions: [] as unknown[],
}));

vi.mock('../db.js', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>, options: unknown) => {
      database.transactionAttempts += 1; database.transactionOptions.push(options);
      if (database.transactionFailures > 0) { database.transactionFailures -= 1; throw { code: 'P2034' }; }
      return callback({
        gameHistory: {
          findUnique: vi.fn(({ where }: { where: { resultId: string } }) => database.resultIds.has(where.resultId) ? { id: `history-${where.resultId}`, status: 'COMPLETED' } : null),
          update: vi.fn(({ where }: { where: { resultId: string } }) => ({ id: `history-${where.resultId}`, status: 'COMPLETED' })),
          create: vi.fn(({ data }: { data: { resultId: string } }) => {
          if (database.resultIds.has(data.resultId)) throw { code: 'P2002' };
          database.resultIds.add(data.resultId); return { id: `history-${data.resultId}` };
          }),
        },
        playerGameResult: { create: database.playerResultsCreated },
        userStats: { upsert: database.userStatsUpdated },
        userGameStats: { findUnique: vi.fn(() => null), upsert: database.gameStatsUpdated },
      });
    }),
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
    database.transactionFailures = 0; database.transactionAttempts = 0; database.transactionOptions.length = 0;
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

  it('retries serializable transaction conflicts without duplicating statistics', async () => {
    database.transactionFailures = 1;
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

    await persistGameResults(room, results, 'retryable-result-id', Date.now(), 'higher-lower', {});

    expect(database.transactionAttempts).toBe(2);
    expect(database.transactionOptions).toEqual([
      { isolationLevel: 'Serializable' },
      { isolationLevel: 'Serializable' },
    ]);
    expect(database.playerResultsCreated).toHaveBeenCalledTimes(1);
    expect(database.userStatsUpdated).toHaveBeenCalledTimes(1);
    expect(database.gameStatsUpdated).toHaveBeenCalledTimes(1);
  });
});
