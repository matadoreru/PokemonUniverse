import { gameModeLabel, type HigherLowerPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Equal, Flame, Target } from 'lucide-react';
import { higherLowerRecord } from '../games/higher-lower/presentation';
import { Chip, Icon } from '../ui';
import { higherLowerEndlessStatsLine, higherLowerStatsLine } from './higher-lower-labels';
import { sharesPosition } from './game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from './game-kit/ResultsRecords';
import { ResultsShell, standingRows } from './game-kit/ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import { roundsLabel } from '../lib/format';

const RECORDS: { key: string; title: string; icon: LucideIcon; unit: (value: number) => string }[] = [
  { key: 'bestStreak', title: 'Mejor racha', icon: Flame, unit: (value) => value === 1 ? 'acierto seguido' : 'aciertos seguidos' },
  { key: 'sameCorrect', title: 'Iguales acertados', icon: Equal, unit: (value) => value === 1 ? 'igual' : 'iguales' },
  { key: 'accuracy', title: 'Mejor precisión', icon: Target, unit: () => 'de aciertos' },
];

const endlessPoints = (points: number) => `Racha ${points}`;

/**
 * Resultados de Higher or Lower: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», aciertos, iguales, mejor racha y precisión de cada uno) y, al lado, los récords de la partida (mejor
 * racha, iguales acertados y mejor precisión; empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 * En Racha infinita la puntuación es la racha (el servidor ya ordena por ella), cada fila dice en qué ronda cayó y el
 * único récord es la mejor racha.
 */
export function HigherLowerResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as HigherLowerPublicState; const host = room.hostId === selfId;
  const endless = game.mode === 'ENDLESS';
  const modeLabel = gameModeLabel('higher-lower', game);
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{endless ? higherLowerEndlessStatsLine(standing.stats) : higherLowerStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const aside = <ResultsRecords id="higher-lower-records-title" records={(endless ? RECORDS.filter(({ key }) => key === 'bestStreak') : RECORDS).map(({ key, title, icon, unit }) => {
    const record = higherLowerRecord(entries, key);
    const value = record ? (key === 'accuracy' ? `${record.value}%` : String(record.value)) : '';
    return { key, title, icon, names: record?.names ?? null, value, unit: record ? unit(record.value) : '', valueInHelp: true };
  })} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  // En Racha infinita no hay número de rondas: el subtítulo dice cuántas se jugaron.
  const rounds = endless ? game.roundNumber : game.totalRounds;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Higher or Lower" subtitle={`Higher or Lower${modeLabel ? ` · ${modeLabel}` : ''} · ${roundsLabel(rounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge {...(endless ? { pointsLabel: endlessPoints } : {})} />;
}
