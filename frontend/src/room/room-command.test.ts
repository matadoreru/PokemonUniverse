import { describe, expect, it, vi } from 'vitest';
import { requestCommand } from './room-command';

function reporter() {
  return { clear: vi.fn(), set: vi.fn() };
}

describe('requestCommand', () => {
  it('con aviso global: lo limpia al empezar y publica el fallo', async () => {
    const report = reporter();
    await expect(requestCommand(() => Promise.reject(new Error('Room not found')), report)).rejects.toThrow('Room not found');
    expect(report.clear).toHaveBeenCalledTimes(1);
    expect(report.set).toHaveBeenCalledWith('Room not found');
  });
  it('sin aviso global (quien llama enseña el error): no toca el aviso ni al empezar ni al fallar', async () => {
    const report = reporter();
    await expect(requestCommand(() => Promise.reject(new Error('Room is full')), null)).rejects.toThrow('Room is full');
    await expect(requestCommand(() => Promise.resolve(1), null)).resolves.toBe(1);
    expect(report.clear).not.toHaveBeenCalled();
    expect(report.set).not.toHaveBeenCalled();
  });
  it('un éxito devuelve la respuesta y no publica nada', async () => {
    const report = reporter();
    await expect(requestCommand(() => Promise.resolve({ ok: true }), report)).resolves.toEqual({ ok: true });
    expect(report.set).not.toHaveBeenCalled();
  });
  it('un rechazo que no es Error se publica como texto', async () => {
    const report = reporter();
    await expect(requestCommand(() => Promise.reject('Not in a room'), report)).rejects.toBe('Not in a room');
    expect(report.set).toHaveBeenCalledWith('Not in a room');
  });
});
