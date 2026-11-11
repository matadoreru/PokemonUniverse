import type { ReactNode } from 'react';
import { useState } from 'react';
import { cx } from './cx';
import { ScorePop } from './ScorePop';
import s from './ScoreValue.module.css';

/** Estado de `ScoreValue`: el valor mostrado, cuántas veces ha cambiado y la última diferencia. */
export interface ScoreValueState {
  value: number;
  /** Cambios desde el montaje: 0 al montar (no rebota ni sale «+N»). */
  changes: number;
  /** Diferencia con el valor anterior (0 al montar). */
  delta: number;
}

/** Paso de `ScoreValue` ante un valor nuevo: igual, se queda; distinto, cuenta un cambio y guarda la diferencia. */
export function nextScoreState(state: ScoreValueState, value: number): ScoreValueState {
  if (state.value === value) return state;
  return { value, changes: state.changes + 1, delta: value - state.value };
}

/** ¿Sale el «+N»? Solo para el propio jugador y si el valor subió (nunca al montar ni al bajar o volver a 0). */
export function scoreValuePops(state: ScoreValueState, self: boolean): boolean {
  return self && state.changes > 0 && state.delta > 0;
}

export interface ScoreValueProps {
  value: number;
  /** El marcador del jugador local: al subir, sale el «+N» (`ScorePop`) con lo ganado y suena `game.score`. */
  self?: boolean | undefined;
  /** Con `self`, el «+N» sin sonido: otra pieza de la pantalla ya da `game.score` por ese mismo acierto. */
  quiet?: boolean | undefined;
  /** Color del «+N» (el del jugador). */
  color?: string | undefined;
  /** Lo que sigue a la cifra (p. ej. `<small> pts</small>`). */
  children?: ReactNode;
  className?: string | undefined;
  'data-testid'?: string | undefined;
}

/**
 * Cifra de un marcador que rebota (`motion-bump`) cada vez que cambia, nunca al montar. Con `self`, al subir lanza el
 * «+N» con la diferencia a su izquierda. Solo se vuelve a montar la cifra, no el resto del marcador. Con reducción de
 * movimiento ni rebota ni se desplaza el «+N» (lo apagan `motion-bump` y `ScorePop`).
 */
export function ScoreValue({ value, self = false, quiet = false, color, children, className, 'data-testid': testId }: ScoreValueProps) {
  const [state, setState] = useState<ScoreValueState>({ value, changes: 0, delta: 0 });
  const next = nextScoreState(state, value);
  if (next !== state) setState(next);
  return <span className={cx(className, s.value)} {...(testId ? { 'data-testid': testId } : {})}>
    {scoreValuePops(next, self) && <ScorePop key={`pop-${next.changes}`} points={next.delta} color={color} placement="before" self={!quiet} />}
    <span key={`n-${next.changes}`} className={cx(s.number, next.changes > 0 && 'motion-bump')}>{value}</span>{children}
  </span>;
}
