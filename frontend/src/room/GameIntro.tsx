import type { GameIntroView, RoomView, SkipGameIntroRequest } from '@pokemon-universe/shared/public';
import { Check, LoaderCircle, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HowToPlayCarousel } from '../components/HowToPlayCarousel';
import { ServerTimer } from '../components/ServerTimer';
import { gameHowToPlay } from '../games/how-to-play';
import { useServerOffset } from '../hooks/useServerTime';
import { gameIntroProgress, introReadyLabel, introSkipLabel } from './game-intro';

interface Props {
  room: RoomView;
  intro: GameIntroView;
  selfId: string;
  onSkip(request: SkipGameIntroRequest): Promise<void>;
}

/**
 * Intro de partida en `GAME_STARTING` (Fase 2): los 3 pasos del minijuego, la cuenta atrás de la sala y «Saltar».
 * La partida empieza al vencer el plazo o cuando todos los jugadores conectados han saltado.
 */
export function GameIntro({ room, intro, selfId, onSkip }: Props) {
  const gameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  const name = room.availableGames.find((game) => game.id === gameId)?.name ?? 'el minijuego';
  const slides = gameHowToPlay[gameId];
  const serverOffset = useServerOffset(room.serverNow);
  const progress = gameIntroProgress(intro, room.members, selfId);
  const [submitting, setSubmitting] = useState(false);
  // Se llega desde el lobby, a menudo desplazado hasta «Empezar partida»: la intro empieza arriba, bajo la cabecera.
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  async function skip() {
    if (submitting || progress.selfSkipped) return;
    setSubmitting(true);
    // Un fallo lo anuncia el aviso global de la sala; aquí solo se libera el botón.
    try { await onSkip({ gameInstanceId: intro.gameInstanceId }); }
    catch { /* aviso global */ }
    finally { setSubmitting(false); }
  }

  // Cabecera del carrusel: cuenta atrás, «Empezar ya» y recuento juntos, siempre a la vista con la navegación de pasos.
  const actions = <div className="flex shrink-0 flex-col items-end gap-2">
    <ServerTimer deadline={intro.endsAt} serverOffset={serverOffset} label="Empieza en" />
    {progress.canSkip
      ? <button type="button" className="btn-primary whitespace-nowrap" onClick={() => void skip()} disabled={progress.selfSkipped} aria-busy={submitting || undefined}>
        {submitting ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : progress.selfSkipped && <Check size={18} aria-hidden="true" />}
        {introSkipLabel(progress.selfSkipped)}
      </button>
      : <p className="max-w-[9rem] text-right text-sm font-bold text-ink/65">Empieza cuando los jugadores estén listos.</p>}
    <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink/70" role="status" aria-live="polite">
      <UsersRound size={16} aria-hidden="true" />
      <span className="tabular-nums">{introReadyLabel(progress)}</span>
    </p>
  </div>;

  return <section className="page-shell max-w-3xl py-3 sm:py-4" aria-label={`Intro de ${name}`}>
    {slides
      ? <HowToPlayCarousel slides={slides} kicker="Antes de empezar" heading={`Cómo se juega a ${name}`} idPrefix="game-intro" itemLabel="paso" loop={false} compact headerAction={actions} />
      : <div className="card flex items-start justify-between gap-3"><h2 className="font-display text-2xl sm:text-3xl">{name}</h2>{actions}</div>}
  </section>;
}
