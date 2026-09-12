/** Enforce the limit while streaming; Content-Length alone is not authoritative. */
export async function readResponseBytes(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid response byte limit');
  signal?.throwIfAborted();
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const abort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { void reader.cancel().catch(() => undefined); throw new Error('La respuesta supera el límite permitido.'); }
      chunks.push(value);
    }
  } finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
