import type { RoomView, ShinyVotePublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, RotateCcw, StopCircle, Target } from 'lucide-react';
import { shinyRecords, type ShinyRecord } from '../games/shiny-vote/presentation';
import { cx, Icon, Panel, Pill } from '../ui';
import { playerColor } from './player-color';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/shiny-vote/ShinyVoteResults.module.css';

/** Línea de estadísticas de un puesto: aciertos y precisión. */
export function shinyStatsLine(stats: { correctVotes?: number | undefined; accuracy?: number | undefined }): string {
  const correct = stats.correctVotes ?? 0;
  return `${correct} ${correct === 1 ? 'acierto' : 'aciertos'} · ${stats.accuracy ?? 0}% de precisión`;
}

/** Récord: quién y el valor grande; la línea de ayuda solo da el contexto (sin repetir el número). */
function RecordTile({ title, icon, record, value, unit }: { title: string; icon: LucideIcon; record: ShinyRecord | null; value: string; unit: string }) {
  const names = record?.names.join(', ') ?? '';
  return <li className={s.record}>
    <span className={cx(s.recordIcon, record && s.recordIconOn)}><Icon icon={icon} size={24} /></span>
    <div className={s.recordText}>
      <h3 className={s.kicker}>{title}</h3>
      {record
        ? <><strong className={s.recordName} title={names}>{names}</strong><p className={s.help}>{unit}</p></>
        : <p className={s.help}>Nadie lo consiguió en esta partida.</p>}
    </div>
    {record && <strong className={s.recordValue}>{value}</strong>}
  </li>;
}

/**
 * Resultados de Shiny Quiz: la clasificación del catálogo (`ResultsShell` con `standings`: podio, insignia de ganador y
 * «+N», aciertos y precisión de cada uno) y, al lado, los récords de la partida (más aciertos y mejor precisión; empates
 * juntos). Abajo, la acción del host. Un empate a cero no corona a nadie.
 */
export function ShinyVoteResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as ShinyVotePublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    const member = room.members[index];
    return {
      id: standing.playerId,
      position: standing.position,
      name: member?.displayName ?? 'Entrenador',
      points: standing.points,
      avatar: member?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <span>{shinyStatsLine(standing.stats)}</span>,
    };
  });
  const records = shinyRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <Panel variant="cream" as="section" aria-labelledby="shiny-records-title" bodyClassName={cx(s.records)}>
    <h2 id="shiny-records-title" className={s.sectionTitle}>Récords de la partida</h2>
    <ul className={s.recordList}>
      <RecordTile title="Más aciertos" icon={CheckCircle2} record={records.correct} value={String(records.correct?.value ?? 0)} unit={records.correct?.value === 1 ? 'shiny encontrado' : 'shinies encontrados'} />
      <RecordTile title="Mejor precisión" icon={Target} record={records.accuracy} value={`${records.accuracy?.value ?? 0}%`} unit="de aciertos" />
    </ul>
  </Panel>;
  const actions = host
    ? <><Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>Continuar sesión</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <p className={s.waiting}>Esperando al host…</p>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación shiny" subtitle={`Shiny Quiz · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda completada' : 'rondas completadas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
