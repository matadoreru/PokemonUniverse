import type { DataSyncMode, DataSyncSource, PrismaClient } from '@prisma/client';
import type { DataSyncAdapter, SyncOverviewItem, SyncResult } from './types.js';
import { countPersistedPokemonPalettes, MIN_PLAYABLE_POKEMON_PALETTES } from './pokemon-palette-sync.js';

const SOURCES: DataSyncSource[] = ['POKEAPI', 'TCGDEX'];
export class SyncAlreadyRunningError extends Error { status = 409; }

export class DataSyncService {
  private readonly adapters: Map<DataSyncSource, DataSyncAdapter>;
  private readonly active = new Map<DataSyncSource, Promise<SyncResult>>();
  private readonly completedListeners = new Set<(source: DataSyncSource) => void | Promise<void>>();

  constructor(private readonly db: PrismaClient, adapters: readonly DataSyncAdapter[], private readonly nextSync: () => Date) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.source, adapter]));
  }

  async recoverInterrupted(): Promise<void> {
    const now = new Date();
    await this.db.dataSyncRun.updateMany({ where: { status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'FAILED', completedAt: now, error: 'Servidor reiniciado durante la sincronización' } });
  }

  isRunning(source?: DataSyncSource): boolean { return source ? this.active.has(source) : this.active.size > 0; }
  onCompleted(listener: (source: DataSyncSource) => void | Promise<void>): () => void { this.completedListeners.add(listener); return () => this.completedListeners.delete(listener); }

  start(source: DataSyncSource, mode: DataSyncMode): Promise<SyncResult> {
    if (this.active.has(source)) throw new SyncAlreadyRunningError(`${source} ya se está sincronizando`);
    const task = this.execute(source, mode).finally(() => this.active.delete(source));
    this.active.set(source, task);
    return task;
  }

  async startAll(mode: DataSyncMode): Promise<SyncResult[]> {
    if (this.isRunning()) throw new SyncAlreadyRunningError('Ya hay una sincronización activa');
    return Promise.all(SOURCES.map((source) => this.start(source, source === 'TCGDEX' && mode === 'INCREMENTAL' ? 'PRICE_REFRESH' : mode)));
  }

  async ensureInitialPokemon(): Promise<void> {
    const adapter = this.requireAdapter('POKEAPI');
    const available = await adapter.recordsAvailable();
    const palettes = available >= 1_025 ? await countPersistedPokemonPalettes() : 0;
    if (available >= 1_025 && palettes >= MIN_PLAYABLE_POKEMON_PALETTES) {
      await this.db.dataSyncState.upsert({ where: { source: 'POKEAPI' }, create: { source: 'POKEAPI', recordsAvailable: available, datasetVersion: String(available) }, update: { recordsAvailable: available } });
      return;
    }
    await this.start('POKEAPI', 'INITIAL');
  }

  startInitialTcgInBackground(): void {
    const adapter = this.requireAdapter('TCGDEX');
    void adapter.recordsAvailable().then(async (count) => {
      if (count === 0) return this.start('TCGDEX', 'INITIAL');
      await this.db.dataSyncState.upsert({ where: { source: 'TCGDEX' }, create: { source: 'TCGDEX', recordsAvailable: count, datasetVersion: String(count) }, update: { recordsAvailable: count } });
      return undefined;
    }).catch((error) => console.error('[DataSync] TCGdex initial sync failed:', error));
  }

  async overview(): Promise<SyncOverviewItem[]> {
    const [states, runs] = await Promise.all([
      this.db.dataSyncState.findMany(),
      this.db.dataSyncRun.findMany({ where: { status: { in: ['COMPLETED', 'FAILED', 'RUNNING'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return SOURCES.map((source) => {
      const state = states.find((item) => item.source === source);
      const run = runs.find((item) => item.source === source);
      const running = this.active.has(source) || run?.status === 'RUNNING';
      const ready = (state?.recordsAvailable ?? 0) > 0;
      return {
        source, status: running ? 'RUNNING' : run?.status === 'FAILED' ? 'FAILED' : ready ? 'COMPLETED' : 'NOT_READY', ready,
        lastSyncAt: state?.lastSuccessAt?.toISOString() ?? null, lastAttemptAt: state?.lastAttemptAt?.toISOString() ?? null,
        lastFullSyncAt: state?.lastFullSyncAt?.toISOString() ?? null, durationMs: run?.durationMs ?? null,
        recordsProcessed: run?.recordsProcessed ?? 0, inserted: run?.inserted ?? 0, updated: run?.updated ?? 0,
        skipped: run?.skipped ?? 0, recordsAvailable: state?.recordsAvailable ?? 0, error: run?.error ?? state?.lastError ?? null,
        nextSyncAt: this.nextSync().toISOString(),
      };
    });
  }

  private requireAdapter(source: DataSyncSource): DataSyncAdapter {
    const adapter = this.adapters.get(source);
    if (!adapter) throw new Error(`No sync adapter registered for ${source}`);
    return adapter;
  }

  private async execute(source: DataSyncSource, mode: DataSyncMode): Promise<SyncResult> {
    const adapter = this.requireAdapter(source); const startedAt = new Date();
    const run = await this.db.dataSyncRun.create({ data: { source, mode, status: 'RUNNING', startedAt } });
    console.info(`[DataSync] sync started source=${source} mode=${mode}`);
    await this.db.dataSyncState.upsert({ where: { source }, create: { source, lastAttemptAt: startedAt }, update: { lastAttemptAt: startedAt } });
    try {
      const result = await adapter.run(mode); const completedAt = new Date(); const durationMs = completedAt.getTime() - startedAt.getTime();
      const available = await adapter.recordsAvailable();
      await this.db.$transaction([
        this.db.dataSyncRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', completedAt, durationMs, recordsProcessed: result.processed, inserted: result.inserted, updated: result.updated, skipped: result.skipped, ...(result.details ? { details: result.details } : {}) } }),
        this.db.dataSyncState.upsert({ where: { source }, create: { source, datasetVersion: result.datasetVersion ?? null, lastSuccessAt: completedAt, lastAttemptAt: startedAt, ...(mode === 'FULL' || mode === 'INITIAL' ? { lastFullSyncAt: completedAt } : {}), recordsAvailable: available }, update: { datasetVersion: result.datasetVersion ?? null, lastSuccessAt: completedAt, lastAttemptAt: startedAt, ...(mode === 'FULL' || mode === 'INITIAL' ? { lastFullSyncAt: completedAt } : {}), recordsAvailable: available, lastError: null } }),
      ]);
      console.info(`[DataSync] sync completed source=${source} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped} durationMs=${durationMs}`);
      for (const listener of this.completedListeners) { try { await listener(source); } catch (error) { console.error(`[DataSync] post-sync refresh failed source=${source}`, error); } }
      return result;
    } catch (error) {
      const completedAt = new Date(); const message = error instanceof Error ? error.message : String(error); const durationMs = completedAt.getTime() - startedAt.getTime();
      await this.db.$transaction([
        this.db.dataSyncRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt, durationMs, error: message } }),
        this.db.dataSyncState.upsert({ where: { source }, create: { source, lastAttemptAt: startedAt, lastError: message }, update: { lastAttemptAt: startedAt, lastError: message } }),
      ]);
      console.error(`[DataSync] sync failed source=${source} durationMs=${durationMs} error=${message}`);
      throw error;
    }
  }
}
