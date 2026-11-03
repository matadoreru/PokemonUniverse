import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setUiSoundSink } from '../audio/uiSound';
import { Pill, pillClickHandler } from './Pill';

afterEach(() => setUiSoundSink(null));

describe('Pill', () => {
  it('usa el tono y el tamaño', () => {
    const classes = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ').map((c) => c.replace(/^_/, '').replace(/_[0-9a-f]+$/, ''));
    const main = classes(renderToStaticMarkup(createElement(Pill, { variant: 'yellow', size: 'main' }, 'Jugar')));
    expect(main).toEqual(expect.arrayContaining(['pill', 'yellow', 'main']));
    const base = classes(renderToStaticMarkup(createElement(Pill, null, 'Ok')));
    expect(base).toContain('pill');
    expect(base).not.toContain('yellow');
    expect(base).not.toContain('main');
  });

  it('la etiqueta de los tonos de tinta blanca lleva el contorno .ol', () => {
    const label = (html: string) => /<span class="([^"]*)">[^<]*<\/span>/.exec(html)?.[1]?.split(' ') ?? [];
    for (const variant of ['blue', 'danger', 'ghost'] as const) expect(label(renderToStaticMarkup(createElement(Pill, { variant }, 'Ok'))), variant).toContain('ol');
    expect(label(renderToStaticMarkup(createElement(Pill, { variant: 'red', size: 'main' }, 'Ok')))).toContain('ol');
    for (const variant of ['yellow', 'cream'] as const) expect(label(renderToStaticMarkup(createElement(Pill, { variant }, 'Ok'))), variant).not.toContain('ol');
  });

  it('la roja solo existe en tamaño principal (regla de tipos)', () => {
    // @ts-expect-error roja sin tamaño main
    createElement(Pill, { variant: 'red' }, 'x');
    // @ts-expect-error roja pequeña
    createElement(Pill, { variant: 'red', size: 'small' }, 'x');
    // @ts-expect-error main no admite azul
    createElement(Pill, { variant: 'blue', size: 'main' }, 'x');
    createElement(Pill, { variant: 'red', size: 'main' }, 'x');
    createElement(Pill, { variant: 'yellow', size: 'main' }, 'x');
    expect(true).toBe(true);
  });

  it('deshabilitada y cargando no responden', () => {
    const sink = vi.fn();
    setUiSoundSink(sink);
    const onClick = vi.fn();
    expect(pillClickHandler({ disabled: true, onClick })).toBeUndefined();
    expect(pillClickHandler({ loading: true, onClick })).toBeUndefined();
    const ghost = pillClickHandler({ variant: 'ghost', onClick });
    ghost?.({} as never);
    expect(sink).toHaveBeenLastCalledWith('tap');
    const yellow = pillClickHandler({ variant: 'yellow', onClick });
    yellow?.({} as never);
    expect(sink).toHaveBeenLastCalledWith('confirm');
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it('al cargar anuncia aria-busy y tabindex=-1', () => {
    const html = renderToStaticMarkup(createElement(Pill, { loading: true }, 'Enviar'));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('disabled');
  });
});
