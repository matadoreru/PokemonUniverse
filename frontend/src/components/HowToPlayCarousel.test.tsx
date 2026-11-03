import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gameHowToPlay } from '../games/how-to-play';
import { carouselStep, HowToPlayCarousel } from './HowToPlayCarousel';

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

  it('dentro de un diálogo no pinta cabecera, nombra la región y da el foco inicial a «Siguiente»', () => {
    const props = { slides: gameHowToPlay['type-duel']!, heading: 'Type Duel', idPrefix: 'how-to-type-duel', itemLabel: 'paso', loop: false };
    const inDialog = renderToStaticMarkup(createElement(HowToPlayCarousel, { ...props, inDialog: true }));
    expect(inDialog).not.toContain('<h2');
    expect(inDialog).toContain('aria-label="Type Duel"');
    expect(inDialog).not.toContain('aria-labelledby="how-to-type-duel-title"');
    expect(inDialog).toMatch(/data-carousel-next="" data-autofocus=""/);
    const plain = renderToStaticMarkup(createElement(HowToPlayCarousel, props));
    expect(plain).toContain('<h2 id="how-to-type-duel-title"');
    expect(plain).toContain('aria-labelledby="how-to-type-duel-title"');
    expect(plain).not.toContain('data-autofocus');
  });

    it('sin bucle no pasa del último paso ni del primero; con bucle da la vuelta', () => {
    expect(carouselStep(2, 3, false, 1)).toBe(2);
    expect(carouselStep(0, 3, false, -1)).toBe(0);
    expect(carouselStep(1, 3, false, 1)).toBe(2);
    expect(carouselStep(3, 4, true, 1)).toBe(0);
    expect(carouselStep(0, 4, true, -1)).toBe(3);
    // Un índice fuera de rango (las diapositivas cambiaron) se ajusta al último.
    expect(carouselStep(5, 3, false, 0)).toBe(2);
  });

  it('los pasos de un juego no dan la vuelta: «Anterior» inactivo en el primero y puntos inactivos visibles', () => {
    const markup = renderToStaticMarkup(createElement(HowToPlayCarousel, { slides: gameHowToPlay['type-duel']!, loop: false, lastAction: createElement('button', { type: 'button' }, 'Entendido') }));
    expect(markup).toMatch(/aria-disabled="true"[^>]*aria-label="Consejo anterior"|aria-label="Consejo anterior"[^>]*aria-disabled="true"/);
    expect(markup).toContain('bg-ink/40');
    expect(markup).not.toContain('Entendido');
  });
});
