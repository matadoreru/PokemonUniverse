import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

function respond(status: number, body: string | null, statusText = ''): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, statusText })));
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try { await promise; } catch (caught) { return caught; }
  throw new Error('La petición no falló');
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('api', () => {
  it('pide /api con la cookie y JSON, y devuelve el cuerpo', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/ping', { method: 'POST' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/ping', expect.objectContaining({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } }));
  });

  it('un 204 no tiene cuerpo', async () => {
    respond(204, null);
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('un error del servidor lleva su `error` como mensaje y el código HTTP', async () => {
    respond(429, JSON.stringify({ error: 'Too many requests' }));
    const caught = await failure(api('/x'));
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ message: 'Too many requests', status: 429, network: false });
  });

  it('sin cuerpo JSON usa el texto de estado; sin `error`, «Request failed»', async () => {
    respond(502, '<html>', 'Bad Gateway');
    expect(await failure(api('/x'))).toMatchObject({ message: 'Bad Gateway', status: 502 });
    respond(500, JSON.stringify({}));
    expect(await failure(api('/x'))).toMatchObject({ message: 'Request failed', status: 500 });
  });

  it('un fallo de red es un `ApiError` con `network`, el mensaje del navegador y la causa', async () => {
    const original = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn(async () => { throw original; }));
    const caught = await failure(api('/x'));
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ message: 'Failed to fetch', network: true, status: undefined, cause: original });
  });

  it('una cancelación sigue siendo el `AbortError` original', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort; }));
    expect(await failure(api('/x'))).toBe(abort);
  });
});
