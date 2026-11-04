import type { LearnsetGuessPublicState, RoomView } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Lightbulb, Trophy } from 'lucide-react';
import { learnsetRecords, learnsetStatsLine } from '../games/learnset-guess/presentation';
import { Chip, Icon } from '../ui';
import { sharesPosition } from './results-ties';
import { playerColor } from './player-color';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/**
 * Resultados de Learnset Guess: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», aciertos, fallos, porcentaje y media de cada uno) y, al lado, los récords de la partida (más
 * aciertos, más aciertos con las pistas iniciales y la mejor ronda; empates juntos). Abajo, la acción del host. Un
 * empate a cero no corona.
 */
export function LearnsetGuessResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as LearnsetGuessPublicState; const host = room.hostId === selfId;
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
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{learnsetStatsLine(standing.stats)}</span></>,
    };
  });
  const records = learnsetRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <ResultsRecords id="learnset-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: records.correct?.value ?? '', unit: records.correct?.value === '1' ? 'Pokémon acertado' : 'Pokémon acertados' },
    { key: 'initial', title: 'Con las pistas iniciales', icon: Lightbulb, names: records.initial?.names ?? null, value: records.initial?.value ?? '', unit: 'aciertos antes de la primera pista nueva' },
    { key: 'bestRound', title: 'Mejor ronda', icon: Trophy, names: records.bestRound?.names ?? null, value: records.bestRound?.value ?? '', unit: 'puntos en una sola ronda' },
  ]} />;
  const actions = <ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Learnset Guess" subtitle={`Learnset Guess · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
