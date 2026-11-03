import { describe, expect, it, vi } from 'vitest';
import type { GameSocket } from '../lib/socket';
import { sendCommand } from './send-command';

function transport(connected = true) {
  let disconnect!: () => void;
  let ack!: (error: Error | null, response?: { ok: true } | { ok: false; error: string }) => void;
  const socket = {
    connected,
    once: vi.fn((_event: string, callback: () => void) => { disconnect = callback; }),
    off: vi.fn(),
    timeout: vi.fn(() => socket),
    emit: vi.fn((_event: string, _payload: unknown, callback: typeof ack) => { ack = callback; }),
  };
  return { socket: socket as unknown as GameSocket, mock: socket, disconnect: () => disconnect(), ack: (...args: Parameters<typeof ack>) => ack(...args) };
}

describe('acknowledged commands', () => {
  it('rejects offline commands without buffering them', async () => {
    const fixture = transport(false);
    await expect(sendCommand(fixture.socket, 'room:start-game', {})).rejects.toThrow('Sin conexión');
    expect(fixture.mock.emit).not.toHaveBeenCalled();
  });
  it('resolves a success and removes its disconnect listener', async () => {
    const fixture = transport();
    const result = sendCommand(fixture.socket, 'room:start-game', {});
    fixture.ack(null, { ok: true });
    await expect(result).resolves.toEqual({ ok: true });
    expect(fixture.mock.off).toHaveBeenCalledTimes(1);
    expect(fixture.mock.timeout).toHaveBeenCalledWith(8_000);
  });
  it('ignores late acknowledgements after disconnection', async () => {
    const fixture = transport();
    const result = sendCommand(fixture.socket, 'room:start-game', {});
    fixture.disconnect();
    fixture.ack(null, { ok: true });
    await expect(result).rejects.toThrow('Conexión perdida');
    expect(fixture.mock.off).toHaveBeenCalledTimes(1);
  });
  it('reports unknown outcome on timeout without replaying the action', async () => {
    const fixture = transport();
    const result = sendCommand(fixture.socket, 'room:start-game', {});
    fixture.ack(new Error('timeout'));
    await expect(result).rejects.toThrow('Comprueba el estado');
    expect(fixture.mock.emit).toHaveBeenCalledTimes(1);
  });
  it('preserves server rejection messages', async () => {
    const fixture = transport();
    const result = sendCommand(fixture.socket, 'room:start-game', {});
    fixture.ack(null, { ok: false, error: 'Ronda obsoleta' });
    await expect(result).rejects.toThrow('Ronda obsoleta');
  });
});
