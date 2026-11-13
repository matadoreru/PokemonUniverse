import { CheckCircle2, Target } from 'lucide-react';
import { ResultsHostActions, ResultsRecords } from '../../room/game-kit/ResultsRecords';
import { ResultsShell, standingRows } from '../../room/game-kit/ResultsShell';
import { useRoomMembers } from '../../room/room-members';
import type { GameResultsProps } from '../../room/room-command';
import type { OddOneOutPublicState } from '@pokemon-universe/shared/public';
import { oddStatsLine, oddRecords } from './presentation';

/**
 * Resultados de El Intruso: la clasificación del catálogo (puntos, aciertos y precisión de cada uno) y, al lado, los
 * récords de la partida (más aciertos y mejor precisión; empates juntos). Abajo, la acción del host.
 */
export function OddOneOutResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as OddOneOutPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room);
  const rows = standingRows(standings, members, (standing) => ({ meta: <span>{oddStatsLine(standing.stats)}</span> }));
  const records = oddRecords(standings.map((standing) => ({ name: members.nameOf(standing.playerId), stats: standing.stats })));
  const aside = <ResultsRecords id="odd-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: String(records.correct?.value ?? 0), unit: records.correct?.value === 1 ? 'intruso hallado' : 'intrusos hallados' },
    { key: 'accuracy', title: 'Mejor precisión', icon: Target, names: records.accuracy?.names ?? null, value: `${records.accuracy?.value ?? 0}%`, unit: 'de aciertos' },
  ]} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación del intruso"
    subtitle={`El Intruso · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda completada' : 'rondas completadas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
