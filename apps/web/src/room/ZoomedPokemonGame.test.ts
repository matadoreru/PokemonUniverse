import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ZoomViewport } from './ZoomedPokemonGame';

describe('Zoomed Pokémon image rendering', () => {
  it('lets the browser smooth enlarged sprites instead of forcing pixelated scaling', () => {
    const markup = renderToStaticMarkup(createElement(ZoomViewport, {
      source: '/sprite.png', sourceType: 'SPRITE', zoom: 2.5, alt: 'Detalle ampliado',
    }));
    expect(markup).toContain('[image-rendering:auto]');
    expect(markup).not.toContain('[image-rendering:pixelated]');
  });
});
