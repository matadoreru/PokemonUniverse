import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionToast, ActionToastStack } from './ActionToast';

const base = { title: 'Ash te invita', primary: { label: 'Unirme', onClick: () => undefined }, secondary: { label: 'Ahora no', onClick: () => undefined } };
const render = (extra: object = {}) => renderToStaticMarkup(createElement(ActionToast, { ...base, ...extra }));

describe('ActionToast', () => {
  it('pinta el título, el texto y las dos acciones', () => {
    const html = render({ text: 'Sala ABCD' });
    expect(html).toContain('Ash te invita');
    expect(html).toContain('Sala ABCD');
    expect(html).toContain('Unirme');
    expect(html).toContain('Ahora no');
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it('es alert; con quiet no es región viva (la pantalla de juego tiene la única)', () => {
    expect(render()).toContain('role="alert"');
    const quiet = render({ quiet: true });
    expect(quiet).not.toContain('role=');
    expect(quiet).not.toContain('aria-live');
    expect(quiet).toContain('Ash te invita');
  });

  it('con live="status" es región viva educada (avisos fuera de partida)', () => {
    const polite = render({ live: 'status' });
    expect(polite).toContain('role="status"');
    expect(polite).toContain('aria-live="polite"');
    expect(polite).not.toContain('role="alert"');
  });

  it('no pinta nada si expiresAt ya pasó', () => {
    expect(render({ expiresAt: Date.now() - 1000 })).toBe('');
    expect(render({ expiresAt: Date.now() + 60_000 })).toContain('Unirme');
  });

  it('la pila es un popover manual con nombre, y sin avisos no pinta nada', () => {
    const stack = renderToStaticMarkup(createElement(ActionToastStack, { label: 'Invitaciones' }, createElement(ActionToast, { ...base, key: 'a' })));
    expect(stack).toContain('popover="manual"');
    expect(stack).toContain('aria-label="Invitaciones"');
    expect(stack).toContain('Ash te invita');
    expect(renderToStaticMarkup(createElement(ActionToastStack, { label: 'Invitaciones' }))).toBe('');
    expect(renderToStaticMarkup(createElement(ActionToastStack, { label: 'Invitaciones' }, false))).toBe('');
  });
});
