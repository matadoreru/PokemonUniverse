import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTING_NOTICE_DELAY_MS, createConnectionNotice, type ConnectionNoticeKind } from './connection-notice';

describe('connection notice', () => {
  let shown: ConnectionNoticeKind[];
  const watch = () => createConnectionNotice((kind) => shown.push(kind));
  beforeEach(() => { vi.useFakeTimers(); shown = []; });
  afterEach(() => { vi.useRealTimers(); });

  it('shows «connecting» only after 400 ms without a connection', () => {
    const notice = watch();
    notice.update(false);
    vi.advanceTimersByTime(CONNECTING_NOTICE_DELAY_MS - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual(['connecting']);
    notice.update(true);
    expect(shown).toEqual(['connecting', null]);
  });

  it('never shows anything when the room connects within the delay', () => {
    const notice = watch();
    notice.update(false);
    vi.advanceTimersByTime(5);
    notice.update(true);
    vi.advanceTimersByTime(10_000);
    expect(shown).toEqual([]);
  });

  it('shows «lost» immediately after having been connected, and clears on reconnect', () => {
    const notice = watch();
    notice.update(false);
    notice.update(true);
    notice.update(false);
    expect(shown).toEqual(['lost']);
    vi.advanceTimersByTime(10_000);
    expect(shown).toEqual(['lost']);
    notice.update(true);
    expect(shown).toEqual(['lost', null]);
  });

  it('cancels the pending timer on dispose', () => {
    const notice = watch();
    notice.update(false);
    notice.dispose();
    vi.advanceTimersByTime(10_000);
    expect(shown).toEqual([]);
  });
});
