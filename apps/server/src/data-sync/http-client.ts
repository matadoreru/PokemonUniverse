import { readResponseBytes } from '../http/response-body.js';

export interface SyncHttpClientOptions {
  attempts?: number;
  baseDelayMs?: number;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (value === null || !value.trim()) return null;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 60_000) : null;
}

class HttpStatusError extends Error {
  constructor(label: string, readonly status: number) { super(`${label} returned HTTP ${status}`); }
}

/** Bounded external acquisition. Runtime games never depend on this client. */
export class SyncHttpClient {
  constructor(private readonly options: SyncHttpClientOptions = {}) {}

  async json<T>(url: string, label: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.request(url, label, 'application/json'))) as T;
  }

  bytes(url: string, label: string): Promise<Uint8Array> { return this.request(url, label, 'image/*'); }

  private async request(url: string, label: string, accept: string): Promise<Uint8Array> {
    const attempts = this.options.attempts ?? 4;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let delay = (this.options.baseDelayMs ?? 500) * (2 ** (attempt - 1)) + Math.floor(Math.random() * 150);
      try {
        const signal = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
        const response = await (this.options.fetcher ?? fetch)(url, {
          headers: { Accept: accept, 'User-Agent': 'PokemonUniverse-DataSync/1.0' },
          signal,
        });
        if (response.ok) return await readResponseBytes(response, this.options.maxBytes ?? 16 * 1024 * 1024, signal);
        delay = retryAfterMs(response.headers.get('retry-after')) ?? delay;
        await response.body?.cancel();
        throw new HttpStatusError(label, response.status);
      } catch (error) {
        if (error instanceof HttpStatusError && error.status < 500 && error.status !== 429) throw error;
        lastError = error;
      }
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 60_000)));
    }
    throw lastError instanceof Error ? lastError : new Error(`Could not load ${label}`);
  }
}
