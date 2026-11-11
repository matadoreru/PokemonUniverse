import { createElement, Suspense, type ComponentType } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { describe, expect, it, vi } from 'vitest';
import { failedLoadCount, retryableLazy, retryFailedLoads } from './retryable-lazy';

const Hello: ComponentType<{ name: string }> = ({ name }) => createElement('p', null, `Hola, ${name}`);

async function render(Component: ComponentType<{ name: string }>): Promise<string> {
  const { prelude } = await prerenderToNodeStream(createElement(Suspense, { fallback: 'cargando' }, createElement(Component, { name: 'Ash' })));
  let html = '';
  for await (const chunk of prelude) html += String(chunk);
  return html;
}

describe('retryableLazy', () => {
  it('shares one import between preload and render', async () => {
    const loader = vi.fn(() => Promise.resolve({ default: Hello }));
    const { Component, preload } = retryableLazy(loader);
    await preload();
    expect(await render(Component)).toContain('Hola, Ash');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('a failed import is attempted again after retryFailedLoads, and then renders', async () => {
    const loader = vi.fn<() => Promise<{ default: typeof Hello }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: Hello });
    const { Component, preload } = retryableLazy(loader);
    await expect(preload()).rejects.toThrow('Failed to fetch');
    expect(failedLoadCount()).toBe(1);
    retryFailedLoads();
    expect(failedLoadCount()).toBe(0);
    expect(await render(Component)).toContain('Hola, Ash');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
