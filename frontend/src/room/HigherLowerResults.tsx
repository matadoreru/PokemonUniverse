import type { HigherLowerPublicState, RoomView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Equal, Flame, RotateCcw, StopCircle, Target } from 'lucide-react';
import { higherLowerRecord, type HigherLowerRecord } from '../games/higher-lower/presentation';
import { cx, Icon, Panel, Pill } from '../ui';
import { higherLowerStatsLine } from './higher-lower-labels';
import { playerColor } from './player-color';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/higher-lower/HigherLowerResults.module.css';

const RECORDS: { key: string; title: string; icon: LucideIcon; unit: (value: number) => string }[] = [
  { key: 'bestStreak', title: 'Mejor racha', icon: Flame, unit: (value) => value === 1 ? 'acierto seguido' : 'aciertos seguidos' },
  { key: 'sameCorrect', title: 'Iguales acertados', icon: Equal, unit: (value) => value === 1 ? 'igual' : 'iguales' },
  { key: 'accuracy', title: 'Mejor precisión', icon: Target, unit: () => 'de aciertos' },
];

function RecordTile({ title, icon, record, unit, percent }: { title: string; icon: LucideIcon; record: HigherLowerRecord | null; unit: (value: number) => string; percent: boolean }) {
  const names = record?.names.join(', ') ?? '';
  return <li className={s.record}>
    <span className={cx(s.recordIcon, record && s.recordIconOn)}><Icon icon={icon} size={24} /></span>
    <div className={s.recordText}>
      <h3 className={s.kicker}>{title}</h3>
      {record
        ? <><strong className={s.recordName} title={names}>{names}</strong><p className={s.help}>{percent ? `${record.value}%` : record.value} {unit(record.value)}</p></>
        : <p className={s.help}>Nadie lo consiguió en esta partida.</p>}
    </div>
    {record && <strong className={s.recordValue} aria-hidden="true">{percent ? `${record.value}%` : record.value}</strong>}
  </li>;
}

/**
 * Resultados de Higher or Lower: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», aciertos, iguales, mejor racha y precisión de cada uno) y, al lado, los récords de la partida (mejor
 * racha, iguales acertados y mejor precisión; empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 */
export function HigherLowerResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as HigherLowerPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <span>{higherLowerStatsLine(standing.stats)}</span>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const aside = <Panel variant="cream" as="section" aria-labelledby="higher-lower-records-title" bodyClassName={cx(s.records)}>
    <h2 id="higher-lower-records-title" className={s.sectionTitle}>Récords de la partida</h2>
    <ul className={s.recordList}>{RECORDS.map((record) => <RecordTile key={record.key} title={record.title} icon={record.icon} unit={record.unit} percent={record.key === 'accuracy'} record={higherLowerRecord(entries, record.key)} />)}</ul>
  </Panel>;
  const actions = host
    ? <><Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>Continuar sesión</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <p className={s.waiting}>Esperando al host…</p>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Higher or Lower" subtitle={`Higher or Lower · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
