import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Confetti, confettiPieces } from './Confetti';

describe('Confetti', () => {
  it('papelitos deterministas por semilla, dentro de la pantalla', () => {
    expect(confettiPieces(20, 7)).toEqual(confettiPieces(20, 7));
    expect(confettiPieces(20, 7)).not.toEqual(confettiPieces(20, 8));
    for (const piece of confettiPieces(60, 3)) {
      expect(piece.x).toBeGreaterThanOrEqual(0);
      expect(piece.x).toBeLessThanOrEqual(100);
      expect(piece.duration).toBeGreaterThan(0);
    }
    expect(confettiPieces(0)).toEqual([]);
  });

  it('capa decorativa: oculta a los lectores y con un papelito por pieza', () => {
    const html = renderToStaticMarkup(createElement(Confetti, { count: 12 }));
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<i /g)).toHaveLength(12);
    // Solo transform/opacity animan: la posición y el color van en línea, el desvío y el giro en variables.
    expect(html).toContain('--drift:');
    expect(html).toContain('--spin:');
  });
});
