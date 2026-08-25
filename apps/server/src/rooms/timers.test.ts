import { describe, expect, it, vi } from 'vitest';
import { cancelTimer, earliestDeadline, scheduleDeadline } from './timers.js';

describe('room timers', () => {
  it('selects finite deadlines and schedules relative to the authoritative clock', () => {
    vi.useFakeTimers(); const callback = vi.fn();
    expect(earliestDeadline([null, 500, undefined, 200, Infinity])).toBe(200);
    const timer = scheduleDeadline(200, callback, 100, 5);
    vi.advanceTimersByTime(104); expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(callback).toHaveBeenCalledOnce();
    expect(cancelTimer(timer)).toBeNull(); vi.useRealTimers();
  });
});
