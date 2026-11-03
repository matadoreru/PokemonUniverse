import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useDelayElapsed, useTimedVisibility } from '../hooks/useTimedVisibility';
import { cx } from './cx';
import s from './Cutin.module.css';

export type CutinTone = 'yellow' | 'red' | 'info' | 'ok';

/** Duración por defecto de la capa (entrada, pausa y salida). */
export const CUTIN_HOLD_MS = 1_600;
/** Pausa antes de la `delayedLine`. */
export const CUTIN_DELAYED_LINE_MS = 1_000;

/** Clase extra del elemento raíz visible; como función recibe el tono que se ve (el diferido cuando ya toca). */
export type CutinClassName = string | ((tone: CutinTone) => string);

interface CutinContent {
  tone: CutinTone;
  title: string;
  subtitle?: string | undefined;
  media?: ReactNode;
  delayedLine?: string | undefined;
  /** Tono que toma la losa al aparecer la `delayedLine` (para que el color no la adelante). */
  delayedTone?: CutinTone | undefined;
  onSkip?: (() => void) | undefined;
  className?: CutinClassName | undefined;
  /** Valor de `data-layer` (capa que el medidor de E2E no cuenta como solape). */
  layer?: string | undefined;
}

export interface CutinProps extends CutinContent {
  holdMs?: number;
  reducedMotion?: boolean;
  onDone?(): void;
}

export interface CutinBandProps extends CutinContent {
  visible: boolean;
  delayedShown: boolean;
  reduced: boolean;
  holdMs?: number;
}

/**
 * Presentación pura del cut-in. Oculto deja montada la región `status` vacía (sin las clases de la losa), así el
 * siguiente anuncio cae en una región viva que ya existe. La `delayedLine` no está en el DOM hasta `delayedShown`.
 */
export function CutinBand({ visible, delayedShown, reduced, tone, title, subtitle, media, delayedLine, delayedTone, holdMs = CUTIN_HOLD_MS, onSkip, className, layer = 'cutin' }: CutinBandProps) {
  if (!visible) return <div className={s.srOnly} role="status" aria-live="assertive" data-layer={layer} />;
  const shownTone = delayedTone && delayedShown ? delayedTone : tone;
  const extra = typeof className === 'function' ? className(shownTone) : className;
  // La salida por la derecha empieza `--t-screen` antes de que el temporizador la desmonte.
  const style = { '--cutin-hold': `${holdMs}ms` } as CSSProperties;
  return (
    <div
      className={cx(extra, s.cutin, s[shownTone], onSkip && s.skippable)}
      role="status"
      aria-live="assertive"
      data-layer={layer}
      data-motion={reduced ? 'reduced' : 'full'}
      style={style}
      onClick={onSkip}
    >
      <div className={s.slab}>
        {media && <div className={s.media}>{media}</div>}
        <strong className={cx(s.title, 'ol2')}>{title}</strong>
        {subtitle && <span className={s.subtitle}>{subtitle}</span>}
        {delayedLine &&
          (delayedShown ? (
            <span className={cx(s.delayed, 'ol', !reduced && 'motion-enter-up')}>{delayedLine}</span>
          ) : (
            <span className={cx(s.delayed, s.placeholder)} aria-hidden="true">
              &nbsp;
            </span>
          ))}
      </div>
    </div>
  );
}

/** Espacio salta el cut-in salvo que se esté escribiendo en un campo. */
function isSkipKey(e: KeyboardEvent): boolean {
  if (e.key !== ' ' && e.code !== 'Space') return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  return !(t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'));
}

/**
 * Losa azul noche a todo el ancho, con bordes del tono, que entra desde la izquierda, se para y sale por la derecha.
 * Se oculta con un temporizador a los `holdMs` (nunca con `animationend`) y no bloquea la pantalla: solo intercepta
 * el puntero si se puede saltar (`onSkip`: clic o Espacio). Un `title` o `tone` nuevos la vuelven a mostrar (el nuevo
 * sustituye al actual); para repetir la misma, móntala con `key`. Con reducción de movimiento aparece sin desplazarse
 * y la `delayedLine` se monta al momento.
 */
export function Cutin({ holdMs = CUTIN_HOLD_MS, reducedMotion, onDone, ...content }: CutinProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const armKey = `${content.tone}|${content.title}`;
  const visible = useTimedVisibility(holdMs, armKey, onDone);
  const delayedShown = useDelayElapsed(CUTIN_DELAYED_LINE_MS, armKey, reduced);
  const onSkipRef = useRef(content.onSkip);
  useEffect(() => {
    onSkipRef.current = content.onSkip;
  }, [content.onSkip]);
  const skippable = visible && Boolean(content.onSkip);
  useEffect(() => {
    if (!skippable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isSkipKey(e)) return;
      e.preventDefault();
      onSkipRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [skippable]);
  return <CutinBand {...content} visible={visible} delayedShown={delayedShown} reduced={reduced} holdMs={holdMs} />;
}
