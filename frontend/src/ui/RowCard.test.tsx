import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';
import { Row, RowLink } from './Row';

describe('Row', () => {
  it('desconectado dice «Sin conexión» y el nombre lleva title', () => {
    const html = renderToStaticMarkup(createElement(Row, { name: 'Ash', disconnected: true, color: '#ff0000' }));
    expect(html).toContain('Sin conexión');
    expect(html).toContain('title="Ash"');
    expect(html).toContain('--player:#ff0000');
  });
});

describe('RowLink', () => {
  const link = (current?: boolean) =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RowLink, { to: '/changelog?v=0.9.0', name: 'v0.9.0', ...(current ? { current } : {}) })));
  it('es un enlace con la franja dentro', () => {
    const html = link();
    expect(html).toContain('<a ');
    expect(html).toContain('href="/changelog?v=0.9.0"');
    expect(html).not.toContain('aria-current');
  });
  it('la abierta lleva aria-current', () => {
    expect(link(true)).toContain('aria-current="true"');
  });
});

describe('Card', () => {
  it('con foto la imagen es decorativa: el nombre ya va escrito', () => {
    const html = renderToStaticMarkup(createElement(Card, { name: 'Aqua', sprite: '/a.webp', photo: true, onSelect: () => undefined }));
    expect(html).toContain('alt=""');
    expect(renderToStaticMarkup(createElement(Card, { name: 'Pikachu', sprite: '/p.png' }))).toContain('alt="Pikachu"');
  });
  it('seleccionable es un botón con aria-pressed', () => {
    const html = renderToStaticMarkup(createElement(Card, { name: 'Pikachu', state: 'selected', onSelect: () => undefined }));
    expect(html).toContain('<button');
    expect(html).toContain('aria-pressed="true"');
  });
  it('de acción: botón sin aria-pressed, deshabilitable, pequeña y con sprite decorativo', () => {
    const html = renderToStaticMarkup(createElement(Card, { name: 'Pichu', sprite: '/p.png', size: 'sm', action: true, decorativeSprite: true, disabled: true, onSelect: () => undefined }));
    expect(html).toContain('<button');
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('disabled=""');
    expect(html).toContain('alt=""');
  });
  it('con arte (icono de minijuego) lo pinta oculto a los lectores en lugar del «?»', () => {
    const html = renderToStaticMarkup(createElement(Card, { name: 'Type Duel', art: '⚔️', size: 'sm', onSelect: () => undefined }));
    expect(html).toContain('aria-hidden="true">⚔️</span>');
    expect(html).not.toContain('>?<');
  });
  it('correcta muestra texto además del color', () => {
    expect(renderToStaticMarkup(createElement(Card, { name: 'Mew', state: 'correct' }))).toContain('Correcta');
  });
});
