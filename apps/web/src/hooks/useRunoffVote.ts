import { useEffect, useRef, useState } from 'react';

export function useRunoffVote(roundNumber: number, submit: (candidateId: string) => Promise<void>, fallbackMessage: string) {
  const request = useRef({ epoch: 0, pending: false });
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    request.current = { epoch: request.current.epoch + 1, pending: false };
    setBusyId('');
    setError('');
    return () => { request.current.epoch += 1; };
  }, [roundNumber]);

  const vote = async (candidateId: string) => {
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
  };

  return { busyId, error, vote };
}
