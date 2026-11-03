import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { typeColors } from '../styles/tokens';
import type { PokemonType } from '../styles/tokens';
import { TypeBadge } from './Badge';

const classes = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ').map((c) => c.replace(/^_/, '').replace(/_[0-9a-f]+$/, ''));

describe('TypeBadge', () => {
  it.each(Object.keys(typeColors) as PokemonType[])('%s usa su token y su tinta', (t) => {
    const html = renderToStaticMarkup(createElement(TypeBadge, { type: t, label: t }));
    expect(html).toContain(`--type-bg:var(--type-${t})`);
    expect(html).toContain(`--type-fg:var(--type-${t}-ink)`);
  });

  it('solo los tipos de tinta blanca llevan anillo', () => {
    const ring = (t: PokemonType) => classes(renderToStaticMarkup(createElement(TypeBadge, { type: t, label: t }))).includes('ring');
    expect(ring('ghost')).toBe(true);
    expect(ring('fighting')).toBe(true);
    expect(ring('fire')).toBe(false);
  });
});
