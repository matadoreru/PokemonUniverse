import type { ChangelogEntry } from '@pokemon-universe/shared/public';

export const LAST_READ_CHANGELOG_KEY = 'pokemon-universe:last-read-changelog';

export function unreadChangelogCount(entries: readonly ChangelogEntry[], lastReadVersion: string | null): number {
  if (!entries.length) return 0;
  if (!lastReadVersion) return entries.length;
  const readIndex = entries.findIndex((entry) => entry.version === lastReadVersion);
  return readIndex < 0 ? entries.length : readIndex;
}
