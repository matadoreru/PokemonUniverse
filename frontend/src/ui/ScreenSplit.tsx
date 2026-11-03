import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './ScreenSplit.module.css';

export interface ScreenSplitProps {
  top: ReactNode;
  bottom: ReactNode;
  side?: ReactNode;
}

/**
 * Pantalla doble (spec §2). Por debajo de 1024 px: `top` arriba y `bottom` pegada al fondo con la bisagra encima (con el
 * margen seguro inferior); `side`, si hay, entre `top` y la bisagra. Desde 1024 px: columna principal (`top` sobre
 * `bottom`) y columna lateral de 320 px, todo limitado a 1600 px.
 */
export function ScreenSplit({ top, bottom, side }: ScreenSplitProps) {
  return (
    <div className={cx(s.split, side != null && s.withSide)}>
      <div className={s.top}>{top}</div>
      {side != null && <aside className={s.side}>{side}</aside>}
      <div className={s.bottom}>
        <div className={s.hinge} aria-hidden="true" />
        {bottom}
      </div>
    </div>
  );
}
