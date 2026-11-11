import { useEffect, type CSSProperties } from 'react';
import { audio } from '../audio';
import { useReducedMotion } from '../lib/motion';
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
  /** Es el «+N» del propio jugador: solo entonces suena `game.score`. */
  self?: boolean | undefined;
  /**
   * `before`: flota a la izquierda de la cifra que acompaña, un poco por encima (el padre lleva `position: relative`).
   * Sin ella, va en línea y quien lo envuelve lo coloca con `className`.
   */
  placement?: 'before' | undefined;
}

/**
 * «+N» que sube y se desvanece en 400 ms; se desmonta con un temporizador, con o sin reducción de movimiento. Un
 * `points` o `color` nuevos lo vuelven a mostrar; para repetir el mismo valor, móntalo con `key={idDelEvento}`. Es
 * decorativo (`aria-hidden`): el cambio de puntos se anuncia en el texto de la pantalla.
 */
export function ScorePop({ points, color, reducedMotion, className, self, placement }: ScorePopProps) {
  const prefersReduced = useReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const key = `${points}|${color ?? ''}`;
  const visible = useTimedVisibility(SCORE_POP_MS, key);
  useEffect(() => { if (self) audio.play('game.score'); }, [key, self]);
  if (!visible) return null;
  const style = color ? ({ '--player': color } as CSSProperties) : undefined;
  return (
    <span className={cx(className, s.pop, placement === 'before' && s.before, !reduced && s.anim, 'ol')} style={style} data-testid="score-pop" aria-hidden="true">
      {scorePopLabel(points)}
    </span>
  );
}
