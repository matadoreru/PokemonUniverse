import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gameHowToPlay } from '../games/how-to-play';
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

  it('muestra los pasos de un juego con puntos de 44 px y sin transición de anchura', () => {
    const markup = renderToStaticMarkup(createElement(HowToPlayCarousel, { slides: gameHowToPlay['type-duel']!, heading: 'Type Duel', kicker: 'Cómo se juega', idPrefix: 'how-to-type-duel', itemLabel: 'paso' }));
    expect(markup).toContain('Paso 3 de 3');
    expect(markup).toContain('Cada uno elige un tipo en secreto');
    expect(markup).toContain('min-h-11 min-w-11');
    expect(markup).toContain('Ver paso 3');
    expect(markup).toContain('id="how-to-type-duel-title"');
    expect(markup).not.toContain('transition-[width');
    // Solo se ve el paso activo: las otras dos llevan `hidden` y la clase `hidden` (una clase `flex` anularía el atributo).
    expect(markup.match(/hidden="" class="hidden /g)).toHaveLength(2);
  });
});
