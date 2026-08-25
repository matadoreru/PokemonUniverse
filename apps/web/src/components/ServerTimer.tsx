import { Clock3 } from 'lucide-react';
import { memo } from 'react';
import { useRemainingMs } from '../hooks/useServerTime';

export const ServerTimer = memo(function ServerTimer({ deadline, serverOffset, label = 'Tiempo' }: { deadline: number | null; serverOffset: number; label?: string }) {
  const remaining = Math.ceil(useRemainingMs(deadline, serverOffset, 250) / 1_000);
  return <div className="text-center" role="timer" aria-label={`${remaining} segundos restantes`}><span className="block text-[10px] font-black uppercase tracking-[.15em] text-ink/60">{label}</span><strong className={`inline-flex min-w-[4.5ch] items-center justify-center gap-1.5 font-display text-3xl tabular-nums ${remaining <= 5 ? 'pokeddle-timer-urgent text-berry' : remaining <= 10 ? 'text-electric' : 'text-aqua'}`}><Clock3 size={21} />{remaining}s</strong></div>;
});
