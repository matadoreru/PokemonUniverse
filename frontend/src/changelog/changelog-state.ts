import type { ChangelogEntry } from '@pokemon-universe/shared/public';

export const LAST_READ_CHANGELOG_KEY = 'pokemon-universe:last-read-changelog';

export function unreadChangelogCount(entries: readonly ChangelogEntry[], lastReadVersion: string | null): number {
  if (!entries.length) return 0;
  if (!lastReadVersion) return entries.length;
  const readIndex = entries.findIndex((entry) => entry.version === lastReadVersion);
  return readIndex < 0 ? entries.length : readIndex;
}

/**
 * Versiones que no se habían leído al abrir Novedades: las `unreadCount` primeras (la lista llega de la más nueva a la
 * más vieja). La página las guarda al llegar, porque enseguida lo marca todo como leído y el contador baja a 0.
 */
export function unreadVersions(entries: readonly ChangelogEntry[], unreadCount: number): ReadonlySet<string> {
  return new Set(entries.slice(0, Math.max(0, unreadCount)).map((entry) => entry.version));
}

/** Versión abierta según `?v=` de la URL; `null` si no hay o si no existe (entonces se ve la lista). */
export function selectedChangelogEntry(entries: readonly ChangelogEntry[], version: string | null): ChangelogEntry | null {
  if (!version) return null;
  return entries.find((entry) => entry.version === version) ?? null;
}
