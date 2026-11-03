import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './HudPlate.module.css';

export interface HudPlateProps {
  children: ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

/** Placa azul noche del HUD de partida. */
export function HudPlate({ children, side = 'left', className }: HudPlateProps) {
  return <div className={cx(s.plate, s[side], className)}>{children}</div>;
}
