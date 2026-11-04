import type { PokemonCryQuizPublicState, RoomView } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Target, Timer } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessRecords, guessStatsLine } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/**
 * Resultados de Adivina el Grito: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N» y, en texto, aciertos, sin acertar, intentos, precisión, media, mejor tiempo y al primer intento) y,
 * al lado, los récords de la partida (más aciertos, acierto más rápido y al primer intento; empates juntos). Abajo, la
 * acción del host. Un empate a cero no corona.
 */
export function PokemonCryQuizResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokemonCryQuizPublicState; const host = room.hostId === selfId;
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
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{guessStatsLine(standing.stats)}</span></>,
    };
  });
  const records = guessRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <ResultsRecords id="cry-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: records.correct?.value ?? '', unit: records.correct?.value === '1' ? 'grito reconocido' : 'gritos reconocidos' },
    { key: 'fastest', title: 'Acierto más rápido', icon: Timer, names: records.fastest?.names ?? null, value: records.fastest?.value ?? '', unit: 'desde que empezó la ronda' },
    { key: 'firstTry', title: 'Al primer intento', icon: Target, names: records.firstTry?.names ?? null, value: records.firstTry?.value ?? '', unit: records.firstTry?.value === '1' ? 'acierto sin fallar antes' : 'aciertos sin fallar antes' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`Adivina el Grito · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}
