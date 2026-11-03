import type { GameSkipStateView, SetGameSkipVoteRequest } from '@pokemon-universe/shared/public';
import { Check, LoaderCircle, SkipForward } from 'lucide-react';
import { useId, useRef, useState } from 'react';

interface SkipGameControlProps {
  state: GameSkipStateView;
  connected: boolean;
  onSetVote(request: SetGameSkipVoteRequest): Promise<void>;
}

export function SkipGameControl({ state, connected, onSetVote }: SkipGameControlProps) {
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const helpId = useId();
  const disabled = pending || !connected || !state.canVote;
  const voted = state.currentUserVoted;
  const label = voted ? 'Retirar voto para saltar el minijuego' : 'Votar para saltar el minijuego';
  const tooltip = state.canVote
    ? 'El minijuego se saltará cuando todos estén de acuerdo. Puedes retirar tu voto.'
    : 'Puedes seguir la votación, pero sólo los participantes del minijuego pueden votar.';

  const toggleVote = async () => {
    if (disabled || sending.current) return;
    sending.current = true;
    setPending(true);
    try { await onSetVote({ gameInstanceId: state.gameInstanceId, wantsToSkip: !voted }); }
    catch { /* RoomContext publishes the server error through the global room alert. */ }
    finally { sending.current = false; setPending(false); }
  };

  return <div className="min-w-0" title={tooltip}>
    <button
      type="button"
      aria-label={label}
      aria-pressed={voted}
      aria-describedby={helpId}
      disabled={disabled}
      onClick={() => void toggleVote()}
      className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${voted ? 'border-aqua/45 bg-aqua/10 text-aqua hover:bg-aqua/15' : 'border-ink/15 bg-surface-raised text-ink/70 hover:border-ink/30 hover:bg-ink/[.07] hover:text-ink'}`}
    >
      {pending ? <LoaderCircle className="shrink-0 animate-spin motion-reduce:animate-none" size={17} aria-hidden="true" /> : voted ? <Check className="shrink-0" size={17} aria-hidden="true" /> : <SkipForward className="shrink-0" size={17} aria-hidden="true" />}
      <span>{voted ? 'Cancelar voto' : 'Saltar minijuego'}</span>
      {state.votes > 0 && <span className="shrink-0 rounded-full bg-ink/[.08] px-2 py-0.5 tabular-nums text-ink/75">{state.votes}/{state.requiredVotes}</span>}
    </button>
    <span id={helpId} className="sr-only">{tooltip}</span>
    <span className="sr-only" role="status">{state.votes} de {state.requiredVotes} jugadores quieren saltarlo.{voted ? ' Tu voto está registrado.' : ''}</span>
  </div>;
}
