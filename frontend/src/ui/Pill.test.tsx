import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setUiSoundSink } from '../audio/uiSound';
import { Pill, pillClickHandler } from './Pill';

afterEach(() => setUiSoundSink(null));

describe('Pill', () => {
  it('usa el tono y el tamaño', () => {
    const html = renderToStaticMarkup(createElement(Pill, { variant: 'yellow', size: 'main' }, 'Jugar'));
    expect(html).toContain('yellow');
    expect(html).toContain('main');
    expect(html).toContain('Jugar');
    const base = renderToStaticMarkup(createElement(Pill, null, 'Ok'));
    expect(base).toContain('blue');
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
