import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { typeColors } from '../styles/tokens';
import type { PokemonType } from '../styles/tokens';
import { TypeBadge, TypeOption } from './Badge';
import type { TypeOptionProps } from './Badge';

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

describe('TypeBadge lg', () => {
  it('lleva la clase grande y deja cambiar la letra con --type-badge-fs', () => {
    const html = renderToStaticMarkup(createElement(TypeBadge, { type: 'fire', label: 'Fuego', size: 'lg' }));
    expect(classes(html)).toContain('lg');
    expect(html).toContain('>Fuego<');
  });
});

describe('TypeOption', () => {
  const render = (props: Partial<TypeOptionProps> = {}) => renderToStaticMarkup(createElement(TypeOption, { type: 'water', label: 'Agua', pressed: false, ...props }));
  it('es un conmutador con su tipo y su nombre escrito', () => {
    const html = render({ 'aria-label': 'Elegir tipo Agua' });
    expect(html).toMatch(/^<button [^>]*type="button"/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-type="water"');
    expect(html).toContain('aria-label="Elegir tipo Agua"');
    expect(html).toContain('>Agua<');
    expect(html).not.toContain('<svg');
  });
  it('elegido lleva aria-pressed y ✓ además del color', () => {
    const html = render({ pressed: true });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('<svg');
    expect(classes(html)).toContain('pressed');
  });
  it('cargando no se puede volver a pulsar', () => {
    const html = render({ pressed: true, loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
  });
  it('los tipos de tinta blanca llevan el anillo blanco por dentro', () => {
    expect(classes(render({ type: 'ghost', label: 'Fantasma' }))).toContain('optionWhite');
    expect(classes(render())).not.toContain('optionWhite');
  });
});
