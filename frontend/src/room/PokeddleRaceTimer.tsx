import { Clock3 } from 'lucide-react';
import { memo } from 'react';
import { useRemainingMs } from '../hooks/useServerTime';

export function getPokeddleTimerUrgency(remaining: number, active: boolean): 'normal' | 'warning' | 'urgent' {
  if (!active || remaining > 10) return 'normal';
  return remaining <= 5 ? 'urgent' : 'warning';
}

export const PokeddleRaceTimer = memo(function PokeddleRaceTimer({ deadline, serverOffset, active }: { deadline: number | null; serverOffset: number; active: boolean }) {
  const remaining = Math.ceil(useRemainingMs(deadline, serverOffset, 250) / 1_000);
  const urgency = getPokeddleTimerUrgency(remaining, active);
  return <div className="min-w-0 text-center" data-timer-state={urgency} role="timer" aria-label={`${remaining} segundos restantes`}>
    <span className="mb-0.5 block text-[10px] font-black uppercase tracking-[.14em] text-ink/60">{active ? 'Tiempo' : 'Siguiente ronda'}</span>
    <strong className={`inline-flex min-w-[4.5ch] items-center justify-center gap-1.5 whitespace-nowrap font-display text-3xl tabular-nums sm:text-[2rem] ${urgency === 'urgent' ? 'pokeddle-timer-urgent text-berry' : urgency === 'warning' ? 'text-electric' : 'text-aqua'}`}><Clock3 size={21} aria-hidden="true" />{remaining}s</strong>
  </div>;
});
