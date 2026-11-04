import type { RoomView, TypeDuelPublicState } from '@pokemon-universe/shared/public';
import { Equal, Percent, Swords, Timer } from 'lucide-react';
import { sharesPosition } from './results-ties';
import { typeDuelRecords, typeDuelStatsLine } from '../games/type-duel/presentation';
import { Chip, Icon } from '../ui';
import { playerColor } from './player-color';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/**
 * Resultados de Type Duel: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con insignia y
 * «+N», duelos ganados, porcentaje, fallos y tiempo medio de cada uno) y, al lado, los récords de la partida (más
 * duelos ganados, mejor porcentaje y acierto más rápido; empates juntos). Abajo, la acción del host. Un empate a cero no
 * corona.
 */
export function TypeDuelResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as TypeDuelPublicState; const host = room.hostId === selfId;
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
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{typeDuelStatsLine(standing.stats)}</span></>,
    };
  });
  const records = typeDuelRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <ResultsRecords id="type-duel-records-title" records={[
    { key: 'wins', title: 'Más duelos ganados', icon: Swords, names: records.wins?.names ?? null, value: records.wins?.value ?? '', unit: records.wins?.value === '1' ? 'duelo ganado' : 'duelos ganados' },
    { key: 'winRate', title: 'Mejor porcentaje', icon: Percent, names: records.winRate?.names ?? null, value: records.winRate?.value ?? '', unit: 'de los duelos jugados' },
    { key: 'fastest', title: 'Acierto más rápido', icon: Timer, names: records.fastest?.names ?? null, value: records.fastest?.value ?? '', unit: 'de media por acierto' },
  ]} />;
  const actions = <ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Type Duel" subtitle={`Type Duel · ${game.totalRounds} ${game.totalRounds === 1 ? 'duelo' : 'duelos'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
