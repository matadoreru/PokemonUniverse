import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonSelector } from './PokemonSelector';
import { resultFocusTarget, selectorView } from './pokemon-selector-state';
import { liveRegions } from '../test-support/live-regions';

const base = { loading: false, loadError: '', query: '', resultCount: 0 };
const POKEMON = [
  { id: 'pikachu', name: 'Pikachu', sprite: '/s/a' },
  { id: 'pichu', name: 'Pichu', sprite: '/s/b' },
  { id: 'raichu', name: 'Raichu', sprite: '/s/c' },
];
type SelectorProps = { loading?: boolean; loadError?: string; onRetry?(): void; initialQuery?: string; locked?: Set<string>; pokemon?: typeof POKEMON; variant?: 'card' | 'embedded' };
const selector = (props: SelectorProps) => renderToStaticMarkup(createElement(PokemonSelector, {
  pokemon: [], locked: new Set<string>(), disabled: false, onSelect: async () => undefined, ...props,
}));

describe('selectorView', () => {
  it('prioriza el error sobre la carga y la búsqueda', () => {
    expect(selectorView({ ...base, loading: true, loadError: 'Sin red', query: 'pika', resultCount: 3 })).toBe('error');
  });
  it('muestra la carga mientras llega el catálogo, aunque ya haya búsqueda', () => {
    expect(selectorView({ ...base, loading: true, query: 'pika' })).toBe('loading');
  });
  it('distingue una búsqueda sin coincidencias', () => {
    expect(selectorView({ ...base, query: 'zzzz' })).toBe('no-matches');
  });
  it('muestra resultados cuando hay coincidencias', () => {
    expect(selectorView({ ...base, query: 'pika', resultCount: 1 })).toBe('results');
  });
  it('sin búsqueda (o solo espacios) invita a escribir', () => {
    expect(selectorView(base)).toBe('prompt');
    expect(selectorView({ ...base, query: '   ' })).toBe('prompt');
  });
});

describe('PokemonSelector estados', () => {
  it('pinta seis cartas esqueleto ocupadas mientras carga', () => {
    const markup = selector({ loading: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/data-skeleton/g)).toHaveLength(6);
    expect(markup).toContain('Cargando Pokémon…');
  });
  it('no añade regiones vivas a la pantalla: ni la carga, ni el vacío, ni los resultados (la pantalla tiene la suya)', () => {
    for (const markup of [selector({ loading: true }), selector({ pokemon: POKEMON, initialQuery: 'zzzz' }), selector({ pokemon: POKEMON, initialQuery: 'chu' }), selector({ pokemon: POKEMON })]) {
      expect(liveRegions(markup)).toEqual([]);
    }
  });
  it('pinta el error con role="alert" y la acción de reintentar', () => {
    const markup = selector({ loadError: 'No se pudo cargar el buscador.', onRetry: () => undefined });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No se pudo cargar el buscador.');
    expect(markup).toContain('Reintentar');
  });
  it('sin coincidencias: lo dice con la búsqueda y ofrece borrarla', () => {
    const markup = selector({ pokemon: POKEMON, initialQuery: 'zzzz' });
    expect(markup).toContain('Ningún Pokémon coincide con “zzzz”.');
    expect(markup).toContain('Borrar búsqueda');
  });
  it('resultados: botones con el nombre exacto, sin número de Pokédex, y la primera disponible marcada', () => {
    const markup = selector({ pokemon: POKEMON, initialQuery: 'chu', locked: new Set(['pikachu']) });
    expect(markup).toContain('pokemon-selector-results');
    expect(markup.match(/<button/g)).toHaveLength(3);
    // El sprite es decorativo: el nombre accesible del botón es solo el nombre.
    expect(markup).toContain('alt=""');
    expect(markup).not.toMatch(/Nº/);
    // Pikachu está bloqueado: deshabilitado; Pichu es la primera disponible y lleva la pista de Enter.
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Pikachu/);
    expect(markup).toMatch(/Pichu(?:(?!<\/button>).)*Enter/);
    expect(markup).not.toContain('aria-pressed');
  });
  it('el campo es un textbox con el nombre de inputLabel y la ayuda de teclado', () => {
    const markup = selector({});
    expect(markup).toContain('>Buscar Pokémon</label>');
    expect(markup).toContain('Enter elige la primera · ↓ recorre la lista');
  });
  it('sin las props nuevas se pinta como antes y sin autoFocus en el HTML', () => {
    const markup = selector({});
    expect(markup).not.toContain('data-skeleton');
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain('autofocus');
    expect(markup).not.toContain('<button');
  });
  it('no usa las clases antiguas', () => {
    for (const markup of [selector({ variant: 'card' }), selector({ loadError: 'x', onRetry: () => undefined }), selector({ pokemon: POKEMON, initialQuery: 'zzzz' })]) {
      expect(markup).not.toMatch(/class="[^"]*\b(card|field|btn-ghost|status-error|empty-state|skeleton)\b/);
    }
  });
});

