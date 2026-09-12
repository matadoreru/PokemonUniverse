import { expect, it, vi } from 'vitest';
import { readResponseBytes } from './response-body.js';

it('cancels a body that stalls after its headers have arrived', async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
  const controller = new AbortController();
  const pending = readResponseBytes(response, 100, controller.signal);
  controller.abort(new Error('Deadline exceeded'));
  await expect(pending).rejects.toThrow('Deadline exceeded');
  expect(cancel).toHaveBeenCalledOnce();
});

it('checks accumulated chunks even without Content-Length', async () => {
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(3));
    controller.enqueue(new Uint8Array(3));
    controller.close();
  } }));
  await expect(readResponseBytes(response, 5)).rejects.toThrow('límite');
});
