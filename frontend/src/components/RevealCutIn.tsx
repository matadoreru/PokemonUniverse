import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTimedVisibility } from '../hooks/useTimedVisibility';

export type CutInTone = 'electric' | 'berry' | 'aqua' | 'leaf';

const DEFAULT_HOLD_MS = 1_600;

export function revealCutInClassName(tone: CutInTone, reducedMotion: boolean): string {
  return `reveal-cut-in reveal-cut-in-${tone}${reducedMotion ? '' : ' reveal-cut-in-enter'}`;
}

export interface RevealCutInProps {
  tone: CutInTone;
  title: string;
  subtitle?: string;
  media?: ReactNode;
  delayedLine?: string;
  holdMs?: number;
  reducedMotion?: boolean;
  onDone?(): void;
}

/**
 * Banda de revelación a todo el ancho. Se oculta con un temporizador a los `holdMs` (nunca con
 * `animationend`) y no bloquea la pantalla. Un `title` o `tone` nuevos la vuelven a mostrar; para
 * repetir la misma revelación (mismo texto), móntala con `key={revealId}`. La región `status` sigue
 * montada (vacía) al ocultarse, así el siguiente anuncio cae en una región viva ya existente.
 */
export function RevealCutIn({ tone, title, subtitle, media, delayedLine, holdMs = DEFAULT_HOLD_MS, reducedMotion, onDone }: RevealCutInProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const visible = useTimedVisibility(holdMs, `${tone}|${title}`, onDone);
  if (!visible) return <div className="sr-only" role="status" aria-live="assertive" data-layer="reveal-cut-in" />;
  return <div className={revealCutInClassName(tone, reduced)} role="status" aria-live="assertive" data-layer="reveal-cut-in" data-motion={reduced ? 'reduced' : 'full'}>
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-1">
      {media}
      <strong className="reveal-cut-in-title font-display text-3xl font-bold sm:text-4xl">{title}</strong>
      {subtitle && <span className="text-base font-extrabold text-ink/75">{subtitle}</span>}
      {delayedLine && <span className={`font-display text-2xl font-bold ${reduced ? '' : 'motion-enter-up '}motion-delay-1s`}>{delayedLine}</span>}
    </div>
  </div>;
}
