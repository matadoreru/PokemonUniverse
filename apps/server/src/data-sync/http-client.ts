export interface SyncHttpClientOptions {
  attempts?: number;
  baseDelayMs?: number;
  fetcher?: typeof fetch;
}

/** Small rate-limit-aware client shared by all external synchronization
 * adapters. Runtime game code never imports this module. */
export class SyncHttpClient {
  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: SyncHttpClientOptions = {}) {
    this.attempts = options.attempts ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.fetcher = options.fetcher ?? fetch;
  }

  async json<T>(url: string, label: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const response = await this.fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'PokemonUniverse-DataSync/1.0' } });
        if (response.ok) return response.json() as Promise<T>;
        lastError = new Error(`${label} returned HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) throw lastError;
        const retryAfter = Number(response.headers.get('retry-after'));
        if (attempt < this.attempts) await this.wait(Number.isFinite(retryAfter) ? retryAfter * 1_000 : this.backoff(attempt));
      } catch (error) {
        lastError = error;
        if (attempt < this.attempts) await this.wait(this.backoff(attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Could not load ${label}`);
  }

  private backoff(attempt: number): number { return this.baseDelayMs * (2 ** (attempt - 1)) + Math.floor(Math.random() * 150); }
  private wait(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
}
