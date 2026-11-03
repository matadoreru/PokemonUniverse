import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@pokemon-universe/shared/public';
import { WebSocketRealtime } from './realtime-ws';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls: number[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close(code = 1000) { this.closeCalls.push(code); }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.({}); }
  receive(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  serverClose(code = 1006, reason = '') { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({ code, reason }); }
  frames() { return this.sent.map((data) => JSON.parse(data) as { id?: string; event: string; payload: unknown }); }
}

const latest = () => FakeWebSocket.instances.at(-1)!;
const create = () => new WebSocketRealtime('ws://example.test/ws', FakeWebSocket as unknown as typeof WebSocket);
const room = { code: 'ABCD' } as unknown as RoomView;

describe('native WebSocket realtime client', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeWebSocket.instances = []; });
  afterEach(() => { vi.useRealTimers(); });

  it('connects to the given url and reports the connection', () => {
    const client = create();
    const listener = vi.fn();
    client.onConnection(listener);
    expect(latest().url).toBe('ws://example.test/ws');
    expect(client.connected).toBe(false);
    latest().open();
    expect(client.connected).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    latest().serverClose(1006);
    expect(client.connected).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('reconnects now on demand after losing the connection, skipping the backoff wait', () => {
    const client = create();
    latest().open();
    latest().serverClose(1006);
    expect(FakeWebSocket.instances).toHaveLength(1);
    client.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(2);
    // The pending backoff timer was cancelled: no third socket appears when it would have fired.
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().open();
    expect(client.connected).toBe(true);
  });

  it('ignores reconnect while connecting, open or after disconnect()', () => {
    const client = create();
    client.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    latest().open();
    client.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    client.disconnect();
    latest().serverClose(1000);
    client.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('stops notifying after the connection listener unsubscribes', () => {
    const client = create();
    const listener = vi.fn();
    const unsubscribe = client.onConnection(listener);
    unsubscribe();
    latest().open();
    expect(listener).not.toHaveBeenCalled();
  });

  it('sends envelopes with incrementing string ids', () => {
    const client = create();
    latest().open();
    void client.request('room:start-game', {});
    void client.request('room:set-ready', { ready: true });
    expect(latest().frames()).toEqual([
      { id: '1', event: 'room:start-game', payload: {} },
      { id: '2', event: 'room:set-ready', payload: { ready: true } },
    ]);
  });

  it('resolves a successful ack spreading its data like Socket.IO', async () => {
    const client = create();
    latest().open();
    const result = client.request('room:create', {});
    const pending = client.request('room:start-game', {});
    latest().receive({ id: '1', ok: true, data: { room } });
    latest().receive({ id: '2', ok: true, data: {} });
    await expect(result).resolves.toEqual({ ok: true, room });
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it('rejects with the server message when the ack fails', async () => {
    const client = create();
    latest().open();
    const result = client.request('room:join', { code: 'ZZZZ' });
    latest().receive({ id: '1', ok: false, error: 'Sala no encontrada' });
    await expect(result).rejects.toThrow('Sala no encontrada');
  });

  it('reports an unknown outcome after 8 s without replaying the action', async () => {
    const client = create();
    latest().open();
    const result = client.request('room:start-game', {});
    const assertion = expect(result).rejects.toThrow('No se pudo confirmar la acción. Comprueba el estado de la sala antes de reintentar.');
    vi.advanceTimersByTime(7_999);
    latest().receive({ id: 'other', ok: true, data: {} });
    vi.advanceTimersByTime(1);
    await assertion;
    latest().receive({ id: '1', ok: true, data: {} });
    expect(latest().sent).toHaveLength(1);
  });

  it('rejects pending requests when the connection drops', async () => {
    const client = create();
    latest().open();
    const result = client.request('room:start-game', {});
    latest().serverClose(1006);
    await expect(result).rejects.toThrow('Conexión perdida: no se pudo confirmar la acción.');
  });

  it('rejects immediately while offline without buffering', async () => {
    const client = create();
    await expect(client.request('room:start-game', {})).rejects.toThrow('Sin conexión con el servidor');
    expect(latest().sent).toHaveLength(0);
  });

  it('fires cursor events without id and ignores them while offline', () => {
    const client = create();
    client.fire('who-is-who:cursor', { x: 1, y: 2 });
    latest().open();
    client.fire('who-is-who:cursor-clear', {});
    expect(latest().frames()).toEqual([{ event: 'who-is-who:cursor-clear', payload: {} }]);
  });

  it('dispatches push frames to the listeners of their event', () => {
    const client = create();
    const state = vi.fn();
    const kicked = vi.fn();
    const removed = vi.fn();
    client.on('room:state', state);
    client.on('room:kicked', kicked);
    client.on('room:state', removed);
    client.off('room:state', removed);
    latest().open();
    latest().receive({ event: 'room:state', payload: room });
    latest().receive({ event: 'room:kicked', payload: 'Te han expulsado' });
    expect(state).toHaveBeenCalledWith(room);
    expect(kicked).toHaveBeenCalledWith('Te han expulsado');
    expect(removed).not.toHaveBeenCalled();
  });

  it('ignores malformed frames', () => {
    const client = create();
    const state = vi.fn();
    client.on('room:state', state);
    latest().open();
    latest().onmessage?.({ data: 'not json' });
    latest().receive({ unexpected: true });
    expect(state).not.toHaveBeenCalled();
  });

  it('reconnects with exponential backoff capped at 8 s', () => {
    create();
    const delays = [500, 1_000, 2_000, 4_000, 8_000, 8_000];
    for (const delay of delays) {
      const count = FakeWebSocket.instances.length;
      latest().serverClose(1006);
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(count + 1);
    }
  });

  it('resets the backoff after a successful connection', () => {
    const client = create();
    const listener = vi.fn();
    client.onConnection(listener);
    latest().serverClose(1006);
    vi.advanceTimersByTime(500);
    latest().serverClose(1006);
    vi.advanceTimersByTime(1_000);
    latest().open();
    latest().serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(4);
    latest().open();
    expect(listener).toHaveBeenLastCalledWith(true);
  });

  it('does not reconnect after an explicit disconnect', async () => {
    const client = create();
    const listener = vi.fn();
    client.onConnection(listener);
    latest().open();
    const pending = client.request('room:start-game', {});
    client.disconnect();
    expect(latest().closeCalls).toEqual([1000]);
    await expect(pending).rejects.toThrow('Conexión perdida');
    latest().serverClose(1000);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('cancels a scheduled reconnection on disconnect', () => {
    const client = create();
    latest().serverClose(1006);
    client.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('stops after an authentication close and reports it', () => {
    const client = create();
    const listener = vi.fn();
    client.onConnection(listener);
    latest().open();
    latest().serverClose(4401, 'Authentication required');
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(listener).toHaveBeenLastCalledWith(false, 'Authentication required');
  });

  it('ignores events from a replaced socket', () => {
    const client = create();
    const state = vi.fn();
    client.on('room:state', state);
    const first = latest();
    first.serverClose(1006);
    vi.advanceTimersByTime(500);
    first.receive({ event: 'room:state', payload: room });
    first.serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(state).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
