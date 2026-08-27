import { useEffect, useState } from 'react';

export function useRunoffVote(roundNumber: number, submit: (candidateId: string) => Promise<void>, fallbackMessage: string) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setBusyId('');
    setError('');
  }, [roundNumber]);

  const vote = async (candidateId: string) => {
    if (busyId) return;
    setBusyId(candidateId);
    setError('');
    try {
      await submit(candidateId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      setBusyId('');
    }
  };

  return { busyId, error, vote };
}
