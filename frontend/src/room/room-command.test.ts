import { describe, expect, it, vi } from 'vitest';
import { commandRequest, gameActionPayload, requestCommand, roomErrorReporter } from './room-command';
import { roomActionErrorMessage } from './roomCode';

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

describe('guardas de los comandos: también salen en el aviso global', () => {
  const room = { gameSkipState: { gameInstanceId: 'g1' }, gameActionEpoch: 'e1' };
  it('sin conexión: «Sin conexión con el servidor» pasa por el aviso global', async () => {
    const report = reporter();
    await expect(requestCommand(commandRequest(null, 'game:action', { x: 1 }), report)).rejects.toThrow('Sin conexión con el servidor');
    expect(report.clear).toHaveBeenCalledTimes(1);
    expect(report.set).toHaveBeenCalledWith('Sin conexión con el servidor');
  });
  it('acción de juego sin minijuego activo o sin época: el error en castellano llega al aviso y no se envía nada', async () => {
    const socket = { request: vi.fn(async () => undefined) };
    for (const [state, message] of [[{ ...room, gameSkipState: null }, 'No hay un minijuego activo.'], [{ ...room, gameActionEpoch: null }, 'Actualiza la conexión para recuperar la ronda.'], [null, 'No hay un minijuego activo.']] as const) {
      const report = reporter();
      await expect(requestCommand(commandRequest(socket, 'game:action', () => gameActionPayload(state, { type: 'X' })), report)).rejects.toThrow(message);
      expect(report.set).toHaveBeenCalledWith(message);
    }
    expect(socket.request).not.toHaveBeenCalled();
  });
  it('con todo en orden envía el minijuego, la época y la acción', async () => {
    const socket = { request: vi.fn(async () => 'ok') };
    const report = reporter();
    await expect(requestCommand(commandRequest(socket, 'game:action', () => gameActionPayload(room, { type: 'X' })), report)).resolves.toBe('ok');
    expect(socket.request).toHaveBeenCalledWith('game:action', { gameInstanceId: 'g1', actionEpoch: 'e1', action: { type: 'X' } });
    expect(report.set).not.toHaveBeenCalled();
  });
  it('los tres textos llegan tal cual al aviso (ya están en castellano)', () => {
    for (const message of ['Sin conexión con el servidor', 'No hay un minijuego activo.', 'Actualiza la conexión para recuperar la ronda.']) expect(roomActionErrorMessage(message)).toBe(message);
  });
});

describe('roomErrorReporter: los borradores no tocan el aviso global', () => {
  // El aviso global, como el `useState` de `RoomContext`.
  function notice(initial: string | null) {
    const state = { error: initial };
    return { state, setError: (message: string | null) => { state.error = message; } };
  }
  const translate = (message: string) => `ES: ${message}`;

  it('un borrador (`report: false`) no borra un error que ya estaba, ni al enviarse ni al fallar', async () => {
    const { state, setError } = notice('La respuesta es demasiado larga.');
    await requestCommand(() => Promise.resolve(undefined), roomErrorReporter(false, setError, translate, () => true));
    expect(state.error).toBe('La respuesta es demasiado larga.');
    await expect(requestCommand(() => Promise.reject(new Error('Draft rejected')), roomErrorReporter(false, setError, translate, () => true))).rejects.toThrow('Draft rejected');
    expect(state.error).toBe('La respuesta es demasiado larga.');
  });
  it('una acción normal sí lo limpia al empezar y publica su fallo traducido', async () => {
    const { state, setError } = notice('Error anterior');
    await requestCommand(() => Promise.resolve(undefined), roomErrorReporter(true, setError, translate, () => true));
    expect(state.error).toBeNull();
    await expect(requestCommand(() => Promise.reject(new Error('Answer too long')), roomErrorReporter(true, setError, translate, () => true))).rejects.toThrow('Answer too long');
    expect(state.error).toBe('ES: Answer too long');
  });
  it('el fallo de un socket que ya no es el actual no se publica', async () => {
    const { state, setError } = notice(null);
    await expect(requestCommand(() => Promise.reject(new Error('tarde')), roomErrorReporter(true, setError, translate, () => false))).rejects.toThrow('tarde');
    expect(state.error).toBeNull();
  });
});
