import { useEffect, useRef } from 'react';
import { audio } from '../audio';
import { cx } from './cx';
import { Bar } from './Bar';
import s from './Timer.module.css';

/** Segundos que quedan, redondeados hacia arriba y sin bajar de 0. */
export function timerSeconds(endsAt: number | null, now: number): number {
  if (endsAt == null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Urgente en los 5 últimos segundos (y solo con temporizador activo). */
export function timerUrgent(endsAt: number | null, now: number): boolean {
  return endsAt != null && timerSeconds(endsAt, now) <= 5;
}

/** Segundo (3, 2 o 1) en el que suena la cuenta atrás, o `null` si no toca: solo los 3 últimos y una vez por segundo. */
export function countdownCue(endsAt: number | null, now: number, lastCued: number | null): number | null {
  if (endsAt == null) return null;
  const secs = timerSeconds(endsAt, now);
  return secs >= 1 && secs <= 3 && secs !== lastCued ? secs : null;
}

/** Hace sonar `game.countdown` una vez por segundo en los 3 últimos; un plazo nuevo reinicia la cuenta. */
export function useCountdownCue(endsAt: number | null, now: number): void {
  const last = useRef<{ endsAt: number | null; secs: number | null }>({ endsAt, secs: null });
  useEffect(() => {
    if (last.current.endsAt !== endsAt) last.current = { endsAt, secs: null };
    const secs = countdownCue(endsAt, now, last.current.secs);
    if (secs === null) return;
    last.current.secs = secs;
    audio.play('game.countdown');
  }, [endsAt, now]);
}

export interface TimerProps {
  endsAt: number | null;
  /** Instante actual en ms; lo da quien llama (el componente no tiene reloj propio). */
  now: number;
  totalMs: number;
  label?: string;
}

export function Timer({ endsAt, now, totalMs, label = 'Tiempo restante' }: TimerProps) {
  useCountdownCue(endsAt, now);
  const secs = timerSeconds(endsAt, now);
  const urgent = timerUrgent(endsAt, now);
  return (
    <div className={cx(s.timer, urgent && s.urgent)}>
      <span className={s.num} role="timer" aria-label={`${label}: ${secs} s`}>
        {endsAt == null ? '–' : secs}
      </span>
      <Bar value={secs * 1000} max={totalMs} tone={urgent ? 'bad' : 'yellow'} label={label} decorative valueText={`${secs} s`} />
    </div>
  );
}
