import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EndSessionDialog } from './RoomPage';

describe('EndSessionDialog', () => {
  it('asks before ending the session: «Cancelar» first and focused, «Terminar sesión» in red', () => {
    const html = renderToStaticMarkup(createElement(EndSessionDialog, { open: true, onClose: () => undefined, onConfirm: () => undefined }));
    expect(html).toContain('¿Terminar la sesión?');
    expect(html).toContain('No se puede deshacer.');
    const cancel = html.indexOf('>Cancelar<');
    const end = html.indexOf('>Terminar sesión<');
    expect(cancel).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(cancel);
    expect(html).toMatch(/<button[^>]*data-autofocus=""[^>]*>(?:(?!<\/button>).)*Cancelar/);
  });

  it('paints nothing while closed', () => {
    expect(renderToStaticMarkup(createElement(EndSessionDialog, { open: false, onClose: () => undefined, onConfirm: () => undefined }))).not.toContain('Terminar sesión');
  });
});
