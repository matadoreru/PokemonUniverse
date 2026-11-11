import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import s from './Confetti.module.css';

const COLORS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--ok)', 'var(--info)', 'var(--orange)'] as const;

export interface ConfettiPiece {
  /** Posición horizontal de salida, en % del ancho. */
  x: number;
  /** Desvío lateral al caer, en px. */
  drift: number;
  /** Giro total, en grados. */
  spin: number;
  /** Retraso de salida, en ms. */
  delay: number;
  /** Duración de la caída, en ms. */
  duration: number;
  color: string;
  /** Ancho del papelito, en px (el alto es la mitad o el doble). */
  size: number;
  tall: boolean;
}

/** Papelitos deterministas (sin `Math.random`): la misma semilla da la misma ráfaga, también en las pruebas. */
export function confettiPieces(count: number, seed = 1): ConfettiPiece[] {
  let state = (seed >>> 0) || 1;
  const next = () => {
    // xorshift32: suficiente para repartir los papelitos.
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    x: Math.round(next() * 1000) / 10,
    drift: Math.round((next() - 0.5) * 240),
    spin: Math.round((next() - 0.5) * 1440),
    delay: Math.round(next() * 400),
    duration: 1600 + Math.round(next() * 1200),
    color: COLORS[index % COLORS.length]!,
    size: 8 + Math.round(next() * 6),
    tall: next() > 0.5,
  }));
}

/**
 * Lluvia de confeti para celebrar (p. ej. un acierto exacto): papelitos que caen desde arriba de la pantalla con solo
 * `transform` y `opacity`, en una capa fija que no recibe clics ni crea desplazamiento. Es decorativa (`aria-hidden`):
 * el acierto lo dice el texto de la pantalla. Con «reducir movimiento» no se pinta. Para repetirla, cambia su `key`.
 * A toda la pantalla se monta en el `body` (tras el primer render): así ningún contenedor con `container-type` o
 * `transform` la encierra.
 */
export function Confetti({ count = 60, seed = 1, contained = false, className }: { count?: number; seed?: number; /** Dentro de su contenedor posicionado en vez de toda la pantalla (galería). */ contained?: boolean; className?: string | undefined }) {
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => { if (!contained) setBody(document.body); }, [contained]);
  const layer = <ConfettiLayer count={count} seed={seed} contained={contained} className={className} />;
  return body ? createPortal(layer, body) : layer;
}

function ConfettiLayer({ count, seed, contained, className }: { count: number; seed: number; contained: boolean; className: string | undefined }) {
  return <div className={cx(s.layer, contained && s.contained, className)} aria-hidden="true" data-testid="confetti">
    {confettiPieces(count, seed).map((piece, index) => <i key={index} className={s.piece} style={{
      left: `${piece.x}%`,
      width: `${piece.size}px`,
      height: `${piece.tall ? piece.size * 2 : Math.round(piece.size / 2)}px`,
      background: piece.color,
      '--drift': `${piece.drift}px`,
      '--spin': `${piece.spin}deg`,
      animationDelay: `${piece.delay}ms`,
      animationDuration: `${piece.duration}ms`,
    } as CSSProperties} />)}
  </div>;
}
