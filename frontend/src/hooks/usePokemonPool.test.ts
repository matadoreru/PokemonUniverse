import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PokemonSearchOption } from '../room/pokemon-search';

const api = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ api }));

const { cachedPokemonPool, clearPokemonPoolCache, fetchPokemonPool, POOL_CACHE_MS, poolErrorMessage, pokemonPoolPath, rememberPokemonPool } = await import('./usePokemonPool');

const pool: PokemonSearchOption[] = [
  { id: 'abra', name: 'Abra', sprite: '/api/pokemon/abra/sprite' },
  { id: 'bulbasaur', name: 'Bulbasaur', sprite: '/api/pokemon/bulbasaur/sprite' },
];

describe('usePokemonPool', () => {
  beforeEach(() => { api.mockReset(); clearPokemonPoolCache(); });

  it('guarda el catálogo en memoria 10 minutos por ruta (un turno nuevo no lo vuelve a pedir)', () => {
    const path = pokemonPoolPath([1], false);
    expect(cachedPokemonPool(path, 1_000)).toBeNull();
    rememberPokemonPool(path, pool, 1_000);
    expect(cachedPokemonPool(path, 1_000 + POOL_CACHE_MS)).toEqual(pool);
    expect(cachedPokemonPool(pokemonPoolPath([2], false), 1_000)).toBeNull();
    expect(cachedPokemonPool(path, 1_001 + POOL_CACHE_MS)).toBeNull();
  });

  it('pide el catálogo reducido del buscador, no /pokemon', () => {
    expect(pokemonPoolPath([1, 2], false)).toBe('/pokemon/selector?generations=1%2C2');
    expect(pokemonPoolPath([1, 2], true)).toBe('/pokemon/selector?generations=1%2C2&includeForms=true');
    expect(pokemonPoolPath([], false)).toBe('/pokemon/selector?generations=');
  });

  it('devuelve las entradas del buscador tal cual', async () => {
    api.mockResolvedValue({ pokemon: pool });
    const controller = new AbortController();
    await expect(fetchPokemonPool('/pokemon/selector?generations=1', controller.signal)).resolves.toEqual(pool);
    expect(api).toHaveBeenCalledWith('/pokemon/selector?generations=1', { signal: controller.signal });
  });

  it('traduce un fallo de red y conserva el mensaje del servidor', () => {
    expect(poolErrorMessage(new TypeError('Failed to fetch'))).toBe('No se pudo cargar el buscador de Pokémon. Comprueba la conexión.');
    expect(poolErrorMessage('raro')).toBe('No se pudo cargar el buscador de Pokémon. Comprueba la conexión.');
    expect(poolErrorMessage(new Error('Generaciones no válidas'))).toBe('Generaciones no válidas');
    expect(poolErrorMessage(new Error('Too many requests'))).toBe('Demasiadas peticiones seguidas. Espera unos segundos y pulsa «Reintentar».');
    for (const generic of ['', '  ', 'Request failed', 'Internal Server Error', 'Internal server error', 'Bad Gateway', 'Service Unavailable', 'Authentication required', 'Invalid request']) {
      expect(poolErrorMessage(new Error(generic)), generic).toBe('No se pudo cargar el buscador de Pokémon. Comprueba la conexión.');
    }
  });
});
