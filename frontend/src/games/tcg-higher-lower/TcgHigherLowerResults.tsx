import type { TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Equal, Flame, Target } from 'lucide-react';
import { higherLowerRecord } from '../higher-lower/presentation';
import { tcgStatsLine } from './presentation';
import { Chip, Icon } from '../../ui';
import { sharesPosition } from '../../room/game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from '../../room/game-kit/ResultsRecords';
import { ResultsShell, standingRows } from '../../room/game-kit/ResultsShell';
import { useRoomMembers } from '../../room/room-members';
import type { GameResultsProps } from '../../room/room-command';
import { roundsLabel } from '../../lib/format';

const RECORDS: { key: string; title: string; icon: LucideIcon; unit: (value: number) => string }[] = [
  { key: 'bestStreak', title: 'Mejor racha', icon: Flame, unit: (value) => value === 1 ? 'acierto seguido' : 'aciertos seguidos' },
  { key: 'sameCorrect', title: 'Iguales acertados', icon: Equal, unit: (value) => value === 1 ? 'igual' : 'iguales' },
  { key: 'accuracy', title: 'Mejor precisión', icon: Target, unit: () => 'de aciertos' },
];

/**
 * Resultados de Higher or Lower: Cartas, como los de Higher or Lower: la clasificación del catálogo (`ResultsShell` con
 * `standings`: podio, ganador con insignia y «+N», y la línea de aciertos, iguales, mejor racha y precisión de cada uno)
 * y, al lado, los récords de la partida (empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 */
export function TcgHigherLowerResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as TcgHigherLowerPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{tcgStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const aside = <ResultsRecords id="tcg-higher-lower-records-title" records={RECORDS.map(({ key, title, icon, unit }) => {
    const record = higherLowerRecord(entries, key);
    const value = record ? (key === 'accuracy' ? `${record.value}%` : String(record.value)) : '';
    return { key, title, icon, names: record?.names ?? null, value, unit: record ? unit(record.value) : '', valueInHelp: true };
  })} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Higher or Lower: Cartas" subtitle={`Precios de cartas TCG · ${roundsLabel(game.totalRounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
