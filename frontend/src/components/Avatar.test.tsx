import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

const ALIAS = /\b(?:bg|from|to|text|border|ring)-(?:aqua|electric|berry|leaf|night|ink|surface|surface-raised)\b/;

describe('Avatar', () => {
  it('sin imagen: inicial con contorno, fondo de tokens y sin colores alias', () => {
    const html = renderToStaticMarkup(createElement(Avatar, { name: 'eru', size: 'md' }));
    expect(html).toContain('aria-label="Avatar de eru"');
    expect(html).toMatch(/<span class="[^"]*\bol\b[^"]*" aria-hidden="true">E<\/span>/);
    expect(html).not.toMatch(ALIAS);
  });
  it('nombre vacío: interrogación', () => {
    expect(renderToStaticMarkup(createElement(Avatar, { name: '  ' }))).toContain('>?</span>');
  });
  it('conserva los seis tamaños y la clase de quien llama', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;
    const classes = sizes.map((size) => renderToStaticMarkup(createElement(Avatar, { name: 'A', size, className: 'extra' })).match(/^<span class="([^"]+)"/)?.[1] ?? '');
    expect(new Set(classes).size).toBe(sizes.length);
    for (const cls of classes) expect(cls).toContain('extra');
  });
  it('presencia con texto (title) y sin colores alias', () => {
    for (const presence of ['CONNECTED', 'TEMPORARILY_DISCONNECTED', 'LEFT'] as const) {
      const html = renderToStaticMarkup(createElement(Avatar, { name: 'Ana', presence }));
      expect(html).toMatch(/title="(Conectado|Reconectando|Desconectado)"/);
      expect(html).not.toMatch(ALIAS);
      expect(html).not.toContain('animate-pulse');
    }
  });
  it('nivel: insignia con la cifra, título y nivel en la etiqueta accesible', () => {
    const html = renderToStaticMarkup(createElement(Avatar, { name: 'Ana', level: 7, presence: 'CONNECTED' }));
    expect(html).toContain('aria-label="Avatar de Ana, nivel 7"');
    expect(html).toMatch(/<span class="[^"]+" title="Nivel 7" aria-hidden="true" data-level="7">7<\/span>/);
    expect(html).toContain('title="Conectado"');
  });
  it('sin nivel (invitado, null o valor inválido): sin insignia', () => {
    for (const level of [undefined, null, 0, -2, 1.5, Number.NaN]) {
      const html = renderToStaticMarkup(createElement(Avatar, { name: 'Ana', level }));
      expect(html).toContain('aria-label="Avatar de Ana"');
      expect(html).not.toContain('data-level');
    }
  });
  it('avatar subido: imagen versionada', () => {
    const html = renderToStaticMarkup(createElement(Avatar, { name: 'Ana', avatar: { type: 'CUSTOM', value: '0123456789abcdef0123456789abcdef0123.webp', version: 3 } }));
    expect(html).toContain('<img');
    expect(html).toContain('/api/auth/avatars/0123456789abcdef0123456789abcdef0123.webp?v=3');
  });
});
