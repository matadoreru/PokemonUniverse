import { describe, expect, it, vi } from 'vitest';
import { SessionAttachment } from './session-attachment';

function fakeSocket(connected: boolean) {
  return { connected, request: vi.fn(() => Promise.resolve({ ok: true as const })) };
}

describe('SessionAttachment', () => {
  it('engancha al montar si el socket ya está abierto', () => {
    const attachment = new SessionAttachment();
    const socket = fakeSocket(true);
    attachment.opened(socket);
    expect(socket.request).not.toHaveBeenCalled();
    attachment.hold();
    expect(socket.request).toHaveBeenCalledExactlyOnceWith('session:attach', {});
  });

  it('engancha en cada apertura mientras se pide, y deja de hacerlo al soltar', () => {
    const attachment = new SessionAttachment();
    const release = attachment.hold();
    const first = fakeSocket(true);
    attachment.opened(first);
    expect(first.request).toHaveBeenCalledOnce();
    attachment.closed(first);
    const reconnected = fakeSocket(true);
    attachment.opened(reconnected);
    expect(reconnected.request).toHaveBeenCalledOnce();
    release();
    release(); // soltar dos veces no descuenta a otro
    attachment.clear();
    attachment.closed(reconnected);
    const later = fakeSocket(true);
    attachment.opened(later);
    expect(later.request).not.toHaveBeenCalled();
  });

  it('no engancha sin socket abierto y calla el fallo del ack', async () => {
    const attachment = new SessionAttachment();
    const offline = fakeSocket(false);
    attachment.opened(offline);
    attachment.closed(offline);
    attachment.hold();
    expect(offline.request).toHaveBeenCalledTimes(0);
    const failing = { connected: true, request: vi.fn(() => Promise.reject(new Error('Sin conexión'))) };
    attachment.opened(failing);
    await Promise.resolve();
    expect(failing.request).toHaveBeenCalledOnce();
  });

  it('la pestaña que ya se enganchó vuelve a hacerlo al reconectar aunque no haya quien lo pida', () => {
    const attachment = new SessionAttachment();
    const release = attachment.hold();
    release();
    const reconnected = fakeSocket(true);
    attachment.opened(reconnected);
    expect(reconnected.request).toHaveBeenCalledExactlyOnceWith('session:attach', {});
    attachment.clear(); // «Salir», expulsión o cambio de cuenta
    const later = fakeSocket(true);
    attachment.opened(later);
    expect(later.request).not.toHaveBeenCalled();
  });
});
