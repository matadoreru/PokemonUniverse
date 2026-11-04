import type { RoomView, ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Target } from 'lucide-react';
import { shinyRecords } from '../games/shiny-vote/presentation';
import { playerColor } from './player-color';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/** Línea de estadísticas de un puesto: aciertos y precisión. */
export function shinyStatsLine(stats: { correctVotes?: number | undefined; accuracy?: number | undefined }): string {
  const correct = stats.correctVotes ?? 0;
  return `${correct} ${correct === 1 ? 'acierto' : 'aciertos'} · ${stats.accuracy ?? 0}% de precisión`;
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
  const aside = <ResultsRecords id="shiny-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: String(records.correct?.value ?? 0), unit: records.correct?.value === 1 ? 'shiny encontrado' : 'shinies encontrados' },
    { key: 'accuracy', title: 'Mejor precisión', icon: Target, names: records.accuracy?.names ?? null, value: `${records.accuracy?.value ?? 0}%`, unit: 'de aciertos' },
  ]} />;
  const actions = <ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación shiny" subtitle={`Shiny Quiz · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda completada' : 'rondas completadas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
