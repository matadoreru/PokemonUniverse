import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from '@pokemon-universe/shared';
import { unreadChangelogCount } from './changelog-state.js';

const entries = ['0.9.0', '0.8.1', '0.8.0'].map((version, index): ChangelogEntry => ({
  id: version, version, title: version, date: new Date(2026, 8, 10 - index).toISOString(), published: true,
  content: [{ type: 'NEW', text: 'Cambio publicado.' }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}));

describe('changelog unread state', () => {
  it('counts only versions newer than the last one read', () => {
    expect(unreadChangelogCount(entries, '0.8.1')).toBe(1);
    expect(unreadChangelogCount(entries, '0.9.0')).toBe(0);
  });

  it('treats every published version as unread on a new or stale browser', () => {
    expect(unreadChangelogCount(entries, null)).toBe(3);
    expect(unreadChangelogCount(entries, '0.1.0')).toBe(3);
    expect(unreadChangelogCount([], null)).toBe(0);
  });
});
