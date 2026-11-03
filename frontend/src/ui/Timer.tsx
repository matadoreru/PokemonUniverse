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

export interface TimerProps {
  endsAt: number | null;
  /** Instante actual en ms; lo da quien llama (el componente no tiene reloj propio). */
  now: number;
  totalMs: number;
  label?: string;
}

export function Timer({ endsAt, now, totalMs, label = 'Tiempo restante' }: TimerProps) {
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
