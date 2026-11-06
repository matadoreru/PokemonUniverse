import type { ChatMessage } from '@pokemon-universe/shared/public';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNOUNCE_GROUP_MS, announcement, ChatAnnouncer } from './chat-announcer';

const msg = (seq: number, authorId = 'u2', authorName = 'Ana', text = 'hola'): ChatMessage => ({ seq, authorId, authorName, text, sentAt: seq });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
  const texts: string[] = [];
  const announcer = new ChatAnnouncer('me', (text) => texts.push(text));
  announcer.seen([], true);
  return { texts, announcer };
}

describe('chat announcer', () => {
  it('announcer ignores history and own messages', () => {
    const texts: string[] = [];
    const announcer = new ChatAnnouncer('me', (text) => texts.push(text));
    announcer.seen([msg(1)], true);
    announcer.seen([msg(2, 'me', 'Yo')], false);
    vi.advanceTimersByTime(ANNOUNCE_GROUP_MS * 2);
    expect(texts).toEqual([]);
  });

  it('announces a single message as «Ana: hola»', () => {
    const { texts, announcer } = setup();
    announcer.seen([msg(1)], false);
    vi.advanceTimersByTime(ANNOUNCE_GROUP_MS);
    expect(texts).toEqual(['Ana: hola']);
  });

  it('groups three messages within the window', () => {
    const { texts, announcer } = setup();
    announcer.seen([msg(1)], false);
    vi.advanceTimersByTime(500);
    announcer.seen([msg(1), msg(2)], false);
    vi.advanceTimersByTime(500);
    announcer.seen([msg(3, 'u3', 'Luis', 'adiós')], false);
    vi.advanceTimersByTime(ANNOUNCE_GROUP_MS);
    expect(texts).toEqual(['3 mensajes nuevos. El último, de Luis: adiós']);
    expect(announcement([])).toBe('');
  });

  it('remount marks existing messages as seen', () => {
    const texts: string[] = [];
    const announcer = new ChatAnnouncer('me', (text) => texts.push(text));
    announcer.seen([msg(1), msg(2)], false);
    vi.advanceTimersByTime(ANNOUNCE_GROUP_MS * 2);
    expect(texts).toEqual([]);
    announcer.seen([msg(1), msg(2), msg(3)], false);
    vi.advanceTimersByTime(ANNOUNCE_GROUP_MS);
    expect(texts).toEqual(['Ana: hola']);
  });

  it('dispose cancels the pending announcement', () => {
    const { texts, announcer } = setup();
    announcer.seen([msg(1)], false);
    announcer.dispose();
    vi.advanceTimersByTime(ANNOUNCE_GROUP_MS * 2);
    expect(texts).toEqual([]);
  });
});
