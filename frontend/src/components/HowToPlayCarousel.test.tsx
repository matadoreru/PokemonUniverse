import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HowToPlayCarousel } from './HowToPlayCarousel';

describe('HowToPlayCarousel', () => {
  it('presenta la guía como un carrusel accesible', () => {
    const markup = renderToStaticMarkup(createElement(HowToPlayCarousel));
    expect(markup).toContain('Cómo jugar');
    expect(markup).toContain('Crea una sala o entra con un código');
    expect(markup).toContain('Consejo anterior');
    expect(markup).toContain('Ver consejo 4');
    expect(markup).toContain('Siguiente');
  });
});
