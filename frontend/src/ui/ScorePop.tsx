import type { CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTimedVisibility } from '../hooks/useTimedVisibility';
import { cx } from './cx';
import s from './ScorePop.module.css';

/** Lo que dura el «+N» en pantalla, igual que su animación. */
export const SCORE_POP_MS = 400;

export function scorePopLabel(points: number): string {
  return `+${points}`;
}

export interface ScorePopProps {
  points: number;
  /** Color del jugador (viene de los datos del avatar en tiempo de ejecución, o un `var(--…)`). */
  color?: string | undefined;
  reducedMotion?: boolean | undefined;
  /** Clases de quien lo envuelve; van primero. */
  className?: string | undefined;
}

/**
 * «+N» que sube y se desvanece en 400 ms; se desmonta con un temporizador, con o sin reducción de movimiento. Un
 * `points` o `color` nuevos lo vuelven a mostrar; para repetir el mismo valor, móntalo con `key={idDelEvento}`. Es
 * decorativo (`aria-hidden`): el cambio de puntos se anuncia en el texto de la pantalla.
 */
export function ScorePop({ points, color, reducedMotion, className }: ScorePopProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const visible = useTimedVisibility(SCORE_POP_MS, `${points}|${color ?? ''}`);
  if (!visible) return null;
  const style = color ? ({ '--player': color } as CSSProperties) : undefined;
  return (
    <span className={cx(className, s.pop, !reduced && s.anim, 'ol')} style={style} aria-hidden="true">
      {scorePopLabel(points)}
    </span>
  );
}
