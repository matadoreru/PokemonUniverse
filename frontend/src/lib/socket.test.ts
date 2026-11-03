import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketRealtime } from './realtime-ws';
import { createRealtime, roomSocketUrl } from './socket';

describe('createRealtime', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('always opens the Java room WebSocket', () => {
    const urls: string[] = [];
    class FakeWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      readyState = 0;
      constructor(url: string) { urls.push(url); }
      close(): void {}
    }
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = createRealtime();
    expect(client).toBeInstanceOf(WebSocketRealtime);
    expect(urls).toEqual([roomSocketUrl('')]);
    client.disconnect();
  });

  it('derives ws:// or wss:// from the page or API origin', () => {
    expect(roomSocketUrl('')).toBe('/ws');
    expect(roomSocketUrl('http://localhost:5173')).toBe('ws://localhost:5173/ws');
    expect(roomSocketUrl('https://pokemon.example')).toBe('wss://pokemon.example/ws');
  });
});
