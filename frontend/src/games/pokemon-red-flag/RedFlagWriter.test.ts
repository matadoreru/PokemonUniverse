import { describe, expect, it, vi } from 'vitest';
import { autoSendDelay, createAnswerSender } from './RedFlagWriter';

describe('Red Flag: envío de la respuesta', () => {
  it('envía el texto recortado una sola vez aunque se pulse dos veces (o llegue el envío automático)', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const busy: boolean[] = [];
    const sender = createAnswerSender(onSubmit, (value) => busy.push(value));
    await Promise.all([sender.send('  Ronca como un Snorlax  '), sender.send('Ronca como un Snorlax')]);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Ronca como un Snorlax');
    // Con éxito queda ocupado: el servidor devuelve la respuesta bloqueada y la placa cambia.
    expect(busy).toEqual([true]);
  });

  it('un rechazo suelta el botón y se puede volver a enviar', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Sin conexión con el servidor')).mockResolvedValueOnce(undefined);
    const busy: boolean[] = [];
    const sender = createAnswerSender(onSubmit, (value) => busy.push(value));
    await sender.send('Ronca');
    expect(busy).toEqual([true, false]);
    await sender.send('Ronca');
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(busy).toEqual([true, false, true]);
  });

  it('sin texto no envía (tampoco el envío automático)', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const sender = createAnswerSender(onSubmit, () => undefined);
    await sender.send('   ');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('el envío automático salta 150 ms antes del plazo del servidor (con su desfase) y nunca con espera negativa', () => {
    expect(autoSendDelay(31_000, 1_000, 0)).toBe(29_850);
    expect(autoSendDelay(31_000, 1_000, 2_000)).toBe(27_850);
    expect(autoSendDelay(1_000, 5_000, 0)).toBe(0);
  });

  it('con temporizadores: al vencer el plazo envía lo escrito, y si falla se puede reenviar a mano', async () => {
    vi.useFakeTimers();
    try {
      const onSubmit = vi.fn().mockRejectedValueOnce(new Error('El tiempo ha terminado.')).mockResolvedValueOnce(undefined);
      const busy: boolean[] = [];
      const sender = createAnswerSender(onSubmit, (value) => busy.push(value));
      let text = 'Borrador';
      setTimeout(() => { void sender.send(text); }, autoSendDelay(10_000, 0, 0));
      text = 'Borrador final';
      await vi.advanceTimersByTimeAsync(9_849);
      expect(onSubmit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(onSubmit).toHaveBeenCalledWith('Borrador final');
      expect(busy).toEqual([true, false]);
      await sender.send(text);
      expect(onSubmit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
