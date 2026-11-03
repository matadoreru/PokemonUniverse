import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useDelayElapsed, useTimedVisibility } from '../hooks/useTimedVisibility';

export type CutInTone = 'electric' | 'berry' | 'aqua' | 'leaf';

const DEFAULT_HOLD_MS = 1_600;
/** Pausa antes de la `delayedLine`. */
export const CUT_IN_DELAYED_LINE_MS = 1_000;

export function revealCutInClassName(tone: CutInTone, reducedMotion: boolean): string {
  return `reveal-cut-in reveal-cut-in-${tone}${reducedMotion ? '' : ' reveal-cut-in-enter'}`;
}

export interface RevealCutInProps {
  tone: CutInTone;
  title: string;
  subtitle?: string;
  media?: ReactNode;
  delayedLine?: string;
  /** Tono que toma la banda al aparecer la `delayedLine` (para que el color no la adelante). */
  delayedTone?: CutInTone;
  holdMs?: number;
  reducedMotion?: boolean;
  onDone?(): void;
}

/**
 * Banda de revelación a todo el ancho. Se oculta con un temporizador a los `holdMs` (nunca con
 * `animationend`) y no bloquea la pantalla. Un `title` o `tone` nuevos la vuelven a mostrar; para
 * repetir la misma revelación (mismo texto), móntala con `key={revealId}`. La región `status` sigue
 * montada (vacía) al ocultarse, así el siguiente anuncio cae en una región viva ya existente. La
 * `delayedLine` se monta tras `CUT_IN_DELAYED_LINE_MS` (al momento con reducción de movimiento): antes no está en el DOM.
 */
export function RevealCutIn({ tone, title, subtitle, media, delayedLine, delayedTone, holdMs = DEFAULT_HOLD_MS, reducedMotion, onDone }: RevealCutInProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const visible = useTimedVisibility(holdMs, `${tone}|${title}`, onDone);
  const delayedShown = useDelayElapsed(CUT_IN_DELAYED_LINE_MS, `${tone}|${title}`, reduced);
  if (!visible) return <div className="sr-only" role="status" aria-live="assertive" data-layer="reveal-cut-in" />;
  return <div className={revealCutInClassName(delayedTone && delayedShown ? delayedTone : tone, reduced)} role="status" aria-live="assertive" data-layer="reveal-cut-in" data-motion={reduced ? 'reduced' : 'full'}>
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-1">
      {media}
      <strong className="reveal-cut-in-title font-display text-3xl font-bold sm:text-4xl">{title}</strong>
      {subtitle && <span className="text-base font-extrabold text-ink/75">{subtitle}</span>}
      {delayedLine && (delayedShown
        ? <span className={`font-display text-2xl font-bold${reduced ? '' : ' motion-enter-up'}`}>{delayedLine}</span>
        : <span className="invisible font-display text-2xl font-bold" aria-hidden="true">&nbsp;</span>)}
    </div>
  </div>;
}
