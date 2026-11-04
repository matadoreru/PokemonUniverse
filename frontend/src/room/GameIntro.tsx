import type { GameIntroView, RoomView, SkipGameIntroRequest } from '@pokemon-universe/shared/public';
import { Check, Play, UsersRound } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { audio } from '../audio';
import { HowToPlayCarousel } from '../components/HowToPlayCarousel';
import { ServerTimer } from '../components/ServerTimer';
import { gameHowToPlay } from '../games/how-to-play';
import { useServerOffset } from '../hooks/useServerTime';
import { Cutin, cx, Icon, Panel, Pill, ScreenSplit } from '../ui';
import { gameIntroProgress, introReadyLabel, introSkipLabel } from './game-intro';
import s from './GameIntro.module.css';

interface Props {
  room: RoomView;
  intro: GameIntroView;
  selfId: string;
  onSkip(request: SkipGameIntroRequest): Promise<void>;
  /** «Saltar minijuego» de la sala: en la intro va en la franja de acción (la pantalla llena el alto sin scroll). */
  skipControl?: ReactNode;
}

/**
 * Intro de partida en `GAME_STARTING` (Fase 2): cut-in con el nombre del juego, sus 3 pasos, la cuenta atrás de la sala
 * y «Empezar ya». La partida empieza al vencer el plazo o cuando todos los jugadores conectados lo han pulsado.
 */
export function GameIntro({ room, intro, selfId, onSkip, skipControl }: Props) {
  const gameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  const name = room.availableGames.find((game) => game.id === gameId)?.name ?? 'el minijuego';
  const slides = gameHowToPlay[gameId];
  const serverOffset = useServerOffset(room.serverNow);
  const progress = gameIntroProgress(intro, room.members, selfId);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  // Se llega desde el lobby, a menudo desplazado hasta «Empezar partida»: la intro empieza arriba. Quien se desplaza es el
  // `main` del armazón (la ventana no tiene scroll).
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); }, []);
  useEffect(() => { audio.play('game.start'); }, []);

  async function skip() {
    if (submitting || progress.selfSkipped) return;
    setSubmitting(true);
    // Un fallo lo anuncia el aviso global de la sala; aquí solo se libera el botón.
    try { await onSkip({ gameInstanceId: intro.gameInstanceId }); }
    catch { /* aviso global */ }
    finally { setSubmitting(false); }
  }

  // La cuenta atrás en la cabecera del carrusel, siempre a la vista con el título.
  const timer = <ServerTimer deadline={intro.endsAt} serverOffset={serverOffset} label="Empieza en" />;
  const top = <div className={s.top}>{slides
    ? <HowToPlayCarousel slides={slides} kicker="Antes de empezar" heading={`Cómo se juega a ${name}`} idPrefix="game-intro" itemLabel="paso" loop={false} compact headerAction={timer} />
    : <Panel title={name}><div className={s.fallback}><p>Prepárate: la partida empieza enseguida.</p>{timer}</div></Panel>}</div>;

  // El recuento, «Saltar minijuego» y «Empezar ya» juntos: abajo en el móvil, bajo el carrusel en escritorio.
  const action = <Panel variant="cream" as="div" bodyClassName={cx(s.actionBody)}>
    <div className={s.status}>
      <span className={s.kicker}>{progress.canSkip ? '¿Preparado?' : 'Espectador'}</span>
      <p className={s.ready} role="status" aria-live="polite">
        <Icon icon={UsersRound} size={22} />
        <span className={s.count}>{introReadyLabel(progress)}</span>
      </p>
      {!progress.canSkip && <p className={s.help}>Empieza cuando los jugadores estén listos.</p>}
    </div>
    {skipControl && <div className={s.skipGame}>{skipControl}</div>}
    {progress.canSkip && <Pill variant="yellow" size="main" className={s.go} icon={progress.selfSkipped ? Check : Play} loading={submitting} disabled={progress.selfSkipped} onClick={() => void skip()}>
      {introSkipLabel(progress.selfSkipped)}
    </Pill>}
  </Panel>;

  return <section className={cx('content-row', s.screen)} aria-labelledby={titleId}>
    {/* El encabezado de la pantalla (lo busca el foco de ruta al entrar directo): el cut-in y el carrusel ya lo enseñan. */}
    <h1 id={titleId} className="sr-only">{`Intro de ${name}`}</h1>
    {/* Sin sonido propio: la intro ya da `game.start`. Sin `onSkip`: no tapa los clics de «Empezar ya». */}
    <Cutin tone="yellow" title={name} subtitle="¡Empieza la partida!" silent />
    <div className={s.inner}>
      <div className={s.fill}><ScreenSplit fill className={cx(s.split)} top={top} bottom={action} /></div>
    </div>
  </section>;
}
