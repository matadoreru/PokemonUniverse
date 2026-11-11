import { useCallback, useEffect, useRef, useState } from 'react';

/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

/**
 * Envío de una orden de una en una: `pending` es la que va en camino (o `null`) y `submit` no hace nada mientras otra
 * va en camino. El fallo no se relanza: ya lo publica el aviso de la sala.
 */
export function usePendingAction<T>(run: (value: T) => Promise<unknown>): { pending: T | null; submit(value: T): Promise<void> } {
  const [pending, setPending] = useState<T | null>(null);
  const busy = useRef(false);
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);
  const submit = useCallback(async (value: T) => {
    if (busy.current) return;
    busy.current = true;
    setPending(value);
    try {
      await runRef.current(value).catch(ignoreFailure);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);
  return { pending, submit };
}
