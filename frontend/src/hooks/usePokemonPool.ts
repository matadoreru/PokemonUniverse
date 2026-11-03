import { useEffect, useMemo, useState } from 'react';
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
}

/** Catálogo reducido del buscador: solo id, nombre y sprite opaco, ordenado por nombre. */
export function pokemonPoolPath(generations: readonly number[], includeForms: boolean): string {
  const params = new URLSearchParams({ generations: generations.join(',') });
  if (includeForms) params.set('includeForms', 'true');
  return `/pokemon/selector?${params.toString()}`;
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

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let active = true;
    const controller = new AbortController();
    setError('');
    setLoading(true);
    void fetchPokemonPool(query, controller.signal)
      .then((entries) => { if (active) setPokemon(entries); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'No se pudo cargar el buscador.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [enabled, query]);

  return { pokemon, error, loading };
}
