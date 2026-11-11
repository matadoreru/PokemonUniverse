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

/**
 * Teclado de la rejilla de resultados. `index` es el resultado con foco (-1: el campo de búsqueda) y `enabled` dice cuáles
 * se pueden enfocar (los bloqueados o en espera son botones deshabilitados). Devuelve el índice al que pasa el foco,
 * `'input'` para volver al campo o `null` si la tecla no mueve nada.
 */
export function resultFocusTarget({ index, key, columns, enabled }: { index: number; key: string; columns: number; enabled: readonly boolean[] }): number | 'input' | null {
  const count = enabled.length;
  const cols = Math.max(1, columns);
  const firstFrom = (start: number, step: number): number | null => {
    for (let i = start; i >= 0 && i < count; i += step) if (enabled[i]) return i;
    return null;
  };
  if (index < 0) return key === 'ArrowDown' ? firstFrom(0, 1) : null;
  switch (key) {
    case 'ArrowRight': return firstFrom(index + 1, 1);
    case 'ArrowLeft': return firstFrom(index - 1, -1);
    case 'ArrowDown': {
      // Misma columna en la fila siguiente; si no hay (fila incompleta o bloqueadas), la última disponible posterior.
      const below = firstFrom(index + cols, cols);
      if (below !== null) return below;
      const last = firstFrom(count - 1, -1);
      return last !== null && last > index && Math.floor(last / cols) > Math.floor(index / cols) ? last : null;
    }
    case 'ArrowUp': return index - cols < 0 ? 'input' : firstFrom(index - cols, -cols) ?? 'input';
    case 'Home': return firstFrom(0, 1);
    case 'End': return firstFrom(count - 1, -1);
    case 'Escape': return 'input';
    default: return null;
  }
}
