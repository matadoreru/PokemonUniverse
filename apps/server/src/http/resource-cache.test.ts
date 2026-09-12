import { expect, it, vi } from 'vitest';
import { ResourceCache } from './resource-cache.js';

it('deduplicates concurrent loads, queues work and rejects excess pending requests', async () => {
  const cache = new ResourceCache<string>({ bytes: 10, entries: 2, concurrency: 1, pending: 2 }, (value) => value.length);
  let complete!: (value: string) => void;
  const first = cache.load('a', () => new Promise((resolve) => { complete = resolve; }));
  const duplicate = cache.load('a', async () => 'unexpected');
  const secondLoader = vi.fn(async () => 'b');
  const second = cache.load('b', secondLoader);
  await expect(cache.load('c', async () => 'c')).rejects.toMatchObject({ status: 503 });
  expect(first).toBe(duplicate);
  expect(secondLoader).not.toHaveBeenCalled();
  complete('a');
  await expect(first).resolves.toBe('a');
  await expect(second).resolves.toBe('b');
});

it('evicts by byte budget and retries a failed loader', async () => {
  const cache = new ResourceCache<string>({ bytes: 3, entries: 10, concurrency: 2, pending: 10 }, (value) => value.length);
  await cache.load('a', async () => 'aa');
  await cache.load('b', async () => 'bb');
  const reloaded = vi.fn(async () => 'a');
  await cache.load('a', reloaded);
  expect(reloaded).toHaveBeenCalledOnce();
  await expect(cache.load('error', async () => { throw new Error('source down'); })).rejects.toThrow('source down');
  await Promise.resolve();
  await expect(cache.load('error', async () => 'ok')).resolves.toBe('ok');
});
