import type { DataSyncMode, DataSyncSource, Prisma } from '@prisma/client';

export interface SyncResult {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  datasetVersion?: string;
  details?: Prisma.InputJsonObject;
}

export interface DataSyncAdapter {
  readonly source: DataSyncSource;
  run(mode: DataSyncMode): Promise<SyncResult>;
  recordsAvailable(): Promise<number>;
}

export interface SyncOverviewItem {
  source: DataSyncSource;
  status: 'IDLE' | 'RUNNING' | 'FAILED' | 'COMPLETED' | 'NOT_READY';
  ready: boolean;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
  lastFullSyncAt: string | null;
  durationMs: number | null;
  recordsProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  recordsAvailable: number;
  error: string | null;
  nextSyncAt: string;
}
