import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTimedVisibility } from '../hooks/useTimedVisibility';
import type { CutInTone } from './RevealCutIn';

/** Lo que dura el «+N» en pantalla, igual que su animación. */
export const SCORE_POP_MS = 400;

export function scorePopLabel(points: number): string {
  return `+${points}`;
}

/**
 * Puntos que flotan sobre el marcador y desaparecen a los 400 ms con un temporizador, con o sin
 * reducción de movimiento. Un `points` o `tone` nuevos lo vuelven a mostrar; para repetir el mismo
 * valor (dos «+3» seguidos), móntalo con `key={idDelEvento}`. Es decorativo (`aria-hidden`): el
 * cambio de puntos se anuncia en el texto de la pantalla.
 */
export function ScorePop({ points, tone, reducedMotion }: { points: number; tone?: CutInTone; reducedMotion?: boolean }) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const visible = useTimedVisibility(SCORE_POP_MS, `${points}|${tone ?? ''}`);
  if (!visible) return null;
  const classes = ['score-pop', tone ? `score-pop-${tone}` : '', reduced ? '' : 'score-pop-anim'].filter(Boolean).join(' ');
  return <span className={classes} aria-hidden="true">{scorePopLabel(points)}</span>;
}
