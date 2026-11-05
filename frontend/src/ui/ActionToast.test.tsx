import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionToast } from './ActionToast';

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

  it('es alert, o status con quiet', () => {
    expect(render()).toContain('role="alert"');
    const quiet = render({ quiet: true });
    expect(quiet).toContain('role="status"');
    expect(quiet).not.toContain('role="alert"');
  });

  it('no pinta nada si expiresAt ya pasó', () => {
    expect(render({ expiresAt: Date.now() - 1000 })).toBe('');
    expect(render({ expiresAt: Date.now() + 60_000 })).toContain('Unirme');
  });
});
