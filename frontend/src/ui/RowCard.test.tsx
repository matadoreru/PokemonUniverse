import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';
import { Row } from './Row';

describe('Row', () => {
  it('desconectado dice «Sin conexión» y el nombre lleva title', () => {
    const html = renderToStaticMarkup(createElement(Row, { name: 'Ash', disconnected: true, color: '#ff0000' }));
    expect(html).toContain('Sin conexión');
    expect(html).toContain('title="Ash"');
    expect(html).toContain('--player:#ff0000');
  });
});

describe('Card', () => {
  it('seleccionable es un botón con aria-pressed', () => {
    const html = renderToStaticMarkup(createElement(Card, { name: 'Pikachu', state: 'selected', onSelect: () => undefined }));
    expect(html).toContain('<button');
    expect(html).toContain('aria-pressed="true"');
  });
  it('correcta muestra texto además del color', () => {
    expect(renderToStaticMarkup(createElement(Card, { name: 'Mew', state: 'correct' }))).toContain('Correcta');
  });
});
