import { useEffect, useRef, type RefObject } from 'react';

/**
 * ¿Se lleva el foco al destino? Solo al pasar a otro estado con foco (`nextKey` nueva y no nula), nunca al montarse (el
 * primer efecto ve la misma clave) y solo si el foco se ha perdido (en `body` o en ningún sitio): una acción que
 * desmonta el control enfocado (confirmar, enviar) no deja al jugador de teclado en el `body`.
 */
export function shouldMoveFocusOnTransition(previousKey: string | null, nextKey: string | null, active: Element | null, body: Element | null): boolean {
  if (!nextKey || nextKey === previousKey) return false;
  return !active || active === body;
}

/**
 * Lleva el foco a `target` (sin desplazar la vista) cuando `focusKey` cambia a un estado con foco y el foco se ha
 * perdido. Ver `shouldMoveFocusOnTransition`.
 */
export function useFocusOnTransition(focusKey: string | null, target: RefObject<HTMLElement | null>): void {
  const previousKey = useRef(focusKey);
  useEffect(() => {
    const previous = previousKey.current;
    previousKey.current = focusKey;
    if (!shouldMoveFocusOnTransition(previous, focusKey, document.activeElement, document.body)) return;
    target.current?.focus({ preventScroll: true });
  }, [focusKey, target]);
}

/**
 * ¿Se devuelve el foco al botón de envío? Solo tras un rechazo: en la misma época (ronda, vuelta) deja de estar ocupado,
 * sigue abierto (un envío aceptado lo cierra) y el foco se había perdido en el `body` (el botón se deshabilitó al enviar).
 */
export function shouldRefocusSubmit(previous: { epoch: number; busy: boolean }, next: { epoch: number; busy: boolean; open: boolean }, activeIsBody: boolean): boolean {
  return previous.epoch === next.epoch && previous.busy && !next.busy && next.open && activeIsBody;
}

/**
 * Tras un envío rechazado, devuelve el foco a `target` (el botón de envío, que se deshabilitó mientras iba la petición)
 * en vez de dejarlo en el `body`. Ver `shouldRefocusSubmit`. Lo usan la papeleta del kit social, Red Flag y Secret Ranking.
 */
export function useRefocusAfterReject(epoch: number, busy: boolean, open: boolean, target: RefObject<HTMLElement | null>): void {
  const previous = useRef({ epoch, busy });
  useEffect(() => {
    const before = previous.current;
    previous.current = { epoch, busy };
    const active = document.activeElement;
    if (!shouldRefocusSubmit(before, { epoch, busy, open }, !active || active === document.body)) return;
    target.current?.focus({ preventScroll: true });
  }, [epoch, busy, open, target]);
}
