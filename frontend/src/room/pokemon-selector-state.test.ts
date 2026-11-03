import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonSelector } from './PokemonSelector';
import { selectorView } from './pokemon-selector-state';

const base = { loading: false, loadError: '', query: '', resultCount: 0 };
const selector = (props: { loading?: boolean; loadError?: string; onRetry?(): void }) => renderToStaticMarkup(createElement(PokemonSelector, {
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
  it('pinta seis esqueletos ocupados mientras carga', () => {
    const markup = selector({ loading: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/skeleton/g)).toHaveLength(6);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Cargando Pokémon…');
  });
  it('pinta el error con role="alert" y la acción de reintentar', () => {
    const markup = selector({ loadError: 'No se pudo cargar el buscador.', onRetry: () => undefined });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('status-error');
    expect(markup).toContain('No se pudo cargar el buscador.');
    expect(markup).toContain('Reintentar');
  });
  it('sin las props nuevas se pinta como antes y sin autoFocus en el HTML', () => {
    const markup = selector({});
    expect(markup).not.toContain('skeleton');
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain('autofocus');
  });
});
