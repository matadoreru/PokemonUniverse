import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('local data infrastructure migration', () => {
  it('is additive and contains no catalog-destructive statements', async () => {
    const sql = await readFile(new URL('../../prisma/migrations/20260828120000_add_local_data_infrastructure/migration.sql', import.meta.url), 'utf8');
    expect(sql).toContain('CREATE TABLE "DataSyncRun"');
    expect(sql).toContain('CREATE TABLE "TcgCard"');
    expect(sql).not.toMatch(/\b(?:TRUNCATE|DROP TABLE|DELETE FROM)\b/i);
  });
});
