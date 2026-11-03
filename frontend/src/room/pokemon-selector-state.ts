import { normalizePokemonQuery } from './pokemon-search';

/** Qué pinta el buscador de Pokémon bajo el campo de búsqueda. */
export type SelectorView = 'loading' | 'error' | 'no-matches' | 'results' | 'prompt';

/** Prioridad: error del catálogo > carga > búsqueda sin coincidencias > resultados o invitación a escribir. */
export function selectorView({ loading, loadError, query, resultCount }: { loading: boolean; loadError: string; query: string; resultCount: number }): SelectorView {
  if (loadError) return 'error';
  if (loading) return 'loading';
  if (!normalizePokemonQuery(query)) return 'prompt';
  return resultCount > 0 ? 'results' : 'no-matches';
}
