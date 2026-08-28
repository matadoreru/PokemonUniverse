import { describe, expect, it } from 'vitest';
import { nextScheduledSync } from './scheduler.js';

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
