import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { cx } from '../ui/cx';
import { ScorePop as UiScorePop } from '../ui/ScorePop';
import type { CutInTone } from './RevealCutIn';

export { SCORE_POP_MS, scorePopLabel } from '../ui/ScorePop';

/** Tono de siempre → color del token. */
const TONE_COLOR: Record<CutInTone, string> = { electric: 'var(--yellow)', berry: 'var(--red)', aqua: 'var(--info)', leaf: 'var(--ok)' };

/**
 * Envoltorio de `ui/ScorePop` con la API de siempre (`tone`); conserva las clases `score-pop`, `score-pop-<tono>` y
 * `score-pop-anim` (las buscan los tests y los E2E).
 */
export function ScorePop({ points, tone, reducedMotion }: { points: number; tone?: CutInTone; reducedMotion?: boolean }) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  return <UiScorePop points={points} color={tone && TONE_COLOR[tone]} reducedMotion={reduced} className={cx('score-pop', tone && `score-pop-${tone}`, !reduced && 'score-pop-anim')} />;
}
