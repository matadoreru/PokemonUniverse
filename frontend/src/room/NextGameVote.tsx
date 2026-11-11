import { gameCountsDouble, gameModeCatalog, supportsPlayerCount, type RoomView } from '@pokemon-universe/shared/public';
import { Check, Flame, StopCircle, Trophy, UsersRound, Vote } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Badge, Card, Chip, MomentCutin, cx, Icon, Panel, Pill, Row, ScreenSplit } from '../ui';
import { GameArt } from '../games/GameArt';
import { gameAvailabilityReason } from './GameSelectionConfig';
import { summarizeGameConfig } from './game-config-summary';
import { voteActionStatus, voteOptionName, votesLabel } from './next-game-vote';
import { sessionPodium } from './session-results';
import s from './NextGameVote.module.css';

export function NextGameVote({ room, selfId, onVote, onEnd }: { room: RoomView; selfId: string; onVote(optionId: string): Promise<void>; onEnd(): void }) {
  const vote = room.nextGameVote!;
  const active = room.phase === 'NEXT_GAME_VOTE';
  const [draft, setDraft] = useState<string | null>(vote.ownVoteOptionId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const serverOffset = useServerOffset(room.serverNow);
  const revealRemainingMs = useRemainingMs(vote.nextTransitionAt, serverOffset, 250);
  const host = room.hostId === selfId;
  const eligible = vote.eligibleVoterIds.includes(selfId);
  const canVote = active && eligible && !vote.ownVoteOptionId;
  const playerCount = room.members.filter((member) => member.presence === 'CONNECTED').length;
  const standings = sessionPodium(room, selfId).standings;
  // Cada opción es un par juego y modo: los votos, el recuento y el ganador van por id de opción.
  const optionName = (id: string | null) => {
    const option = id ? vote.options.find((candidate) => candidate.id === id) : undefined;
    return option ? voteOptionName(option, vote.options) : null;
  };
  const resolvedName = optionName(vote.resolvedOptionId);
  const status = voteActionStatus({ active, eligible, ownVote: optionName(vote.ownVoteOptionId), draftName: optionName(draft), resolvedName, revealSeconds: Math.ceil(revealRemainingMs / 1_000) });

  async function confirmVote() {
    if (!draft || !canVote || submitting) return;
    const selectedGame = vote.options.find((option) => option.id === draft)?.game;
    if (!selectedGame || !supportsPlayerCount(selectedGame, playerCount)) { setError('Ese minijuego ya no admite el número actual de jugadores.'); return; }
    setSubmitting(true); setError('');
    // Un rechazo del servidor sale, traducido, en el aviso global de la sala; en línea solo la validación de arriba.
    try { await onVote(draft); }
    catch { /* aviso global */ }
    finally { setSubmitting(false); }
  }

  const top = <div className={s.main}>
    <header className={s.head}>
      <div className={s.headText}>
        <span className={s.eyebrow}>Partida {room.gamesPlayed} completada</span>
        <h1 className={s.title}>Elige el siguiente minijuego</h1>
        <p className={s.lead}>El más votado será el próximo. En caso de empate, decide el azar.</p>
        {gameCountsDouble(room.sessionMode, room.gamesPlayed + 1) && <span className={s.double}><Badge><Icon icon={Flame} size={18} />Última partida: vale doble</Badge></span>}
      </div>
      <div className={s.clock}>
        {active ? <ServerTimer deadline={vote.endsAt} serverOffset={serverOffset} label="Para votar" /> : <Badge tone="yellow"><Icon icon={Check} size={18} />Elegido</Badge>}
        <Chip tone="info" icon={<Icon icon={UsersRound} size={18} />}><span className={s.tabular}>{vote.votedPlayerIds.length}/{vote.eligibleVoterIds.length} votos</span></Chip>
      </div>
    </header>
    <ul className={s.grid} aria-label="Opciones de voto">
      {vote.options.map((option) => {
        const { game } = option;
        const selected = (vote.ownVoteOptionId ?? draft) === option.id;
        const winner = vote.resolvedOptionId === option.id;
        const tally = vote.tallies?.[option.id] ?? 0;
        const unavailableReason = active ? gameAvailabilityReason(game, playerCount) : null;
        // Un modo que no es Clásico explica sus reglas en lugar del resumen de ajustes (que son los del lobby).
        const modeText = option.mode ? gameModeCatalog(game.id)?.texts[option.mode] : undefined;
        // Votando: la carta es el conmutador; votado o revelado, carta sin botón (el ganador se resalta en amarillo).
        const choice = canVote ? { onSelect: () => setDraft(option.id), disabled: submitting || Boolean(unavailableReason) } : {};
        return <li key={option.id} className={cx(s.cell, !active && !winner && s.lost)}>
          <Card art={<GameArt gameId={game.id} size={32} />} name={voteOptionName(option, vote.options)} state={(active ? selected : winner) ? 'selected' : 'idle'} {...choice}>
            {(winner || selected || game.recommended || game.experimental) && <span className={s.badges}>
              {winner && <Badge tone="navy"><Icon icon={Trophy} size={18} />Ganador</Badge>}
              {selected && <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Tu voto</Chip>}
              {game.recommended && <Badge>TOP</Badge>}
              {game.experimental && <Badge tone="red">BETA</Badge>}
            </span>}
            <span className={cx(s.desc, unavailableReason && s.bad)}>{unavailableReason ?? game.description}</span>
            {!unavailableReason && <span className={s.config}>{modeText ?? summarizeGameConfig(room.gameConfigs?.[game.id])}</span>}
            {!active && <span className={s.tally}><Badge tone={winner ? 'yellow' : 'cream'}><Icon icon={Vote} size={18} />{votesLabel(tally)}</Badge></span>}
          </Card>
        </li>;
      })}
    </ul>
  </div>;

  // En la votación ya no hay partida (`room.game` es nulo): la columna lleva la clasificación de la sesión.
  const side = <Panel title="Clasificación de la sesión" aria-label="Clasificación de la sesión" scroll className={cx(s.sidePanel)} status={standings.length > 0 ? null : { kind: 'empty', title: 'Sin puntos todavía', text: 'Cada partida reparte puntos de sesión según el puesto.' }}>
    <ol className={s.previous}>
      {standings.map((standing) => <li key={standing.id}>
        <Row rank={standing.position} avatar={<Avatar name={standing.name} avatar={standing.avatar} size="sm" />} name={standing.name} self={standing.id === selfId} value={`${standing.points} pts`} {...(standing.color ? { color: standing.color } : {})} />
      </li>)}
    </ol>
  </Panel>;

  const action = <Panel variant="cream" as="div" bodyClassName={cx(s.actionBody)}>
    <div className={s.status}>
      <span className={s.kicker}>{status.kicker}</span>
      {/* Región viva siempre montada (existe antes del revelado, así el resultado se anuncia): solo el título; la cuenta
          atrás (cambia cada segundo) queda fuera. Votando lee también «Has elegido…» y «Tu voto está registrado.». */}
      <p className={s.actionTitle} role="status" aria-live="polite">{status.title}</p>
      <p className={s.help}>{status.text}</p>
    </div>
    {error && <p role="alert" className={s.alert}>{error}</p>}
    <div className={s.buttons}>
      {canVote && <Pill variant="yellow" size="main" icon={Vote} loading={submitting} disabled={!draft} onClick={() => void confirmVote()}>Confirmar voto</Pill>}
      {host && <Pill variant="danger" icon={StopCircle} className={s.end} title="Terminar sesión" onClick={onEnd}><span className={s.endLabel}>Terminar sesión</span></Pill>}
    </div>
  </Panel>;

  return <div className={cx('content-row', s.screen)}>
    {/* Sin región viva propia: el título de la placa ya dice «La sala ha elegido…». */}
    {!active && resolvedName && <MomentCutin key={vote.resolvedOptionId} tone="ok" title={resolvedName} subtitle="Siguiente minijuego" />}
    <ScreenSplit fill top={top} side={side} bottom={action} />
  </div>;
}
