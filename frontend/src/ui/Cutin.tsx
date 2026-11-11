import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { audio } from '../audio';
import { useReducedMotion } from '../lib/motion';
import { useDelayElapsed, useTimedVisibility } from '../hooks/useTimedVisibility';
import { cx } from './cx';
import s from './Cutin.module.css';

export type CutinTone = 'yellow' | 'red' | 'info' | 'ok';

/** Duración por defecto de la capa (entrada, pausa y salida): la de `--t-cutin` en tokens.css. */
export const CUTIN_HOLD_MS = 1_400;
/** Pausa antes de la `delayedLine`. */
export const CUTIN_DELAYED_LINE_MS = 1_000;

interface CutinContent {
  tone: CutinTone;
  title: string;
  subtitle?: string | undefined;
  media?: ReactNode;
  delayedLine?: string | undefined;
  /** Tono que toma la losa al aparecer la `delayedLine` (para que el color no la adelante). */
  delayedTone?: CutinTone | undefined;
  onSkip?: (() => void) | undefined;
  /** Clase extra del elemento raíz visible. */
  className?: string | undefined;
  /**
   * Región viva (`role="status"` asertiva, por defecto). Con `false`, sin rol: para una pantalla que ya dice lo mismo
   * en su única región viva. Oculta entonces no deja nada montado.
   */
  live?: boolean | undefined;
}

export interface CutinProps extends CutinContent {
  holdMs?: number;
  reducedMotion?: boolean;
  /** Sin `game.cutin` al aparecer: el sonido de ese momento ya tiene otro dueño (p. ej. el `game.reveal` de la sala). */
  silent?: boolean | undefined;
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
 * siguiente anuncio cae en una región viva que ya existe. La `delayedLine` no está en el DOM hasta `delayedShown`. La
 * losa visible lleva `data-layer="cutin"` y `data-tone` con el tono que se ve (los E2E los leen).
 */
export function CutinBand({
  visible,
  delayedShown,
  reduced,
  tone,
  title,
  subtitle,
  media,
  delayedLine,
  delayedTone,
  holdMs = CUTIN_HOLD_MS,
  onSkip,
  className,
  live = true,
}: CutinBandProps) {
  const region = live ? { role: 'status', 'aria-live': 'assertive' as const } : {};
  if (!visible) return live ? <div className={s.srOnly} {...region} data-layer="cutin" /> : null;
  const shownTone = delayedTone && delayedShown ? delayedTone : tone;
  // La salida por la derecha empieza `--t-screen` antes de que el temporizador la desmonte.
  const style = { '--cutin-hold': `${holdMs}ms` } as CSSProperties;
  return (
    <div
      className={cx(className, s.cutin, s[shownTone], onSkip && s.skippable)}
      {...region}
      data-layer="cutin"
      data-tone={shownTone}
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

const SKIP_IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']);

/**
 * Espacio salta el cut-in: sin repetición ni modificadores, y no si el foco está en un campo, botón o enlace (ahí
 * Espacio ya tiene su propio efecto).
 */
export function isSkipKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'>): boolean {
  if (e.key !== ' ' && e.code !== 'Space') return false;
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const t = e.target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  } | null;
  if (!t) return true;
  if (t.isContentEditable || SKIP_IGNORED_TAGS.has(t.tagName ?? '')) return false;
  return t.getAttribute?.('role') !== 'button';
}

/**
 * Losa azul noche a todo el ancho, con bordes del tono, que entra desde la izquierda, se para y sale por la derecha.
 * Se oculta con un temporizador a los `holdMs` (nunca con `animationend`) y no bloquea la pantalla: solo intercepta
 * el puntero si se puede saltar (`onSkip`: clic o Espacio). Un `title` o `tone` nuevos la vuelven a mostrar (el nuevo
 * sustituye al actual); para repetir la misma, móntala con `key`. Con reducción de movimiento aparece sin desplazarse
 * y la `delayedLine` se monta al momento.
 */
export function Cutin({ holdMs = CUTIN_HOLD_MS, reducedMotion, silent = false, onDone, ...content }: CutinProps) {
  const prefersReduced = useReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const armKey = `${content.tone}|${content.title}`;
  const visible = useTimedVisibility(holdMs, armKey, onDone);
  // Suena al aparecer (y con cada anuncio nuevo), también con reducción de movimiento; con `silent`, nunca.
  useEffect(() => { if (!silent) audio.play('game.cutin'); }, [armKey, silent]);
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
