import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaWouldYouRatherPromptRepository } from './prisma-repository.js';
import { wouldYouRatherPromptKey } from './service.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('prompt repository PostgreSQL isolation', () => {
  const database = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused:unused@localhost/unused' } } });
  const repository = new PrismaWouldYouRatherPromptRepository(database);
  const userId = `integration-${randomUUID()}`;
  beforeAll(async () => {
    await database.user.create({ data: { id: userId, username: userId, email: `${userId}@example.invalid`, passwordHash: 'integration-fixture' } });
  });
  beforeEach(async () => { await database.customWouldYouRatherPrompt.deleteMany({ where: { userId } }); });
  afterAll(async () => {
    try {
      await database.customWouldYouRatherPrompt.deleteMany({ where: { userId } });
      await database.user.deleteMany({ where: { id: userId } });
    } finally { await database.$disconnect(); }
  });
  it('rolls back the first row when the second row violates uniqueness', async () => {
    const key = wouldYouRatherPromptKey('Existing A', 'Existing B');
    await repository.create(userId, 'Existing A', 'Existing B', key);
    await expect(repository.createBatch(userId, [
      { optionA: 'New A', optionB: 'New B', normalizedKey: wouldYouRatherPromptKey('New A', 'New B') },
      { optionA: 'Existing A', optionB: 'Existing B', normalizedKey: key },
    ])).rejects.toThrow();
    expect(await database.customWouldYouRatherPrompt.count({ where: { userId } })).toBe(1);
  });
  it('merges concurrent edits against the committed pair and recalculates its key', async () => {
    const initial = await repository.create(userId, 'First A', 'First B', wouldYouRatherPromptKey('First A', 'First B'));
    await Promise.all([
      repository.update(userId, initial.id, { optionA: 'Updated A' }),
      repository.update(userId, initial.id, { optionB: 'Updated B' }),
    ]);
    const stored = await database.customWouldYouRatherPrompt.findUniqueOrThrow({ where: { id: initial.id } });
    expect(stored).toMatchObject({ optionA: 'Updated A', optionB: 'Updated B', normalizedKey: wouldYouRatherPromptKey('Updated A', 'Updated B') });
  });
  it('rejects a concurrent edit that would make both options equal', async () => {
    const initial = await repository.create(userId, 'First A', 'First B', wouldYouRatherPromptKey('First A', 'First B'));
    const results = await Promise.allSettled([
      repository.update(userId, initial.id, { optionA: 'Same choice' }),
      repository.update(userId, initial.id, { optionB: 'Same choice' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const stored = await database.customWouldYouRatherPrompt.findUniqueOrThrow({ where: { id: initial.id } });
    expect(stored.optionA).not.toBe(stored.optionB);
    expect(stored.normalizedKey).toBe(wouldYouRatherPromptKey(stored.optionA, stored.optionB));
  });
});
