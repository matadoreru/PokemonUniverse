import type { TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Equal, Flame, Target } from 'lucide-react';
import { higherLowerRecord } from '../games/higher-lower/presentation';
import { tcgStatsLine } from '../games/tcg-higher-lower/presentation';
import { Chip, Icon } from '../ui';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import type { GameResultsProps } from './room-command';

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
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{tcgStatsLine(standing.stats)}</span></>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const aside = <ResultsRecords id="tcg-higher-lower-records-title" records={RECORDS.map(({ key, title, icon, unit }) => {
    const record = higherLowerRecord(entries, key);
    const value = record ? (key === 'accuracy' ? `${record.value}%` : String(record.value)) : '';
    return { key, title, icon, names: record?.names ?? null, value, unit: record ? unit(record.value) : '', valueInHelp: true };
  })} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Higher or Lower: Cartas" subtitle={`Precios de cartas TCG · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
