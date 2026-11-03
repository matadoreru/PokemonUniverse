import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameLoadingFallback, RouteLoadingFallback } from './LoadingFallback';

describe('lazy-loading fallbacks', () => {
  it('announces route loading while keeping decorative skeletons hidden', () => {
    const markup = renderToStaticMarkup(createElement(RouteLoadingFallback));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Cargando pantalla…');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('provides a compact accessible fallback for lazy game configuration', () => {
    const markup = renderToStaticMarkup(createElement(GameLoadingFallback, { compact: true }));
    expect(markup).toContain('Cargando minijuego…');
    expect(markup).not.toContain('page-shell');
  });
});
