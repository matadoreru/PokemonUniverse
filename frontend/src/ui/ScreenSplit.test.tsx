import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScreenSplit } from './ScreenSplit';

const root = (html: string) => (/^<div class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ').map((c) => c.replace(/^_|_[0-9a-f]+$/g, ''));

describe('ScreenSplit', () => {
  it('sin opciones: pantalla doble sin lateral', () => {
    const html = renderToStaticMarkup(<ScreenSplit top="A" bottom="B" />);
    expect(root(html)).toEqual(['split']);
    expect(html).not.toContain('<aside');
  });

  it('con lateral primero y relleno (lobby)', () => {
    const html = renderToStaticMarkup(<ScreenSplit top="A" bottom="B" side="S" sideFirst fill className="x" />);
    expect(root(html)).toEqual(expect.arrayContaining(['split', 'withSide', 'sideFirst', 'fill', 'x']));
    expect(html).toContain('<aside');
  });

  it('`sideFirst` sin lateral no hace nada', () => {
    expect(root(renderToStaticMarkup(<ScreenSplit top="A" bottom="B" sideFirst />))).not.toContain('sideFirst');
  });
});
