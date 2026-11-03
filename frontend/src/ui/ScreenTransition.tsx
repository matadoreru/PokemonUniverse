import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cx } from './cx';
import s from './ScreenTransition.module.css';

export interface ScreenTransitionProps {
  /** Clave de la pantalla (la ruta): al cambiar, la entrada se repite. */
  routeKey: string;
  children: ReactNode;
  /**
   * Al cambiar `routeKey` (nunca en la primera carga), el foco pasa al primer `h1` de la pantalla nueva: el lector de
   * pantalla anuncia dónde se está y el teclado sigue desde ahí. Solo el armazón lo activa.
   */
  focusHeading?: boolean;
}

/** Cuánto se espera al `h1` de una pantalla perezosa (o al de los datos que sustituyen al de carga). */
export const ROUTE_FOCUS_WATCH_MS = 3000;

/** Elemento enfocable mínimo para decidir el foco de ruta sin DOM (pruebas). */
export interface RouteFocusState {
  /** El `h1` que ya se enfocó en este cambio de ruta, si lo hay. */
  focused: { isConnected: boolean } | null;
  /** El foco está dentro de la pantalla (en otro elemento que ese `h1`). */
  activeInside: boolean;
  /** El foco está en el `body` (nadie lo tiene). */
  activeIsBody: boolean;
}

/**
 * Qué hacer al mirar la pantalla tras un cambio de ruta: `focus` (ir al primer `h1`), `wait` (seguir mirando) o `stop`.
 * Si la pantalla ya ha puesto el foco en uno de sus campos, se respeta. Si el `h1` enfocado desaparece (el de carga da
 * paso al de los datos) y el foco cae al `body`, se vuelve a enfocar el nuevo.
 */
export function routeFocusStep({ focused, activeInside, activeIsBody }: RouteFocusState): 'focus' | 'wait' | 'stop' {
  if (focused === null) return activeInside ? 'stop' : 'focus';
  if (focused.isConnected) return 'wait';
  return activeIsBody ? 'focus' : 'stop';
}

/** Vigila la pantalla hasta `ROUTE_FOCUS_WATCH_MS` y aplica `routeFocusStep`; devuelve la limpieza. */
function watchRouteHeading(screen: HTMLElement): () => void {
  let focused: HTMLElement | null = null;
  let done = false;
  const stop = () => {
    done = true;
    observer.disconnect();
    window.clearTimeout(timer);
  };
  const step = () => {
    if (done) return;
    const active = document.activeElement;
    const decision = routeFocusStep({
      focused,
      activeInside: active !== null && active !== focused && screen.contains(active),
      activeIsBody: active === null || active === document.body,
    });
    if (decision === 'stop') return stop();
    if (decision === 'wait') return;
    const heading = screen.querySelector<HTMLElement>('h1');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    focused = heading;
  };
  const observer = new MutationObserver(step);
  const timer = window.setTimeout(stop, ROUTE_FOCUS_WATCH_MS);
  observer.observe(screen, { childList: true, subtree: true });
  step();
  return stop;
}

/**
 * Entrada de cada pantalla nueva (spec §7): opacidad y 8 px hacia arriba en `--t-screen`; con reducción de movimiento,
 * solo opacidad en `--t-fade`; con `body.static`, nada. No vuelve a montar a los hijos (la sala vive entre `/play` y
 * `/room`): alterna entre dos animaciones iguales, y cambiar el nombre de la animación la reinicia. Ninguna deja un
 * `transform` puesto al acabar, así que no cambia la caja de referencia de lo que va en `position: fixed`.
 */
export function ScreenTransition({ routeKey, children, focusHeading = false }: ScreenTransitionProps) {
  const [shown, setShown] = useState({ key: routeKey, n: 0 });
  if (shown.key !== routeKey) setShown({ key: routeKey, n: shown.n + 1 });
  const screen = useRef<HTMLDivElement>(null);
  // Clave anterior y no un «ya montado»: el doble montaje de StrictMode no cuenta como cambio de ruta.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!focusHeading) return;
    const previous = lastKey.current;
    lastKey.current = routeKey;
    if (previous === null || previous === routeKey || !screen.current) return;
    return watchRouteHeading(screen.current);
  }, [routeKey, focusHeading]);
  return (
    <div ref={screen} className={cx(s.screen, shown.n % 2 === 0 ? s.even : s.odd)} data-screen={routeKey}>
      {children}
    </div>
  );
}
