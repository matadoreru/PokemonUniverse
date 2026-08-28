import type { DataSyncAdapter } from './types.js';
import { describe, expect, it } from 'vitest';
import { DataSyncService, SyncAlreadyRunningError } from './service.js';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

function fakeDb() {
  const runs: Array<Record<string, unknown>> = []; const states: Array<Record<string, unknown>> = [];
  const dataSyncRun = {
    create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `run-${runs.length + 1}`, createdAt: new Date(), ...data }; runs.push(row); return row; },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(runs.find((row) => row.id === where.id)!, data),
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { for (const run of runs) if (run.status === 'RUNNING' || run.status === 'PENDING') Object.assign(run, data); return { count: runs.length }; },
    findMany: async () => [...runs].reverse(),
  };
  const dataSyncState = {
    upsert: async ({ where, create, update }: { where: { source: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => { const row = states.find((item) => item.source === where.source); if (row) return Object.assign(row, update); const created = { updatedAt: new Date(), ...create }; states.push(created); return created; },
    findMany: async () => states,
  };
  return { db: { dataSyncRun, dataSyncState, $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations) }, runs, states };
}

describe('DataSyncService', () => {
  it('records a successful initial sync without duplicating concurrent work', async () => {
    const gate = deferred<void>(); let calls = 0;
    const adapter: DataSyncAdapter = { source: 'POKEAPI', recordsAvailable: async () => 1_025, run: async () => { calls += 1; await gate.promise; return { processed: 1_025, inserted: 1_025, updated: 0, skipped: 0 }; } };
    const store = fakeDb(); const service = new DataSyncService(store.db as never, [adapter], () => new Date('2030-01-01T05:00:00Z'));
    const running = service.start('POKEAPI', 'INITIAL');
    expect(() => service.start('POKEAPI', 'INCREMENTAL')).toThrow(SyncAlreadyRunningError);
    gate.resolve(); await running;
    expect(calls).toBe(1); expect(store.runs[0]).toMatchObject({ status: 'COMPLETED', recordsProcessed: 1_025, inserted: 1_025 });
    expect(store.states[0]).toMatchObject({ source: 'POKEAPI', recordsAvailable: 1_025 });
  });

  it('keeps the previous available dataset and records an API failure', async () => {
    const adapter: DataSyncAdapter = { source: 'POKEAPI', recordsAvailable: async () => 1_025, run: async () => { throw new Error('PokéAPI unavailable'); } };
    const store = fakeDb(); store.states.push({ source: 'POKEAPI', recordsAvailable: 1_025, lastSuccessAt: new Date('2026-01-01') });
    const service = new DataSyncService(store.db as never, [adapter], () => new Date());
    await expect(service.start('POKEAPI', 'INCREMENTAL')).rejects.toThrow('PokéAPI unavailable');
    expect(store.states[0]).toMatchObject({ recordsAvailable: 1_025, lastError: 'PokéAPI unavailable' });
    expect(store.runs[0]).toMatchObject({ status: 'FAILED', error: 'PokéAPI unavailable' });
  });

  it('marks an interrupted run failed after a server restart', async () => {
    const store = fakeDb(); store.runs.push({ id: 'old', status: 'RUNNING' });
    const service = new DataSyncService(store.db as never, [], () => new Date()); await service.recoverInterrupted();
    expect(store.runs[0]).toMatchObject({ status: 'FAILED', error: 'Servidor reiniciado durante la sincronización' });
  });
});
