import { useEffect, useRef } from 'react';
import { bindShortcuts } from './shortcuts';

/**
 * Atajos de una pantalla de juego en `window` mientras `enabled`: `onKey` recibe cada tecla que cuenta como atajo y
 * devuelve si la atendió. Siempre llama al último `onKey`, sin volver a escuchar en cada render.
 */
export function useChoiceShortcuts(enabled: boolean, onKey: (key: string) => boolean): void {
  const onKeyRef = useRef(onKey);
  useEffect(() => { onKeyRef.current = onKey; }, [onKey]);
  useEffect(() => (enabled ? bindShortcuts(window, (key) => onKeyRef.current(key)) : undefined), [enabled]);
}
