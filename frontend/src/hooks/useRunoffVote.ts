import { useEffect, useRef, useState } from 'react';

/** Petición en curso de una votación: su época (ronda o vuelta) y si hay un voto enviándose. */
export interface RunoffVoteRequest { epoch: number; pending: boolean }

/**
 * Envía un voto (lógica del hook, sin React, para poder probarla): uno a la vez; si falla y sigue siendo la misma época,
 * suelta la papeleta (`busy` vacío) y deja el mensaje; si tiene éxito, la papeleta sigue ocupada hasta que cambie la
 * época (el voto bloqueado lo dice el servidor). Lee `request.current` después de esperar: un cambio de época durante el
 * envío lo invalida.
 */
export async function sendRunoffVote(request: { current: RunoffVoteRequest }, candidateId: string, submit: (candidateId: string) => Promise<void>, fallbackMessage: string, setBusyId: (id: string) => void, setError: (message: string) => void): Promise<void> {
  if (request.current.pending) return;
  const epoch = request.current.epoch;
  request.current.pending = true;
  setBusyId(candidateId);
  setError('');
  try {
    await submit(candidateId);
  } catch (caught) {
    if (epoch !== request.current.epoch) return;
    request.current.pending = false;
    setError(caught instanceof Error ? caught.message : fallbackMessage);
    setBusyId('');
  }
}

export function useRunoffVote(roundNumber: number, submit: (candidateId: string) => Promise<void>, fallbackMessage: string) {
  const request = useRef<RunoffVoteRequest>({ epoch: 0, pending: false });
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    request.current = { epoch: request.current.epoch + 1, pending: false };
    setBusyId('');
    setError('');
    return () => { request.current.epoch += 1; };
  }, [roundNumber]);

  const vote = (candidateId: string) => sendRunoffVote(request, candidateId, submit, fallbackMessage, setBusyId, setError);

  return { busyId, error, vote };
}
