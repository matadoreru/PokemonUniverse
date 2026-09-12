import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({ prisma: {} }));
import { createPrismaRoomAuditSink } from './audit.js';

describe('skipped game audit', () => {
  it('closes the started record as abandoned without touching completed records', async () => {
    const statuses = new Map<string, string>([['finished', 'COMPLETED']]);
    const updateMany = vi.fn(async ({ where, data }: { where: { resultId: string; status: string }; data: { status: string } }) => {
      if (statuses.get(where.resultId) === where.status) statuses.set(where.resultId, data.status);
    });
    const database = { gameHistory: {
      upsert: vi.fn(async ({ create }: { create: { resultId: string; status: string } }) => statuses.set(create.resultId, create.status)),
      updateMany,
    } };
    const sink = createPrismaRoomAuditSink(database as unknown as PrismaClient);
    const starting = sink.gameStarted({ resultId: 'skipped', roomHistoryId: 'room', roomCode: 'ABC234', gameId: 'future-game', playerCount: 4, config: {}, startedAt: 1_000 });
    const skipping = sink.gameAbandoned({ resultId: 'skipped', reason: 'SKIPPED', endedAt: 2_000 });
    await Promise.all([starting, skipping]);
    await sink.gameAbandoned({ resultId: 'skipped', reason: 'SKIPPED', endedAt: 2_000 });
    await sink.gameAbandoned({ resultId: 'finished', reason: 'SKIPPED', endedAt: 2_000 });
    expect(statuses.get('skipped')).toBe('ABANDONED');
    expect(statuses.get('finished')).toBe('COMPLETED');
    expect(updateMany).toHaveBeenCalledWith({ where: { resultId: 'skipped', status: 'IN_PROGRESS' }, data: { status: 'ABANDONED', endedAt: new Date(2_000) } });
  });
});
