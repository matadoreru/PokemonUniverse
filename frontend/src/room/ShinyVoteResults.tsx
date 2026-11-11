import { gameModeLabel, type ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Target } from 'lucide-react';
import { shinyRecords } from '../games/shiny-vote/presentation';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';

/** Línea de estadísticas de un puesto: aciertos y precisión. */
export function shinyStatsLine(stats: { correctVotes?: number | undefined; accuracy?: number | undefined }): string {
  const correct = stats.correctVotes ?? 0;
  return `${correct} ${correct === 1 ? 'acierto' : 'aciertos'} · ${stats.accuracy ?? 0}% de precisión`;
}

const survivalPoints = (points: number) => `${points} ${points === 1 ? 'ronda' : 'rondas'}`;

/**
 * Resultados de Shiny Quiz: la clasificación del catálogo (`ResultsShell` con `standings`: podio, insignia de ganador y
 * «+N», aciertos y precisión de cada uno) y, al lado, los récords de la partida (más aciertos y mejor precisión; empates
 * juntos). Abajo, la acción del host. Un empate a cero no corona a nadie. En Supervivencia la puntuación son las rondas
 * superadas (el servidor ya ordena por ellas), cada fila dice si sigue en pie o en qué ronda cayó y el único récord es
 * el de más rondas superadas.
 */
export function ShinyVoteResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as ShinyVotePublicState;
  const host = room.hostId === selfId;
  const survival = game.mode === 'SURVIVAL';
  const modeLabel = gameModeLabel('shiny-vote', game);
  const alive = new Set(game.alive ?? []);
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const rows = standingRows(standings, members, (standing) => ({
    meta: <span>{survival ? alive.has(standing.playerId) ? 'Sigue en pie' : `Cayó en la ronda ${standing.points + 1}` : shinyStatsLine(standing.stats)}</span>,
  }));
  const records = shinyRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <ResultsRecords id="shiny-records-title" records={survival ? [
    { key: 'correct', title: 'Más rondas superadas', icon: CheckCircle2, names: records.correct?.names ?? null, value: String(records.correct?.value ?? 0), unit: records.correct?.value === 1 ? 'ronda superada' : 'rondas superadas' },
  ] : [
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: String(records.correct?.value ?? 0), unit: records.correct?.value === 1 ? 'shiny encontrado' : 'shinies encontrados' },
    { key: 'accuracy', title: 'Mejor precisión', icon: Target, names: records.accuracy?.names ?? null, value: `${records.accuracy?.value ?? 0}%`, unit: 'de aciertos' },
  ]} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  // En Supervivencia la partida puede acabar antes de `rounds`: el subtítulo dice cuántas se jugaron.
  const subtitle = survival
    ? `Shiny Quiz${modeLabel ? ` · ${modeLabel}` : ''} · ${game.roundNumber} ${game.roundNumber === 1 ? 'ronda jugada' : 'rondas jugadas'}`
    : `Shiny Quiz · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda completada' : 'rondas completadas'}`;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación shiny" subtitle={subtitle}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge {...(survival ? { pointsLabel: survivalPoints } : {})} />;
}
