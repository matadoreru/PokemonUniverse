import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameLoadingFallback, RouteLoadingFallback } from './LoadingFallback';

describe('lazy-loading fallbacks', () => {
  it('announces route loading with the StateBox skeleton inside a Panel', () => {
    const markup = renderToStaticMarkup(createElement(RouteLoadingFallback));
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Cargando pantalla…"');
    expect(markup).toMatch(/<section class="[^"]*panel/);
    expect(markup).not.toContain('page-shell');
  });

  it('provides a compact accessible fallback for lazy game configuration', () => {
    const markup = renderToStaticMarkup(createElement(GameLoadingFallback, { compact: true }));
    expect(markup).toContain('Cargando minijuego…');
    expect(markup).not.toContain('page-shell');
  });
});
