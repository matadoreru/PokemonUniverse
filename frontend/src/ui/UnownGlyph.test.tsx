import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnownGlyph } from './UnownGlyph';
import type { UnownGlyphProps } from './UnownGlyph';

const render = (props: UnownGlyphProps) => renderToStaticMarkup(createElement(UnownGlyph, props));
/** El trazo propio de cada glifo (el ojo es igual en todos y va en `<circle>`). */
const strokeOf = (html: string) => html.match(/<path[^>]* d="([^"]+)"/)?.[1];

describe('UnownGlyph', () => {
  it('losVeintiseisDibujanUnSvgDistinto', () => {
    const strokes = Array.from({ length: 26 }, (_, glyph) => {
      const html = render({ glyph });
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 48 48"');
      expect(html).toContain('role="img"');
      expect(html).toContain('currentColor');
      return strokeOf(html);
    });
    expect(strokes.every(Boolean)).toBe(true);
    expect(new Set(strokes).size).toBe(26);
  });

  it('fueraDeRangoNoDibujaNada', () => {
    expect(render({ glyph: 26 })).toBe('');
    expect(render({ glyph: -1 })).toBe('');
    expect(render({ glyph: 1.5 })).toBe('');
  });

  it('sinLetraEsUnGlifoOculto', () => {
    const html = render({ glyph: 3 });
    expect(html).toContain('aria-label="glifo oculto"');
    expect(html).not.toMatch(/>[A-Z]</);
  });

  it('conLetraLaMuestraYLaNombra', () => {
    const html = render({ glyph: 3, letter: 'P' });
    expect(html).toContain('aria-label="letra P"');
    expect(html).toMatch(/>P</);
  });

  it('conLetraEnSuLugarPintaLaLetraSinGlifo', () => {
    const html = render({ glyph: 3, letter: 'P', reveal: 'replace', size: 'lg' });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="letra P"');
    expect(html).toContain('data-reveal="replace"');
    expect(html).toMatch(/>P</);
    expect(html).not.toContain('<svg');
  });

  it('enSuLugarPeroSinLetraSigueSiendoUnGlifoOculto', () => {
    const html = render({ glyph: 3, reveal: 'replace' });
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="glifo oculto"');
    expect(html).not.toContain('data-reveal');
  });

  it('aceptaTamañoYClase', () => {
    const html = render({ glyph: 0, size: 'lg', className: 'extra' });
    expect(html).toContain('extra');
    expect(html).toContain('data-size="lg"');
  });
});
