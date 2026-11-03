import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { PokemonSelectorResponse } from '../lib/api-contract';
import type { PokemonSearchOption } from '../room/pokemon-search';

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

/** Mensaje del buscador: un fallo de red (`TypeError` de `fetch`) no llega en español, el del servidor sí. */
export function poolErrorMessage(caught: unknown): string {
  if (caught instanceof TypeError || !(caught instanceof Error) || !caught.message) return 'No se pudo cargar el buscador de Pokémon. Comprueba la conexión.';
  return caught.message;
}

export async function fetchPokemonPool(path: string, signal: AbortSignal): Promise<PokemonSearchOption[]> {
  const body = await api<PokemonSelectorResponse>(path, { signal });
  return body.pokemon;
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
    let active = true;
    const controller = new AbortController();
    setError('');
    setLoading(true);
    void fetchPokemonPool(query, controller.signal)
      .then((entries) => { if (active) setPokemon(entries); })
      .catch((caught: unknown) => { if (active) setError(poolErrorMessage(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt, enabled, query]);

  return { pokemon, error, loading, retry };
}
