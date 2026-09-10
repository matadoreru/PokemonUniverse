import type { ShinyOption, ShinyOptionId, ShinyVote } from '@pokemon-universe/shared';
import { Check, CheckCircle2, Eye, Send, Sparkles, TimerOff, XCircle } from 'lucide-react';

function OptionIdentity({ option }: { option: ShinyOption }) {
  return <span className="inline-flex min-w-0 items-center gap-2">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-electric font-display font-bold text-night">{option.id}</span>
    <strong className="truncate font-display text-lg">{option.pokemonName}</strong>
  </span>;
}

export function ShinyVoteStatus({ active, reveal, participant, selectedOption, ownVote, correctOptionId, points, submitting, error, transitionLabel, transitionRemaining, onConfirm }: {
  active: boolean;
  reveal: boolean;
  participant: boolean;
  selectedOption: ShinyOption | null;
  ownVote: ShinyVote | null;
  correctOptionId: ShinyOptionId | null;
  points: number;
  submitting: boolean;
  error: string;
  transitionLabel: string;
  transitionRemaining: number;
  onConfirm(): void;
}) {
  if (reveal && correctOptionId) {
    const correct = ownVote?.optionId === correctOptionId;
    return <section className={`shiny-round-result mt-3 rounded-2xl border px-3 py-3 sm:px-4 ${correct ? 'border-leaf/45 bg-leaf/[.08]' : 'border-berry/35 bg-berry/[.06]'}`} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${correct ? 'bg-leaf/15 text-leaf' : participant ? 'bg-berry/[.12] text-berry' : 'bg-aqua/10 text-aqua'}`}>{correct ? <CheckCircle2 size={23} /> : ownVote ? <XCircle size={23} /> : participant ? <TimerOff size={22} /> : <Sparkles size={22} />}</span>
        <span className="min-w-0 flex-1">
          <strong className={`block font-display text-xl ${correct ? 'text-leaf' : 'text-ink'}`}>{correct ? '¡Correcto!' : ownVote ? 'No era ese shiny' : participant ? 'Tiempo agotado' : 'Shiny revelado'}</strong>
          <span className="block text-sm font-bold text-ink/65">{ownVote ? <>Tu elección: <strong>{ownVote.optionId}</strong> · Respuesta correcta: <strong>{correctOptionId}</strong></> : <>Respuesta correcta: <strong>{correctOptionId}</strong></>}</span>
        </span>
        {correct && <strong className="shiny-score-update rounded-full bg-leaf/15 px-3 py-1.5 font-display text-lg text-leaf">+{points} puntos</strong>}
        <span className="w-full text-right text-xs font-extrabold text-ink/55 sm:w-auto">{transitionLabel} en {transitionRemaining}s</span>
      </div>
    </section>;
  }

  if (!active) return <section className="mt-3 rounded-2xl border border-ink/10 bg-surface px-4 py-3 text-center font-bold text-ink/65" role="status">Preparando la ronda…</section>;

  if (!participant) return <section className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-aqua/25 bg-aqua/[.07] px-4 py-3 text-center font-bold"><Eye className="shrink-0 text-aqua" size={20} />Estás viendo la votación como espectador.</section>;

  if (ownVote) return <section className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-leaf/35 bg-leaf/[.08] px-4 py-3 text-center font-extrabold text-leaf" role="status" aria-live="polite"><Check size={20} />Voto confirmado: <span className="grid h-7 w-7 place-items-center rounded-lg bg-electric font-display text-night">{ownVote.optionId}</span></section>;

  return <>
    <section className="shiny-confirmation mt-3 flex flex-col gap-3 rounded-2xl border border-ink/[.12] bg-surface px-3 py-3 shadow-card sm:flex-row sm:items-center sm:px-4" aria-label="Confirmar voto">
      <span className="min-w-0 flex-1 text-center sm:text-left">
        <span className="block text-sm font-bold text-ink/60">{selectedOption ? 'Has seleccionado' : 'Selecciona uno de los Pokémon'}</span>
        {selectedOption && <OptionIdentity option={selectedOption} />}
        <span className="mt-0.5 hidden text-xs font-bold text-ink/45 md:block">Atajos: A–F o 1–6 · Enter confirma</span>
      </span>
      <button type="button" className="btn-primary w-full shrink-0 sm:w-auto" disabled={!selectedOption || submitting} aria-keyshortcuts="Enter" onClick={onConfirm}>
        {submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />Confirmando…</> : <><Send size={17} />Confirmar voto</>}
      </button>
    </section>
    {error && <p className="status-error mt-2 text-center" role="alert">{error}</p>}
  </>;
}
