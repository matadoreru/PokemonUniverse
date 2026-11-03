import type { ShinyCandidateMode } from '@pokemon-universe/shared/public';
import { Clock3, Eye, Layers3, Shuffle } from 'lucide-react';

export function ShinyGameHeader({ roundNumber, totalRounds, active, showVotes, candidateMode, remainingSeconds, progress }: {
  roundNumber: number;
  totalRounds: number;
  active: boolean;
  showVotes: boolean;
  candidateMode: ShinyCandidateMode;
  remainingSeconds: number;
  progress: number;
}) {
  const urgent = active && remainingSeconds <= 5;
  const critical = active && remainingSeconds <= 3;
  return <header className="mb-4" aria-labelledby="shiny-question">
    <p className="mb-1 text-sm font-extrabold text-ink/60">Ronda {roundNumber} de {totalRounds}</p>
    <div className="flex items-start justify-between gap-3">
      <h1 id="shiny-question" className="max-w-4xl font-display text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">¿Cuál es el shiny verdadero?</h1>
      <span className={`shrink-0 rounded-full border px-3 py-1.5 font-display text-xl font-bold tabular-nums sm:px-4 sm:text-2xl ${active ? urgent ? 'border-berry/50 bg-berry/15 text-berry' : 'border-aqua/35 bg-aqua/10 text-aqua' : 'border-leaf/35 bg-leaf/10 text-leaf'} ${critical ? 'shiny-timer-critical' : ''}`} role="timer" aria-label={active ? `${remainingSeconds} segundos restantes` : `${remainingSeconds} segundos para continuar`}>
        {remainingSeconds}s
      </span>
    </div>
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <span className="permission-chip"><Eye size={14} aria-hidden="true" />{showVotes ? 'Votos públicos' : 'Votos ocultos'}</span>
      <span className="permission-chip">{candidateMode === 'SAME_POKEMON' ? <Layers3 size={14} aria-hidden="true" /> : <Shuffle size={14} aria-hidden="true" />}{candidateMode === 'SAME_POKEMON' ? 'Mismo Pokémon' : 'Pokémon diferentes'}</span>
      {active && <span className="ml-auto hidden items-center gap-1.5 text-xs font-extrabold text-ink/55 sm:inline-flex"><Clock3 size={14} aria-hidden="true" />El tiempo lo controla el servidor</span>}
    </div>
    <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-ink/15 bg-night" role="progressbar" aria-label="Tiempo restante de la ronda" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <div className={`shiny-timer-bar h-full rounded-full ${active ? urgent ? 'bg-berry' : 'bg-aqua' : 'bg-leaf'}`} style={{ width: `${progress}%` }} />
    </div>
  </header>;
}
