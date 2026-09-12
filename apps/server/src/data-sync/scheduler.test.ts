import { describe, expect, it, vi } from 'vitest';
import type { DataSyncService } from './service.js';
import { DataSyncScheduler, nextScheduledSync } from './scheduler.js';

describe('data synchronization scheduler', () => {
  const schedule = { hour: 6, minute: 0, timeZone: 'Europe/Madrid' };
  it('schedules 06:00 Madrid before and after daylight-saving changes', () => {
    expect(nextScheduledSync(new Date('2026-01-15T04:00:00Z'), schedule).toISOString()).toBe('2026-01-15T05:00:00.000Z');
    expect(nextScheduledSync(new Date('2026-07-15T03:00:00Z'), schedule).toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });
  it('moves to the next local day after the scheduled time', () => {
    expect(nextScheduledSync(new Date('2026-07-15T05:00:00Z'), schedule).toISOString()).toBe('2026-07-16T04:00:00.000Z');
  });
});

it('does not rearm when stopped during an active synchronization', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-07-15T03:59:59Z'));
    let complete!: () => void;
    const startAll = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const scheduler = new DataSyncScheduler({ startAll } as unknown as DataSyncService, { hour: 6, minute: 0, timeZone: 'Europe/Madrid' });
    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(startAll).toHaveBeenCalledTimes(1);
    scheduler.stop();
    complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
