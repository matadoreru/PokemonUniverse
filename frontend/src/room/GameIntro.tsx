import type { RoomView } from '@pokemon-universe/shared/public';
import { Check, Eye, Hourglass, UsersRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { GameArt } from '../games/GameArt';
import { useSfxCue } from '../hooks/useSfxCue';
import { useServerOffset } from '../hooks/useServerTime';
import { playerColor } from '../lib/player-color';
import { Badge, Chip, cx, Icon, Panel, Pill, Row, ScreenSplit } from '../ui';
import { activeGameId, activeGameManifest, introActionTitle, introAnnouncement, introStatus } from './game-intro';
import s from './GameIntro.module.css';

export interface GameIntroProps {
  room: RoomView;
  selfId: string;
  /** `room:intro-ready` de la partida `gameInstanceId`; su fallo ya sale en el aviso de la sala. */
  onReady(gameInstanceId: string): Promise<void>;
  /** «Saltar minijuego» (`GameSkipSlot`): la intro lo lleva dentro, como las pantallas de juego. */
  skip?: ReactNode;
}

/**
 * Intro de partida (E1): antes de la primera ronda, el nombre y el arte del juego, sus tres reglas («Cómo se juega»),
 * la cuenta atrás y «¡Listo!». Termina al vencer el plazo o cuando todos los jugadores conectados están listos; los
 * espectadores la ven, pero no cuentan. Una sola región viva: el juego y cuántos están listos.
 */
export function GameIntro({ room, selfId, onReady, skip }: GameIntroProps) {
  const manifest = activeGameManifest(room);
  const gameId = activeGameId(room);
  const name = manifest?.name ?? 'Partida';
  const rules = manifest?.howTo ?? [];
  const status = introStatus(room, selfId);
  const serverOffset = useServerOffset(room.serverNow);
  const instanceId = room.gameSkipState?.gameInstanceId ?? null;
  const [sending, setSending] = useState(false);
  // `useSfxCue` nunca suena en el primer render: la clave aparece tras montar, así suena al entrar en la intro.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useSfxCue('game.start', mounted ? instanceId ?? 'intro' : null);
  const players = (room.intro?.playerIds ?? []).map((id) => ({ id, member: room.members.find((member) => member.id === id), ready: room.intro?.readyPlayerIds.includes(id) ?? false }));
  const kicker = room.daily ? 'Reto diario' : `Partida ${room.gamesPlayed + 1}`;

  async function markReady() {
    if (!instanceId || sending || status.ready) return;
    setSending(true);
    try { await onReady(instanceId); }
    catch { /* aviso global de la sala */ }
    finally { setSending(false); }
  }

 const top = <div className={s.top}><Panel variant="dark" as="section" aria-labelledby="game-intro-title" className={cx(s.hero)} bodyClassName={cx(s.heroBody)}>
    <div className={s.head}>
      <span className={s.art}><GameArt gameId={gameId} size={32} /></span>
      <div className={s.headText}>
        <span className={s.kicker}>{kicker} · Cómo se juega</span>
        <h1 id="game-intro-title" className={cx(s.title, 'ol')}>{name}</h1>
      </div>
    </div>
    <ol className={s.rules}>
      {rules.map((rule, index) => <li key={index} className={s.rule}>
        <span className={s.ruleNumber} aria-hidden="true">{index + 1}</span>
        <span className={s.ruleText}>{rule}</span>
      </li>)}
    </ol>
  </Panel></div>;

  const side = <Panel title="Jugadores" right={<Chip tone="info" icon={<Icon icon={UsersRound} size={18} />}><span className={s.tabular}>{status.readyCount}/{status.total} listos</span></Chip>} scroll scrollLabel="Jugadores de la partida" className={cx(s.sidePanel)}>
    <ul className={s.players}>
      {players.map(({ id, member, ready }, index) => <li key={id}>
        <Row avatar={<Avatar name={member?.displayName ?? '?'} avatar={member?.avatar} size="sm" />} name={member?.displayName ?? 'Jugador'} self={id === selfId} color={playerColor(index)}
          value={ready ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>¡Listo!</Chip> : <Chip tone="neutral" icon={<Icon icon={Hourglass} size={18} />}>Leyendo</Chip>} />
      </li>)}
    </ul>
  </Panel>;

  const action = <Panel variant="cream" as="div" bodyClassName={cx(s.actionBody)}>
    <div className={s.status}>
      <p className={s.actionTitle}>{introActionTitle(status)}</p>
      <p className={s.help}>{status.counts ? 'La partida empieza al acabar la cuenta atrás o cuando todos estéis listos.' : 'La partida empieza al acabar la cuenta atrás o cuando los jugadores estén listos.'}</p>
    </div>
    <div className={s.controls}>
      <div className={s.clock}><ServerTimer deadline={room.intro?.endsAt ?? null} serverOffset={serverOffset} label="Empieza en" /></div>
      <div className={s.ready}>
        {status.counts
          ? <Pill variant="yellow" size="main" block icon={Check} loading={sending} disabled={status.ready || !instanceId} onClick={() => void markReady()}>{status.ready ? 'Listo' : '¡Listo!'}</Pill>
          : <Badge tone="navy"><Icon icon={Eye} size={18} />Espectador</Badge>}
      </div>
      {skip && <div className={s.skip}>{skip}</div>}
    </div>
  </Panel>;

  return <div className={cx('content-row', s.screen)} data-testid="game-intro">
    <p className="sr-only" role="status" aria-live="polite">{introAnnouncement(name, status)}</p>
    <ScreenSplit fill top={top} side={side} bottom={action} />
  </div>;
}