describe('resultFocusTarget (teclado de la rejilla)', () => {
  const all = (n: number) => Array.from({ length: n }, () => true);
  it('desde el campo, ↓ va a la primera disponible', () => {
    expect(resultFocusTarget({ index: -1, key: 'ArrowDown', columns: 3, enabled: all(5) })).toBe(0);
    expect(resultFocusTarget({ index: -1, key: 'ArrowDown', columns: 3, enabled: [false, false, true] })).toBe(2);
    expect(resultFocusTarget({ index: -1, key: 'ArrowDown', columns: 3, enabled: [false] })).toBeNull();
    expect(resultFocusTarget({ index: -1, key: 'ArrowRight', columns: 3, enabled: all(5) })).toBeNull();
  });
  it('← y → recorren en orden saltando las bloqueadas', () => {
    expect(resultFocusTarget({ index: 0, key: 'ArrowRight', columns: 3, enabled: [true, false, true] })).toBe(2);
    expect(resultFocusTarget({ index: 2, key: 'ArrowLeft', columns: 3, enabled: [true, false, true] })).toBe(0);
    expect(resultFocusTarget({ index: 2, key: 'ArrowRight', columns: 3, enabled: all(3) })).toBeNull();
    expect(resultFocusTarget({ index: 0, key: 'ArrowLeft', columns: 3, enabled: all(3) })).toBeNull();
  });
  it('↑ y ↓ saltan una fila; ↑ en la primera fila vuelve al campo', () => {
    expect(resultFocusTarget({ index: 1, key: 'ArrowDown', columns: 3, enabled: all(7) })).toBe(4);
    expect(resultFocusTarget({ index: 4, key: 'ArrowUp', columns: 3, enabled: all(7) })).toBe(1);
    expect(resultFocusTarget({ index: 1, key: 'ArrowUp', columns: 3, enabled: all(7) })).toBe('input');
    // Bloqueada justo debajo: sigue bajando por la columna.
    expect(resultFocusTarget({ index: 0, key: 'ArrowDown', columns: 2, enabled: [true, true, false, true, true] })).toBe(4);
  });
  it('↓ en una fila incompleta va a la última; en la última fila no se mueve', () => {
    expect(resultFocusTarget({ index: 2, key: 'ArrowDown', columns: 3, enabled: all(5) })).toBe(4);
    expect(resultFocusTarget({ index: 4, key: 'ArrowDown', columns: 3, enabled: all(5) })).toBeNull();
  });
  it('Inicio, Fin y Escape', () => {
    expect(resultFocusTarget({ index: 3, key: 'Home', columns: 3, enabled: [false, true, true, true] })).toBe(1);
    expect(resultFocusTarget({ index: 1, key: 'End', columns: 3, enabled: [true, true, true, false] })).toBe(2);
    expect(resultFocusTarget({ index: 1, key: 'Escape', columns: 3, enabled: all(3) })).toBe('input');
    expect(resultFocusTarget({ index: 1, key: 'a', columns: 3, enabled: all(3) })).toBeNull();
  });
});
