import { useEffect, useRef, useState } from 'react';

/** Programa el cierre de una capa temporal. Devuelve la cancelación (para el `cleanup` del efecto). */
export function scheduleHide(holdMs: number, onHide: () => void): () => void {
  const timer = setTimeout(onHide, holdMs);
  return () => clearTimeout(timer);
}

/** Visible mientras la clave armada no sea la que ya se ocultó: una clave nueva vuelve a mostrar la capa. */
export function isArmedVisible(hiddenKey: string | null, armKey: string): boolean {
  return hiddenKey !== armKey;
}

/**
 * Visibilidad temporal sin `animationend`: se oculta a los `holdMs` y se vuelve a armar cuando cambia
 * `armKey`. `onDone` se llama una vez por clave al ocultarse.
 */
export function useTimedVisibility(holdMs: number, armKey: string, onDone?: () => void): boolean {
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => scheduleHide(holdMs, () => { setHiddenKey(armKey); onDoneRef.current?.(); }), [holdMs, armKey]);
  return isArmedVisible(hiddenKey, armKey);
}
