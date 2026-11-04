import type { RoomView, ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { RotateCcw, StopCircle } from 'lucide-react';
import { Pill } from '../ui';
import { playerColor } from './player-color';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/shiny-vote/ShinyVote.module.css';

/** Línea de estadísticas de un puesto: aciertos y precisión. */
export function shinyStatsLine(stats: { correctVotes?: number | undefined; accuracy?: number | undefined }): string {
  const correct = stats.correctVotes ?? 0;
  return `${correct} ${correct === 1 ? 'acierto' : 'aciertos'} · ${stats.accuracy ?? 0}% de precisión`;
}

/**
 * Resultados de Shiny Quiz: la clasificación del catálogo (`ResultsShell` con `standings`: podio, insignia de ganador y
 * «+N», aciertos y precisión de cada uno) y, abajo, la acción del host. Un empate a cero no corona a nadie.
 */
export function ShinyVoteResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as ShinyVotePublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
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
  const actions = host
    ? <><Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>Continuar sesión</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <p className={s.waiting}>Esperando al host…</p>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación shiny" subtitle={`Shiny Quiz · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda completada' : 'rondas completadas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints actions={actions} />;
}
