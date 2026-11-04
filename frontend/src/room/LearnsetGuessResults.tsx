import type { LearnsetGuessPublicState, RoomView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Equal, Lightbulb, RotateCcw, StopCircle, Trophy } from 'lucide-react';
import { learnsetRecords, learnsetStatsLine, type LearnsetRecord } from '../games/learnset-guess/presentation';
import { Chip, cx, Icon, Panel, Pill } from '../ui';
import { sharesPosition } from './results-ties';
import { playerColor } from './player-color';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/learnset-guess/LearnsetGuessResults.module.css';

/** Récord: quién y el valor grande; la línea de ayuda solo da el contexto (sin repetir el número). */
function RecordTile({ title, icon, record, unit }: { title: string; icon: LucideIcon; record: LearnsetRecord | null; unit: string }) {
  const names = record?.names.join(', ') ?? '';
  return <li className={s.record}>
    <span className={cx(s.recordIcon, record && s.recordIconOn)}><Icon icon={icon} size={24} /></span>
    <div className={s.recordText}>
      <h3 className={s.kicker}>{title}</h3>
      {record
        ? <><strong className={s.recordName} title={names}>{names}</strong><p className={s.help}>{unit}</p></>
        : <p className={s.help}>Nadie lo consiguió en esta partida.</p>}
    </div>
    {record && <strong className={s.recordValue}>{record.value}</strong>}
  </li>;
}

/**
 * Resultados de Learnset Guess: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», aciertos, fallos, porcentaje y media de cada uno) y, al lado, los récords de la partida (más
 * aciertos, más aciertos con las pistas iniciales y la mejor ronda; empates juntos). Abajo, la acción del host. Un
 * empate a cero no corona.
 */
export function LearnsetGuessResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as LearnsetGuessPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{learnsetStatsLine(standing.stats)}</span></>,
    };
  });
  const records = learnsetRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <Panel variant="cream" as="section" aria-labelledby="learnset-records-title" bodyClassName={cx(s.records)}>
    <h2 id="learnset-records-title" className={s.sectionTitle}>Récords de la partida</h2>
    <ul className={s.recordList}>
      <RecordTile title="Más aciertos" icon={CheckCircle2} record={records.correct} unit={records.correct?.value === '1' ? 'Pokémon acertado' : 'Pokémon acertados'} />
      <RecordTile title="Con las pistas iniciales" icon={Lightbulb} record={records.initial} unit="aciertos antes de la primera pista nueva" />
      <RecordTile title="Mejor ronda" icon={Trophy} record={records.bestRound} unit="puntos en una sola ronda" />
    </ul>
  </Panel>;
  const actions = host
    ? <><Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>Continuar sesión</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <p className={s.waiting}>Esperando a que el host continúe la sesión…</p>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Learnset Guess" subtitle={`Learnset Guess · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
