import { describe, expect, it, vi } from 'vitest';
import { SyncHttpClient } from './http-client.js';

describe('SyncHttpClient', () => {
  it('retries transient API failures and accepts the recovered response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new SyncHttpClient({ fetcher, attempts: 2, baseDelayMs: 0 });
    await expect(client.json('https://example.test/data', 'test source')).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
