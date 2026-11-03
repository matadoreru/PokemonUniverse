import type { ReactNode } from 'react';
import { useState } from 'react';
import { cx } from './cx';
import s from './ScreenTransition.module.css';

export interface ScreenTransitionProps {
  /** Clave de la pantalla (la ruta): al cambiar, la entrada se repite. */
  routeKey: string;
  children: ReactNode;
}

/**
 * Entrada de cada pantalla nueva (spec §7): opacidad y 8 px hacia arriba en `--t-screen`; con reducción de movimiento,
 * solo opacidad en `--t-fade`; con `body.static`, nada. No vuelve a montar a los hijos (la sala vive entre `/play` y
 * `/room`): alterna entre dos animaciones iguales, y cambiar el nombre de la animación la reinicia. Ninguna deja un
 * `transform` puesto al acabar, así que no cambia la caja de referencia de lo que va en `position: fixed`.
 */
export function ScreenTransition({ routeKey, children }: ScreenTransitionProps) {
  const [shown, setShown] = useState({ key: routeKey, n: 0 });
  if (shown.key !== routeKey) setShown({ key: routeKey, n: shown.n + 1 });
  return (
    <div className={cx(s.screen, shown.n % 2 === 0 ? s.even : s.odd)} data-screen={routeKey}>
      {children}
    </div>
  );
}
