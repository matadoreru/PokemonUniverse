import { describe, expect, it, vi } from 'vitest';
import { submitBallot } from './presentation';

/** El estado `busyRound` de la pantalla, con el mismo `setState` funcional. */
function busyState(initial: number | null = null) {
  const state = { value: initial };
  return { state, set: (update: (current: number | null) => number | null) => { state.value = update(state.value); } };
}

describe('Would You Rather: envío de la papeleta', () => {
  it('con éxito sigue «enviando» esa ronda (sin doble envío) hasta que vuelve la papeleta', async () => {
    const busy = busyState();
    const submit = vi.fn(async () => undefined);
    await submitBallot(2, submit, busy.set);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(busy.state.value).toBe(2);
  });

  it('un rechazo suelta el botón para volver a intentarlo', async () => {
    const busy = busyState();
    await submitBallot(2, () => Promise.reject(new Error('Tu papeleta ya está bloqueada.')), busy.set);
    expect(busy.state.value).toBeNull();
  });

  it('un rechazo tardío de otra ronda no toca la ronda nueva', async () => {
    const busy = busyState();
    let reject: (error: Error) => void = () => undefined;
    const pending = submitBallot(2, () => new Promise<void>((_, fail) => { reject = fail; }), busy.set);
    expect(busy.state.value).toBe(2);
    busy.set(() => 3);
    reject(new Error('La votación ya ha terminado.'));
    await pending;
    expect(busy.state.value).toBe(3);
  });
});
