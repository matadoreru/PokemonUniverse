import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './HudPlate.module.css';

export interface HudPlateProps {
  children: ReactNode;
  side?: 'left' | 'right';
}

/** Placa azul noche del HUD de partida. */
export function HudPlate({ children, side = 'left' }: HudPlateProps) {
  return <div className={cx(s.plate, s[side])}>{children}</div>;
}
