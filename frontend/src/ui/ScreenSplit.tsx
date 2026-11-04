import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './ScreenSplit.module.css';

export interface ScreenSplitProps {
  top: ReactNode;
  bottom: ReactNode;
  side?: ReactNode;
  /** Por debajo de 1024 px, `side` va arriba del todo (antes de `top`): p. ej. los jugadores del lobby. */
  sideFirst?: boolean;
  /**
   * Desde 1024 px llena el alto del padre: `top` y `side` se desplazan por dentro y `bottom` queda siempre a la vista
   * (pantallas sin scroll de página, como el lobby).
   */
  fill?: boolean;
  className?: string;
}

/**
 * Pantalla doble (spec §2). Por debajo de 1024 px: `top` arriba y `bottom` pegada al fondo con la bisagra encima (con el
 * margen seguro inferior); `side`, si hay, entre `top` y la bisagra. Desde 1024 px: columna principal (`top` sobre
 * `bottom`) y columna lateral de 320 px, todo limitado a 1600 px.
 */
export function ScreenSplit({ top, bottom, side, sideFirst = false, fill = false, className }: ScreenSplitProps) {
  return (
    <div className={cx(s.split, side != null && s.withSide, side != null && sideFirst && s.sideFirst, fill && s.fill, className)}>
      <div className={s.top}>{top}</div>
      {side != null && <aside className={s.side}>{side}</aside>}
      {/* En móvil va pegada al fondo por encima de lo que se desplaza: es una capa (`data-layer`, lo usa el medidor de las E2E). */}
      <div className={s.bottom} data-layer="screen-bottom">
        <div className={s.hinge} aria-hidden="true" />
        {bottom}
      </div>
    </div>
  );
}
