import { describe, expect, it } from 'vitest';
import { sendRunoffVote, type RunoffVoteRequest } from './useRunoffVote';

function harness() {
  const request: { current: RunoffVoteRequest } = { current: { epoch: 1, pending: false } };
  const state = { busy: '' };
  const send = (id: string, submit: (id: string) => Promise<void>) => sendRunoffVote(request, id, submit, (value) => { state.busy = value; });
  return { request, state, send };
}

describe('useRunoffVote: envío del voto', () => {
  it('un rechazo suelta la papeleta (se puede volver a votar)', async () => {
    const { request, state, send } = harness();
    await send('p2', async () => { throw new Error('Tu voto ya está bloqueado.'); });
    expect(state).toEqual({ busy: '' });
    expect(request.current.pending).toBe(false);
    const sent: string[] = [];
    await send('p3', async (id) => { sent.push(id); });
    expect(sent).toEqual(['p3']);
  });

  it('con éxito sigue ocupada (una sola petición) hasta que cambie la época', async () => {
    const { request, state, send } = harness();
    const sent: string[] = [];
    await send('p2', async (id) => { sent.push(id); });
    await send('p3', async (id) => { sent.push(id); });
    expect(sent).toEqual(['p2']);
    expect(state.busy).toBe('p2');
    expect(request.current.pending).toBe(true);
    // Nueva vuelta (lo que hace el efecto del hook): vuelve a aceptar.
    request.current = { epoch: request.current.epoch + 1, pending: false };
    await send('p3', async (id) => { sent.push(id); });
    expect(sent).toEqual(['p2', 'p3']);
  });

  it('un rechazo que llega tras cambiar de época no toca la papeleta nueva', async () => {
    const { request, state, send } = harness();
    let reject: (error: Error) => void = () => undefined;
    const pending = send('p2', () => new Promise((_, fail) => { reject = fail; }));
    request.current = { epoch: request.current.epoch + 1, pending: false };
    state.busy = '';
    reject(new Error('tarde'));
    await pending;
    expect(state).toEqual({ busy: '' });
    expect(request.current.pending).toBe(false);
  });
});
