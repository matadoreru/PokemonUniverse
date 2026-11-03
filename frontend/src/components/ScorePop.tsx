import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import type { CutInTone } from './RevealCutIn';

export function scorePopLabel(points: number): string {
  return `+${points}`;
}

/** Puntos que flotan sobre el marcador. Es decorativo: el cambio de puntos se anuncia en el texto de la pantalla. */
export function ScorePop({ points, tone, reducedMotion }: { points: number; tone?: CutInTone; reducedMotion?: boolean }) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const classes = ['score-pop', tone ? `score-pop-${tone}` : '', reduced ? '' : 'score-pop-anim'].filter(Boolean).join(' ');
  return <span className={classes} aria-hidden="true">{scorePopLabel(points)}</span>;
}
