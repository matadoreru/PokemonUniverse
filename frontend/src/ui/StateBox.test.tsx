import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StateBox } from './StateBox';

describe('StateBox', () => {
  it('error es una alerta con su acción', () => {
    const html = renderToStaticMarkup(createElement(StateBox, { kind: 'error', title: 'Fallo', action: { label: 'Reintentar', onClick: () => {} } }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Reintentar');
    expect(html).toContain('yellow');
  });

  it('vacío y carga no son alertas', () => {
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'empty', title: 'Vacío' }))).not.toContain('role="alert"');
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'loading', title: 'Cargando' }))).not.toContain('role="alert"');
  });

  it('carga lleva el esqueleto con aria-busy', () => {
    const html = renderToStaticMarkup(createElement(StateBox, { kind: 'loading', title: 'Cargando' }));
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/<i /g)).toHaveLength(3);
  });

  it('con live={false} el vacío no es región viva (la pantalla ya tiene la suya); el error sigue siendo alerta', () => {
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'empty', title: 'Vacío' }))).toContain('role="status"');
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'empty', title: 'Vacío', live: false }))).not.toContain('role=');
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'error', title: 'Fallo', live: false }))).toContain('role="alert"');
    const quiet = renderToStaticMarkup(createElement(StateBox, { kind: 'loading', title: 'Cargando', live: false }));
    expect(quiet).not.toContain('aria-label');
    expect(quiet).toContain('<span class="sr-only">Cargando</span>');
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'loading', title: 'Cargando' }))).toContain('aria-label="Cargando"');
  });

  it('compacto no lleva icono', () => {
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'empty', title: 'Vacío', compact: true }))).not.toContain('<svg');
    expect(renderToStaticMarkup(createElement(StateBox, { kind: 'empty', title: 'Vacío' }))).toContain('<svg');
  });
});
