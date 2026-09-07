import type { ChangelogEntry } from '@pokemon-universe/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { LAST_READ_CHANGELOG_KEY, unreadChangelogCount } from './changelog-state';

interface ChangelogContextValue {
  entries: ChangelogEntry[];
  loading: boolean;
  error: string;
  unreadCount: number;
  markAllRead(): void;
  refresh(): Promise<void>;
}

const ChangelogContext = createContext<ChangelogContextValue>({
  entries: [], loading: false, error: '', unreadCount: 0, markAllRead: () => undefined, refresh: async () => undefined,
});

function storedLastReadVersion(): string | null {
  try { return window.localStorage.getItem(LAST_READ_CHANGELOG_KEY); } catch { return null; }
}

export function ChangelogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [lastReadVersion, setLastReadVersion] = useState<string | null>(() => typeof window === 'undefined' ? null : storedLastReadVersion());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setEntries((await api<{ entries: ChangelogEntry[] }>('/changelog')).entries); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las novedades.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const markAllRead = useCallback(() => {
    const latestVersion = entries[0]?.version;
    if (!latestVersion) return;
    try { window.localStorage.setItem(LAST_READ_CHANGELOG_KEY, latestVersion); } catch { /* Browsing still works when storage is unavailable. */ }
    setLastReadVersion(latestVersion);
  }, [entries]);

  const value = useMemo<ChangelogContextValue>(() => ({
    entries, loading, error, unreadCount: unreadChangelogCount(entries, lastReadVersion), markAllRead, refresh,
  }), [entries, error, lastReadVersion, loading, markAllRead, refresh]);

  return <ChangelogContext.Provider value={value}>{children}</ChangelogContext.Provider>;
}

export function useChangelog(): ChangelogContextValue { return useContext(ChangelogContext); }
