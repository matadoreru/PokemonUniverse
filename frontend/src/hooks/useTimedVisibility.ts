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

/** El contenido diferido ya puede mostrarse: su temporizador se cumplió para esta clave, o no hay pausa (`immediate`). */
export function isDelayElapsed(elapsedKey: string | null, armKey: string, immediate: boolean): boolean {
  return immediate || elapsedKey === armKey;
}

/**
 * `true` cuando han pasado `delayMs` desde que se armó `armKey` (o enseguida con `immediate`). Sirve para
 * montar un contenido tras una pausa en vez de ocultarlo con CSS: hasta entonces no está en el DOM.
 */
export function useDelayElapsed(delayMs: number, armKey: string, immediate: boolean): boolean {
  const [elapsedKey, setElapsedKey] = useState<string | null>(null);
  useEffect(() => (immediate ? undefined : scheduleHide(delayMs, () => setElapsedKey(armKey))), [delayMs, armKey, immediate]);
  return isDelayElapsed(elapsedKey, armKey, immediate);
}
