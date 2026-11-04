import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Bar, barRatio } from './Bar';

describe('barRatio', () => {
  it('recorta a [0, 1] y tolera max no positivo', () => {
    expect(barRatio(5, 10)).toBe(0.5);
    expect(barRatio(0, 10)).toBe(0);
    expect(barRatio(-3, 10)).toBe(0);
    expect(barRatio(30, 10)).toBe(1);
    expect(barRatio(5, 0)).toBe(0);
    expect(barRatio(5, -2)).toBe(0);
  });
});

describe('Bar', () => {
  it('es un medidor accesible', () => {
    const html = renderToStaticMarkup(createElement(Bar, { value: 3, max: 10, label: 'Vida' }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="10"');
    expect(html).toContain('aria-label="Vida"');
    expect(html).toContain('--ratio:0.3');
  });
  it('recorta aria-valuenow a [0, max]', () => {
    expect(renderToStaticMarkup(createElement(Bar, { value: 30, max: 10, label: 'x' }))).toContain('aria-valuenow="10"');
    expect(renderToStaticMarkup(createElement(Bar, { value: -3, max: 10, label: 'x' }))).toContain('aria-valuenow="0"');
  });
  it('crece al montarse y engorda con size="lg" solo si se pide', () => {
    const plain = renderToStaticMarkup(createElement(Bar, { value: 3, max: 10, label: 'x' }));
    const grown = renderToStaticMarkup(createElement(Bar, { value: 3, max: 10, label: 'x', grow: true, size: 'lg' }));
    expect(plain).not.toMatch(/grow|lg/);
    expect(grown).toMatch(/class="[^"]*grow/);
    expect(grown).toMatch(/class="[^"]*lg/);
  });
});
