import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfigRange, rangeDraftReducer } from './ConfigRange';

describe('range draft state', () => {
  it('updates locally without waiting for a remote value', () => {
    const next = rangeDraftReducer({ value: 20, editing: true }, { type: 'LOCAL_VALUE', value: 35 });
    expect(next).toEqual({ value: 35, editing: true });
  });

  it('does not let a stale server broadcast move an active slider backwards', () => {
    const next = rangeDraftReducer({ value: 35, editing: true }, { type: 'REMOTE_VALUE', value: 20 });
    expect(next.value).toBe(35);
  });

  it('accepts remote values after editing finishes', () => {
    const idle = rangeDraftReducer({ value: 35, editing: true }, { type: 'END_EDITING' });
    expect(rangeDraftReducer(idle, { type: 'REMOTE_VALUE', value: 40 }).value).toBe(40);
  });

  it('remains readable while semantically disabled', () => {
    const markup = renderToStaticMarkup(createElement(ConfigRange, {
      label: 'Tiempo por ronda', value: 20, min: 10, max: 60, disabled: true,
      formatValue: (value) => `${value} segundos`, onCommit: async () => undefined,
    }));
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('value="20"');
    expect(markup).toContain('20 segundos');
  });
});

describe('ConfigRange con el deslizador del catálogo', () => {
  it('es un rango con su etiqueta, el valor con formato y la ayuda, sin las clases antiguas', () => {
    const markup = renderToStaticMarkup(createElement(ConfigRange, {
      label: 'Número de rondas', value: 5, min: 1, max: 10, hint: 'Más rondas, partida más larga.',
      formatValue: (value) => `${value} rondas`, onCommit: async () => undefined,
    }));
    expect(markup).toContain('type="range"');
    expect(markup).toMatch(/<label for="([^"]+)"[^>]*>Número de rondas<\/label>/);
    expect(markup).toContain('aria-valuetext="5 rondas"');
    expect(markup).toContain('Más rondas, partida más larga.');
    expect(markup).not.toContain('config-range');
    expect(markup).not.toContain('disabled=""');
  });
});
