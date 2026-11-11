/**
 * Movimiento reducido (E8): el único sitio que pregunta al sistema (`matchMedia`). Se reduce con el ajuste «Reducido»
 * o con «Sistema» y el sistema operativo en reducido. `installMotion` lo refleja en `<html>` como
 * `data-motion="reduce"`, que es lo que miran todas las hojas (`:root[data-motion="reduce"] …`); el JS lee lo mismo con
 * `prefersReducedMotion()` o `useReducedMotion()`. Un test prohíbe las reglas `@media (prefers-reduced-motion)` y los
 * `matchMedia` de movimiento fuera de aquí.
 */
import { useSyncExternalStore } from 'react';
import { display } from '../preferences/display';
import type { MotionPreference } from '../preferences/preferences';

const QUERY = '(prefers-reduced-motion: reduce)';

function systemQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

/** ¿Se reduce el movimiento con este ajuste y esta preferencia del sistema? */
export function reducedMotionFor(preference: MotionPreference, systemReduced: boolean): boolean {
  return preference === 'reduce' || (preference === 'system' && systemReduced);
}

/** ¿Se reduce el movimiento ahora? Sin `matchMedia` (pruebas, SSR), el sistema cuenta como no reducido. */
export function prefersReducedMotion(): boolean {
  return reducedMotionFor(display.get().motion, systemQuery()?.matches ?? false);
}

/** Avisa cuando cambia el ajuste o la preferencia del sistema. Devuelve la baja. */
export function subscribeMotion(onChange: () => void): () => void {
  const query = systemQuery();
  query?.addEventListener('change', onChange);
  const off = display.subscribe(onChange);
  return () => {
    query?.removeEventListener('change', onChange);
    off();
  };
}

/** Indica si se reduce el movimiento; se actualiza al cambiar el ajuste o el sistema. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => false);
}

/** Pone o quita `data-motion="reduce"` en `root`. */
export function applyMotion(root: HTMLElement, reduced: boolean): void {
  if (reduced) root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');
}

/** Refleja el movimiento en `<html>` ya y en cada cambio. Devuelve la baja. */
export function installMotion(root: HTMLElement): () => void {
  const apply = () => applyMotion(root, prefersReducedMotion());
  apply();
  return subscribeMotion(apply);
}
