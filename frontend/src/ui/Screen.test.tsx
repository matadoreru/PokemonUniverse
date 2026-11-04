import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Screen, ScreenHeader } from './Screen';

/** Clases sin el hash de CSS Modules. */
const classesOf = (html: string, index = 0) =>
  ([...html.matchAll(/class="([^"]*)"/g)][index]?.[1] ?? '').split(' ').map((c) => c.replace(/^_/, '').replace(/_[0-9a-z]+_?\d*$/i, ''));

describe('Screen', () => {
  it('por defecto: ancho completo, sin pie y sin relleno de alto', () => {
    const html = renderToStaticMarkup(<Screen><p>Hola</p></Screen>);
    const root = classesOf(html);
    expect(root).toContain('screen');
    expect(root).toContain('wide');
    expect(root).toContain('bare');
    expect(root).not.toContain('fill');
    expect(classesOf(html, 1)).toContain('content');
    expect(html).toContain('<p>Hola</p>');
    expect(html).not.toContain('style=');
  });

  it('con pie, ancho de tarjeta y relleno', () => {
    const html = renderToStaticMarkup(
      <Screen width="narrow" fill footer={<small>Legal</small>}><p>Hola</p></Screen>,
    );
    const root = classesOf(html);
    expect(root).toEqual(expect.arrayContaining(['screen', 'narrow', 'fill']));
    expect(root).not.toContain('bare');
    expect(classesOf(html, 2)).toContain('footer');
    expect(html.indexOf('Hola')).toBeLessThan(html.indexOf('Legal'));
  });
});

describe('ScreenHeader', () => {
  it('pinta un único h1 con su entradilla y la acción', () => {
    const html = renderToStaticMarkup(<ScreenHeader title="Novedades" subtitle="Qué ha cambiado" aside={<a href="/">Volver</a>} id="t" />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('id="t"');
    expect(html).toContain('Qué ha cambiado');
    expect(html).toContain('Volver');
    expect(classesOf(html)).not.toContain('headerCenter');
  });

  it('sin entradilla no pinta el párrafo; centrada en móvil si se pide', () => {
    const html = renderToStaticMarkup(<ScreenHeader title="Perfil" centerOnMobile />);
    expect(html).not.toContain('<p');
    expect(classesOf(html)).toContain('headerCenter');
  });
});
