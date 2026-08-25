import type { Pokemon } from '@pokemon-universe/shared';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

interface PokemonPoolQuery {
  generations: readonly number[];
  includeForms?: boolean;
  enabled?: boolean;
}

interface PokemonPoolResult {
  pokemon: Pokemon[];
  error: string;
  loading: boolean;
}

/** One cancellable, consistently error-handled client repository query for every game. */
export function usePokemonPool({ generations, includeForms = false, enabled = true }: PokemonPoolQuery): PokemonPoolResult {
  const generationKey = generations.join(',');
  const query = useMemo(() => {
    const params = new URLSearchParams({ generations: generationKey });
    if (includeForms) params.set('includeForms', 'true');
    return `/pokemon?${params.toString()}`;
  }, [generationKey, includeForms]);
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let active = true;
    setError('');
    setLoading(true);
    void api<{ pokemon: Pokemon[] }>(query)
      .then((body) => { if (active) setPokemon(body.pokemon); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'No se pudo cargar el buscador.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, query]);

  return { pokemon, error, loading };
}
