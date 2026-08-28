import type { DataSyncService } from './service.js';

export interface SyncSchedule { hour: number; minute: number; timeZone: string }

function parts(date: Date, timeZone: string): Record<string, number> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

/** Returns the next wall-clock occurrence while respecting Europe/Madrid DST. */
export function nextScheduledSync(now: Date, schedule: SyncSchedule): Date {
  const local = parts(now, schedule.timeZone);
  const targetDayOffset = local.hour! > schedule.hour || local.hour === schedule.hour && local.minute! >= schedule.minute ? 1 : 0;
  const approximate = new Date(Date.UTC(local.year!, local.month! - 1, local.day! + targetDayOffset, schedule.hour, schedule.minute));
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(approximate.getTime() + offset * 60_000); const value = parts(candidate, schedule.timeZone);
    if (value.year === parts(approximate, 'UTC').year && value.month === parts(approximate, 'UTC').month && value.day === parts(approximate, 'UTC').day && value.hour === schedule.hour && value.minute === schedule.minute && candidate > now) return candidate;
  }
  throw new Error(`Could not resolve synchronization schedule for ${schedule.timeZone}`);
}

export class DataSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly service: DataSyncService, readonly schedule: SyncSchedule) {}
  next(now = new Date()): Date { return nextScheduledSync(now, this.schedule); }
  start(): void { this.arm(); }
  stop(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private arm(): void {
    const next = this.next(); const delay = Math.min(next.getTime() - Date.now(), 2_147_000_000);
    this.timer = setTimeout(() => {
      if (Date.now() + 1_000 < next.getTime()) { this.arm(); return; }
      void this.service.startAll('INCREMENTAL').catch((error) => console.error('[DataSync] scheduled synchronization failed:', error)).finally(() => this.arm());
    }, Math.max(1_000, delay));
    this.timer.unref();
    console.info(`[DataSync] next synchronization at ${next.toISOString()} (${this.schedule.timeZone})`);
  }
}
