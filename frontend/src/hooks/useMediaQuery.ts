import { useMemo, useSyncExternalStore } from 'react';

function mediaList(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

export function readMediaQuery(query: string): boolean {
  return mediaList(query)?.matches ?? false;
}

/** Se suscribe a `change`; sin `matchMedia` no hay nada que escuchar. Devuelve la baja. */
export function subscribeMediaQuery(query: string, notify: () => void): () => void {
  const list = mediaList(query);
  if (!list) return () => undefined;
  list.addEventListener('change', notify);
  return () => list.removeEventListener('change', notify);
}

/** Sigue una media query. Con `useSyncExternalStore` el primer render ya lee el valor real; `false` sin `matchMedia`. */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => ({
    subscribe: (notify: () => void) => subscribeMediaQuery(query, notify),
    snapshot: () => readMediaQuery(query),
  }), [query]);
  return useSyncExternalStore(store.subscribe, store.snapshot, () => false);
}
