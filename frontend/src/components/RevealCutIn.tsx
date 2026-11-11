import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { Cutin, CUTIN_DELAYED_LINE_MS, CUTIN_HOLD_MS } from '../ui/Cutin';
import type { CutinTone } from '../ui/Cutin';

export type CutInTone = 'electric' | 'berry' | 'aqua' | 'leaf';

/** Pausa antes de la `delayedLine`. */
export const CUT_IN_DELAYED_LINE_MS = CUTIN_DELAYED_LINE_MS;

/** Tonos de siempre → tonos del cut-in del catálogo. */
export const cutInToneMap: Record<CutInTone, CutinTone> = { electric: 'yellow', berry: 'red', aqua: 'info', leaf: 'ok' };
const fromCutinTone = Object.fromEntries(Object.entries(cutInToneMap).map(([k, v]) => [v, k])) as Record<CutinTone, CutInTone>;

/** Clases de compatibilidad del elemento raíz visible (los E2E las buscan): `.reveal-cut-in`, su tono y si entra animada. */
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
  /** Ver `Cutin`: con `false` no es región viva (la pantalla ya lo anuncia en la suya). */
  live?: boolean;
  onDone?(): void;
}

/**
 * Envoltorio de `ui/Cutin` con la API de siempre: traduce el tono, conserva las clases `reveal-cut-in*` y
 * `data-layer="reveal-cut-in"`, y no se puede saltar (no intercepta el puntero). Un `title` o `tone` nuevos la
 * vuelven a mostrar; para repetir la misma revelación, móntala con `key={revealId}`.
 */
export function RevealCutIn({ tone, delayedTone, holdMs = CUTIN_HOLD_MS, reducedMotion, ...rest }: RevealCutInProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  return (
    <Cutin
      {...rest}
      tone={cutInToneMap[tone]}
      delayedTone={delayedTone && cutInToneMap[delayedTone]}
      holdMs={holdMs}
      reducedMotion={reduced}
      layer="reveal-cut-in"
      className={(shown) => revealCutInClassName(fromCutinTone[shown], reduced)}
    />
  );
}
