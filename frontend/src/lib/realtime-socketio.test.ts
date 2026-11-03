import { describe, expect, it, vi } from 'vitest';
import type { GameSocket } from './socket';
import { SocketIoRealtime } from './realtime-socketio';

function fakeSocket(connected = true) {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  let ack: ((error: Error | null, response?: unknown) => void) | undefined;
  const socket = {
    connected,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(handler); }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => { handlers.get(event)?.delete(handler); }),
    once: vi.fn(),
    timeout: vi.fn(() => socket),
    emit: vi.fn((_event: string, _payload: unknown, callback?: typeof ack) => { ack = callback; }),
    disconnect: vi.fn(),
  };
  const trigger = (event: string, ...args: unknown[]) => handlers.get(event)?.forEach((handler) => handler(...args));
  return { socket, client: new SocketIoRealtime(socket as unknown as GameSocket), trigger, ack: (error: Error | null, response?: unknown) => ack?.(error, response) };
}

describe('Socket.IO realtime adapter', () => {
  it('delegates acknowledged requests to sendCommand', async () => {
    const fixture = fakeSocket();
    const result = fixture.client.request('room:create', {});
    fixture.ack(null, { ok: true, room: { code: 'ABCD' } });
    await expect(result).resolves.toEqual({ ok: true, room: { code: 'ABCD' } });
    expect(fixture.socket.timeout).toHaveBeenCalledWith(8_000);
  });

  it('propagates server rejections and offline errors', async () => {
    const fixture = fakeSocket();
    const result = fixture.client.request('room:start-game', {});
    fixture.ack(null, { ok: false, error: 'No eres el anfitrión' });
    await expect(result).rejects.toThrow('No eres el anfitrión');
    await expect(fakeSocket(false).client.request('room:start-game', {})).rejects.toThrow('Sin conexión');
  });

  it('fires cursor events without ack and delegates listeners', () => {
    const fixture = fakeSocket();
    fixture.client.fire('who-is-who:cursor', { x: 1 });
    expect(fixture.socket.emit).toHaveBeenCalledWith('who-is-who:cursor', { x: 1 });
    const listener = vi.fn();
    fixture.client.on('room:kicked', listener);
    fixture.trigger('room:kicked', 'Fuera');
    fixture.client.off('room:kicked', listener);
    fixture.trigger('room:kicked', 'Otra');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('Fuera');
  });

  it('maps connect, disconnect and connect_error to connection callbacks', () => {
    const fixture = fakeSocket();
    const listener = vi.fn();
    const unsubscribe = fixture.client.onConnection(listener);
    fixture.trigger('connect');
    fixture.trigger('disconnect', 'transport close');
    fixture.trigger('connect_error', new Error('Authentication required'));
    expect(listener.mock.calls).toEqual([[true], [false], [false, 'Authentication required']]);
    unsubscribe();
    fixture.trigger('connect');
    expect(listener).toHaveBeenCalledTimes(3);
    expect(fixture.client.connected).toBe(true);
    fixture.client.disconnect();
    expect(fixture.socket.disconnect).toHaveBeenCalled();
  });
});
