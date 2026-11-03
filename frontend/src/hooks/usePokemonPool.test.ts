import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PokemonSearchOption } from '../room/pokemon-search';

const api = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ api }));

const { fetchPokemonPool, poolErrorMessage, pokemonPoolPath } = await import('./usePokemonPool');

const pool: PokemonSearchOption[] = [
  { id: 'abra', name: 'Abra', sprite: '/api/pokemon/abra/sprite' },
  { id: 'bulbasaur', name: 'Bulbasaur', sprite: '/api/pokemon/bulbasaur/sprite' },
];

describe('usePokemonPool', () => {
  beforeEach(() => { api.mockReset(); });

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
    for (const generic of ['', '  ', 'Request failed', 'Internal Server Error', 'Bad Gateway', 'Service Unavailable']) {
      expect(poolErrorMessage(new Error(generic)), generic).toBe('No se pudo cargar el buscador de Pokémon. Comprueba la conexión.');
    }
  });
});
