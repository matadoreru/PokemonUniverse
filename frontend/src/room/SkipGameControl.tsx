import type { GameSkipStateView, SetGameSkipVoteRequest } from '@pokemon-universe/shared/public';
import { Check, SkipForward } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Pill } from '../ui';
import s from './SkipGameControl.module.css';

interface SkipGameControlProps {
  state: GameSkipStateView;
  connected: boolean;
  onSetVote(request: SetGameSkipVoteRequest): Promise<void>;
}

/** Texto que se anuncia al cambiar el recuento o el voto propio. */
export function skipAnnouncement(state: Pick<GameSkipStateView, 'votes' | 'requiredVotes' | 'currentUserVoted'>): string {
  return `${state.votes} de ${state.requiredVotes} jugadores quieren saltarlo.${state.currentUserVoted ? ' Tu voto está registrado.' : ''}`;
}

/**
 * «Saltar minijuego»: conmutador (`aria-pressed`) con el recuento de votos. La región viva empieza vacía y solo habla
 * cuando cambia el recuento o el voto propio: al montarse no repite nada.
 */
export function SkipGameControl({ state, connected, onSetVote }: SkipGameControlProps) {
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const sending = useRef(false);
  const previous = useRef({ votes: state.votes, voted: state.currentUserVoted });
  const helpId = useId();
  const disabled = !connected || !state.canVote;
  const voted = state.currentUserVoted;
  const label = voted ? 'Retirar voto para saltar el minijuego' : 'Votar para saltar el minijuego';
  const tooltip = state.canVote
    ? 'El minijuego se saltará cuando todos estén de acuerdo. Puedes retirar tu voto.'
    : 'Puedes seguir la votación, pero sólo los participantes del minijuego pueden votar.';

  useEffect(() => {
    const before = previous.current;
    if (before.votes === state.votes && before.voted === state.currentUserVoted) return;
    previous.current = { votes: state.votes, voted: state.currentUserVoted };
    setAnnouncement(skipAnnouncement(state));
  }, [state]);

  const toggleVote = async () => {
    if (disabled || sending.current) return;
    sending.current = true;
    setPending(true);
    try { await onSetVote({ gameInstanceId: state.gameInstanceId, wantsToSkip: !voted }); }
    catch { /* El fallo ya sale, traducido, en el aviso global de la sala (RoomContext). */ }
    finally { sending.current = false; setPending(false); }
  };

  return <div className={s.control} title={tooltip}>
    <Pill
      variant={voted ? 'yellow' : 'blue'}
      icon={voted ? Check : SkipForward}
      aria-label={label}
      aria-pressed={voted}
      aria-describedby={helpId}
      disabled={disabled}
      loading={pending}
      onClick={() => void toggleVote()}
    >
      {/* `data-skip-text`: en el móvil, junto a «Siguiente», `GameSkipSlot` deja solo el icono y el recuento. */}
      <span data-skip-text>{voted ? 'Cancelar voto' : 'Saltar minijuego'}</span>
      {state.votes > 0 && <span className={s.count}>{state.votes}/{state.requiredVotes}</span>}
    </Pill>
    <span id={helpId} className="sr-only">{tooltip}</span>
    <span className="sr-only" role="status">{announcement}</span>
  </div>;
}
