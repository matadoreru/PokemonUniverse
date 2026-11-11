import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/api-errors';
import type { PokemonSelectorResponse } from '../lib/api-contract';
import type { PokemonSearchOption } from '../room/game-kit/pokemon-search';

interface PokemonPoolQuery {
  generations: readonly number[];
  includeForms?: boolean;
  enabled?: boolean;
}

interface PokemonPoolResult {
  pokemon: PokemonSearchOption[];
  error: string;
  loading: boolean;
  /** Vuelve a pedir el catálogo tras un error. */
  retry(): void;
}

/** Catálogo reducido del buscador: solo id, nombre y sprite opaco, ordenado por nombre. */
export function pokemonPoolPath(generations: readonly number[], includeForms: boolean): string {
  const params = new URLSearchParams({ generations: generations.join(',') });
  if (includeForms) params.set('includeForms', 'true');
  return `/pokemon/selector?${params.toString()}`;
}

const POOL_ERROR_FALLBACK = 'No se pudo cargar el buscador de Pokémon. Comprueba la conexión.';
/** El límite de peticiones del servidor (`ApiError` «Too many requests»). */
const POOL_RATE_LIMITED = 'Demasiadas peticiones seguidas. Espera unos segundos y pulsa «Reintentar».';

/**
 * Mensaje del estado de error del buscador. Un fallo de red, un mensaje vacío o un texto en inglés se sustituyen por
 * un texto en español; el `error` que envía el servidor en el cuerpo, si ya está en español, se muestra tal cual.
 */
export function poolErrorMessage(caught: unknown): string {
  // Un texto suelto (no un `Error`) no viene de `api()`: el de reserva.
  if (!(caught instanceof Error)) return POOL_ERROR_FALLBACK;
  return apiErrorMessage(caught, { translations: { 'Too many requests': POOL_RATE_LIMITED }, network: POOL_ERROR_FALLBACK, status: false, fallback: POOL_ERROR_FALLBACK });
}

export async function fetchPokemonPool(path: string, signal: AbortSignal): Promise<PokemonSearchOption[]> {
  const body = await api<PokemonSelectorResponse>(path, { signal });
  return body.pokemon;
}

/**
 * Copia en memoria del catálogo del buscador por ruta, 10 minutos: en juegos con turnos (Sketchmon, PokéTaboo) el
 * buscador se desmonta y vuelve a montar en cada turno, y sin ella cada jugador lo pediría otra vez cada turno.
 */
export const POOL_CACHE_MS = 10 * 60_000;
const poolCache = new Map<string, { at: number; entries: PokemonSearchOption[] }>();

/** Entradas en caché si siguen frescas; si no, `null`. */
export function cachedPokemonPool(path: string, now: number = Date.now()): PokemonSearchOption[] | null {
  const hit = poolCache.get(path);
  if (!hit) return null;
  if (now - hit.at > POOL_CACHE_MS) { poolCache.delete(path); return null; }
  return hit.entries;
}

export function rememberPokemonPool(path: string, entries: PokemonSearchOption[], now: number = Date.now()): void {
  poolCache.set(path, { at: now, entries });
}

/** Solo pruebas. */
export function clearPokemonPoolCache(): void {
  poolCache.clear();
}

/** One cancellable, consistently error-handled client repository query for every game. */
export function usePokemonPool({ generations, includeForms = false, enabled = true }: PokemonPoolQuery): PokemonPoolResult {
  const generationKey = generations.join(',');
  const query = useMemo(
    () => pokemonPoolPath(generationKey ? generationKey.split(',').map(Number) : [], includeForms),
    [generationKey, includeForms],
  );
  const [pokemon, setPokemon] = useState<PokemonSearchOption[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    const cached = cachedPokemonPool(query);
    if (cached) { setPokemon(cached); setError(''); setLoading(false); return undefined; }
    let active = true;
    const controller = new AbortController();
    setError('');
    setLoading(true);
    void fetchPokemonPool(query, controller.signal)
      .then((entries) => { rememberPokemonPool(query, entries); if (active) setPokemon(entries); })
      .catch((caught: unknown) => { if (!active) return; console.warn('[usePokemonPool]', caught); setError(poolErrorMessage(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt, enabled, query]);

  return { pokemon, error, loading, retry };
}
