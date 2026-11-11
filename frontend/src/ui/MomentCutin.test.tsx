import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MomentCutin, momentVisible } from './MomentCutin';

describe('MomentCutin', () => {
  it('no es región viva y se puede saltar (intercepta el puntero)', () => {
    const html = renderToStaticMarkup(createElement(MomentCutin, { tone: 'yellow', title: '¡BINGO!', reducedMotion: false }));
    expect(html).toContain('¡BINGO!');
    expect(html).not.toMatch(/role="status"|aria-live/);
    expect(html).toMatch(/class="[^"]*skippable/);
  });

  it('sin `skippable` no intercepta el puntero', () => {
    const html = renderToStaticMarkup(createElement(MomentCutin, { tone: 'yellow', title: 'Hola', skippable: false, reducedMotion: false }));
    expect(html).not.toMatch(/skippable/);
  });

  it('el confeti sale solo si se pide y nunca con reducción de movimiento', () => {
    const plain = renderToStaticMarkup(createElement(MomentCutin, { tone: 'ok', title: 'Hola', reducedMotion: false }));
    expect(plain).not.toContain('data-testid="confetti"');
    const party = renderToStaticMarkup(createElement(MomentCutin, { tone: 'ok', title: 'Hola', confetti: true, reducedMotion: false }));
    expect(party).toContain('data-testid="confetti"');
    const reduced = renderToStaticMarkup(createElement(MomentCutin, { tone: 'ok', title: 'Hola', confetti: true, reducedMotion: true }));
    expect(reduced).not.toContain('data-testid="confetti"');
    expect(reduced).toContain('Hola');
  });

  it('saltado se oculta hasta que llega otro anuncio', () => {
    expect(momentVisible(null, 'yellow|A')).toBe(true);
    expect(momentVisible('yellow|A', 'yellow|A')).toBe(false);
    expect(momentVisible('yellow|A', 'yellow|B')).toBe(true);
  });
});
