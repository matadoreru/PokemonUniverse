import { useEffect, useRef, useState } from 'react';

/** Petición en curso de una votación: su época (ronda o vuelta) y si hay un voto enviándose. */
export interface RunoffVoteRequest { epoch: number; pending: boolean }

/**
 * Envía un voto (lógica del hook, sin React, para poder probarla): uno a la vez; si falla y sigue siendo la misma época,
 * suelta la papeleta (`busy` vacío) para volver a intentarlo (el error ya lo dice el aviso global de la sala); si tiene
 * éxito, la papeleta sigue ocupada hasta que cambie la época (el voto bloqueado lo dice el servidor). Lee
 * `request.current` después de esperar: un cambio de época durante el envío lo invalida.
 */
export async function sendRunoffVote(request: { current: RunoffVoteRequest }, candidateId: string, submit: (candidateId: string) => Promise<void>, setBusyId: (id: string) => void): Promise<void> {
  if (request.current.pending) return;
  const epoch = request.current.epoch;
  request.current.pending = true;
  setBusyId(candidateId);
  try {
    await submit(candidateId);
  } catch {
    if (epoch !== request.current.epoch) return;
    request.current.pending = false;
    setBusyId('');
  }
}

export function useRunoffVote(roundNumber: number, submit: (candidateId: string) => Promise<void>) {
  const request = useRef<RunoffVoteRequest>({ epoch: 0, pending: false });
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    request.current = { epoch: request.current.epoch + 1, pending: false };
    setBusyId('');
    return () => { request.current.epoch += 1; };
  }, [roundNumber]);

  const vote = (candidateId: string) => sendRunoffVote(request, candidateId, submit, setBusyId);

  return { busyId, vote };
}
