import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import s from './Row.module.css';

export interface RowProps {
  rank?: number;
  avatar?: ReactNode;
  name: string;
  meta?: ReactNode;
  value?: ReactNode;
  /** Color del jugador (viene de los datos del avatar en tiempo de ejecución). */
  color?: string;
  self?: boolean;
  disconnected?: boolean;
  children?: ReactNode;
}

/** Franja de lista (jugador, marcador): banda de color a la izquierda; el color nunca va solo. */
export function Row({ rank, avatar, name, meta, value, color, self, disconnected, children }: RowProps) {
  const style = color ? ({ '--player': color } as CSSProperties) : undefined;
  return (
    <div className={cx(s.row, self && s.self, disconnected && s.off)} style={style}>
      {color && <span className={s.band} aria-hidden="true" />}
      {rank != null && <span className={s.rank}>{rank}</span>}
      {avatar && <span className={s.avatar}>{avatar}</span>}
      <span className={s.text}>
        <span className={s.name} title={name}>
          {name}
        </span>
        {(meta || disconnected) && (
          <span className={s.meta}>
            {disconnected && <span className={s.offLabel}>Sin conexión</span>}
            {meta}
          </span>
        )}
      </span>
      {value != null && <span className={s.value}>{value}</span>}
      {children}
    </div>
  );
}
