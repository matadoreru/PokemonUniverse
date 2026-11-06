import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMediaQuery, subscribeMediaQuery, useMediaQuery } from './useMediaQuery';

const QUERY = '(min-width: 1024px)';

function fakeWindow(initial: boolean) {
  const listeners = new Set<() => void>();
  const state = { matches: initial };
  vi.stubGlobal('window', {
    matchMedia: (media: string) => ({
      get matches() { return state.matches; }, media,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }),
  });
  return { state, listeners };
}

function Probe() { return createElement('span', null, String(useMediaQuery(QUERY))); }

afterEach(() => { vi.unstubAllGlobals(); });

describe('useMediaQuery', () => {
  it('is false without matchMedia', () => {
    expect(readMediaQuery(QUERY)).toBe(false);
    expect(subscribeMediaQuery(QUERY, () => undefined)()).toBeUndefined();
    expect(renderToStaticMarkup(createElement(Probe))).toContain('false');
  });

  it('follows the change event and unsubscribes', () => {
    const { state, listeners } = fakeWindow(true);
    expect(readMediaQuery(QUERY)).toBe(true);
    const notify = vi.fn();
    const stop = subscribeMediaQuery(QUERY, notify);
    expect(listeners.size).toBe(1);
    state.matches = false;
    for (const listener of listeners) listener();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(readMediaQuery(QUERY)).toBe(false);
    stop();
    expect(listeners.size).toBe(0);
  });
});
