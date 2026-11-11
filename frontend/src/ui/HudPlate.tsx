import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './HudPlate.module.css';

export type HudPlateSize = 'inline' | 'block' | 'header';

export interface HudPlateProps {
  children: ReactNode;
  side?: 'left' | 'right';
  /**
   * `inline` (por defecto): placa del HUD, tan ancha como su contenido. `block`: a todo el ancho, con más aire y el
   * contenido en línea que baja si no cabe (la ficha del perfil). `header`: cabecera de pantalla a todo el ancho, en
   * columna en móvil y en una fila con los extremos separados desde 1024 px (Administración).
   */
  size?: HudPlateSize;
  className?: string;
}

/** Placa azul noche del HUD de partida. */
export function HudPlate({ children, side = 'left', size = 'inline', className }: HudPlateProps) {
  return <div className={cx(s.plate, s[side], size !== 'inline' && s[size], className)}>{children}</div>;
}
