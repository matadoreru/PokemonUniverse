import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Drawer } from './Drawer';

const render = (open: boolean) => renderToStaticMarkup(createElement(Drawer, { open, title: 'Amigos', onClose: () => undefined }, createElement('p', null, 'Contenido')));

describe('Drawer', () => {
  it('abierto muestra el título, el contenido y un diálogo accesible', () => {
    const html = render(true);
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="([^"]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Amigos');
    expect(html).toContain('Contenido');
  });

  it('el botón de cerrar tiene nombre accesible', () => {
    expect(render(true)).toContain('aria-label="Cerrar"');
  });

  it('cerrado no pinta el contenido', () => {
    const html = render(false);
    expect(html).not.toContain('Contenido');
    expect(html).not.toContain('Amigos');
  });
});
