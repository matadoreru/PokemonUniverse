import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isArmedVisible, isDelayElapsed, scheduleHide } from './useTimedVisibility';

describe('useTimedVisibility helpers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('hides after holdMs and not before', () => {
    const onHide = vi.fn();
    scheduleHide(1_600, onHide);
    vi.advanceTimersByTime(1_599);
    expect(onHide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('cancelling (unmount or re-arm) never fires the old hide', () => {
    const onHide = vi.fn();
    const cancel = scheduleHide(400, onHide);
    vi.advanceTimersByTime(200);
    cancel();
    vi.advanceTimersByTime(1_000);
    expect(onHide).not.toHaveBeenCalled();
  });

  it('a new arm key shows the layer again after the previous one was hidden', () => {
    expect(isArmedVisible(null, 'electric|¡Acierto!')).toBe(true);
    expect(isArmedVisible('electric|¡Acierto!', 'electric|¡Acierto!')).toBe(false);
    expect(isArmedVisible('electric|¡Acierto!', 'berry|Eliminado')).toBe(true);
  });

  it('the delayed content only counts as elapsed for the key whose timer fired, or at once if immediate', () => {
    expect(isDelayElapsed(null, 'aqua|Ana', false)).toBe(false);
    expect(isDelayElapsed('aqua|Ana', 'aqua|Ana', false)).toBe(true);
    expect(isDelayElapsed('aqua|Ana', 'berry|Bruno', false)).toBe(false);
    expect(isDelayElapsed(null, 'aqua|Ana', true)).toBe(true);
  });
});
