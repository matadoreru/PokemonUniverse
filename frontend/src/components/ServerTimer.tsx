import { memo, useRef } from 'react';
import { Timer } from '../ui';
import { useRemainingMs } from '../hooks/useServerTime';

export interface ServerTimerTotal {
  deadline: number | null;
  totalMs: number;
}

/**
 * Total de la barra cuando quien llama no lo da: lo que queda al ver un plazo por primera vez, redondeado al segundo de
 * arriba. Con el mismo plazo se conserva (devuelve el mismo objeto); un plazo nuevo vuelve a medir.
 */
export function serverTimerTotal(previous: ServerTimerTotal | null, deadline: number | null, remainingMs: number): ServerTimerTotal {
  if (deadline === null) return previous?.deadline === null ? previous : { deadline: null, totalMs: 0 };
  if (previous?.deadline === deadline) return previous;
  return { deadline, totalMs: Math.ceil(remainingMs / 1_000) * 1_000 };
}

/**
 * Plazo del servidor con el `Timer` del catálogo: placa con la etiqueta, el número y la barra. El tictac de los 3
 * últimos segundos lo pone el propio `Timer` (`useCountdownCue`), con `now` equivalente en el reloj del plazo.
 */
export const ServerTimer = memo(function ServerTimer({ deadline, serverOffset, label = 'Tiempo', totalMs }: { deadline: number | null; serverOffset: number; label?: string; /** Duración completa del plazo; sin ella, lo que quedaba al llegar. */ totalMs?: number }) {
  const remainingMs = useRemainingMs(deadline, serverOffset, 250);
  const measured = useRef<ServerTimerTotal | null>(null);
  measured.current = serverTimerTotal(measured.current, deadline, remainingMs);
  const now = deadline === null ? 0 : deadline - remainingMs;
  return <Timer endsAt={deadline} now={now} totalMs={totalMs ?? measured.current.totalMs} label={label} showLabel />;
});
