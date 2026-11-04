import type { RoomView, TypeDuelPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Equal, Percent, RotateCcw, StopCircle, Swords, Timer } from 'lucide-react';
import { higherLowerTied } from '../games/higher-lower/presentation';
import { typeDuelRecords, typeDuelStatsLine, type TypeDuelRecord } from '../games/type-duel/presentation';
import { Chip, cx, Icon, Panel, Pill } from '../ui';
import { playerColor } from './player-color';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/type-duel/TypeDuelResults.module.css';

function RecordTile({ title, icon, record, unit }: { title: string; icon: LucideIcon; record: TypeDuelRecord | null; unit: string }) {
  const names = record?.names.join(', ') ?? '';
  return <li className={s.record}>
    <span className={cx(s.recordIcon, record && s.recordIconOn)}><Icon icon={icon} size={24} /></span>
    <div className={s.recordText}>
      <h3 className={s.kicker}>{title}</h3>
      {record
        ? <><strong className={s.recordName} title={names}>{names}</strong><p className={s.help}>{record.value} {unit}</p></>
        : <p className={s.help}>Nadie lo consiguió en esta partida.</p>}
    </div>
    {record && <strong className={s.recordValue} aria-hidden="true">{record.value}</strong>}
  </li>;
}

/**
 * Resultados de Type Duel: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con insignia y
 * «+N», duelos ganados, porcentaje, fallos y tiempo medio de cada uno) y, al lado, los récords de la partida (más
 * duelos ganados, mejor porcentaje y acierto más rápido; empates juntos). Abajo, la acción del host. Un empate a cero no
 * corona.
 */
export function TypeDuelResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as TypeDuelPublicState; const host = room.hostId === selfId;
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
      meta: <>{higherLowerTied(positions, standing.playerId, () => standing.points) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{typeDuelStatsLine(standing.stats)}</span></>,
    };
  });
  const records = typeDuelRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <Panel variant="cream" as="section" aria-labelledby="type-duel-records-title" bodyClassName={cx(s.records)}>
    <h2 id="type-duel-records-title" className={s.sectionTitle}>Récords de la partida</h2>
    <ul className={s.recordList}>
      <RecordTile title="Más duelos ganados" icon={Swords} record={records.wins} unit={records.wins?.value === '1' ? 'duelo' : 'duelos'} />
      <RecordTile title="Mejor porcentaje" icon={Percent} record={records.winRate} unit="de duelos ganados" />
      <RecordTile title="Acierto más rápido" icon={Timer} record={records.fastest} unit="de media" />
    </ul>
  </Panel>;
  const actions = host
    ? <><Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>Continuar sesión</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <p className={s.waiting}>Esperando al host…</p>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Type Duel" subtitle={`Type Duel · ${game.totalRounds} ${game.totalRounds === 1 ? 'duelo' : 'duelos'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
