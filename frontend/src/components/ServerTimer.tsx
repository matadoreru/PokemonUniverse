import { memo, useState } from 'react';
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

/** Totales ya medidos por plazo: una pantalla que se vuelve a montar con el mismo plazo no rellena la barra. */
const measuredTotals = new Map<number, number>();
const MEASURED_TOTALS_LIMIT = 32;

/**
 * Total medido de un plazo: el que se guardó la primera vez que se vio (aunque fuera en otro montaje) o, si es nuevo,
 * lo que queda ahora redondeado al segundo de arriba. Guarda como mucho `MEASURED_TOTALS_LIMIT` plazos (el más viejo sale).
 */
export function rememberedTotal(deadline: number | null, remainingMs: number, store: Map<number, number> = measuredTotals): ServerTimerTotal {
  if (deadline === null) return { deadline: null, totalMs: 0 };
  const known = store.get(deadline);
  if (known !== undefined) return { deadline, totalMs: known };
  const measured = serverTimerTotal(null, deadline, remainingMs);
  store.set(deadline, measured.totalMs);
  if (store.size > MEASURED_TOTALS_LIMIT) store.delete(store.keys().next().value!);
  return measured;
}

/**
 * Plazo del servidor con el `Timer` del catálogo: placa con la etiqueta, el número y la barra. El tictac de los 3
 * últimos segundos lo pone el propio `Timer` (`useCountdownCue`), con `now` equivalente en el reloj del plazo.
 */
export const ServerTimer = memo(function ServerTimer({ deadline, serverOffset, label = 'Tiempo', totalMs }: { deadline: number | null; serverOffset: number; label?: string; /** Duración completa del plazo; sin ella, lo que quedaba al llegar. */ totalMs?: number }) {
  const remainingMs = useRemainingMs(deadline, serverOffset, 250);
  // Estado derivado del plazo (sin mutar refs al pintar): un plazo nuevo vuelve a medir; el mismo, en otro montaje, se recuerda.
  const [measured, setMeasured] = useState<ServerTimerTotal>(() => rememberedTotal(deadline, remainingMs));
  if (measured.deadline !== deadline) setMeasured(rememberedTotal(deadline, remainingMs));
  const now = deadline === null ? 0 : deadline - remainingMs;
  return <Timer endsAt={deadline} now={now} totalMs={totalMs ?? measured.totalMs} label={label} showLabel />;
});
