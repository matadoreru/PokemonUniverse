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
