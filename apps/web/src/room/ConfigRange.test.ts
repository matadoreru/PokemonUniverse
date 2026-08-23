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
