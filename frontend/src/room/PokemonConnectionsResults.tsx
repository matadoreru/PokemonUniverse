import type { PokemonConnectionsPublicState, RoomView } from '@pokemon-universe/shared/public';
import { Equal, Medal, Puzzle, Timer } from 'lucide-react';
import { connectionsStatsLine } from '../games/pokemon-connections/presentation';
import { Chip, Icon } from '../ui';
import { guessSeconds, guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/**
 * Resultados de Pokémon Connections: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», y la línea de grupos, tableros, errores, intentos a una y podios de cada uno) y, al lado, los récords
 * de la partida (más grupos, resolución más rápida y más podios; empates juntos). Un empate a cero no corona.
 */
export function PokemonConnectionsResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokemonConnectionsPublicState;
  const host = room.hostId === selfId;
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
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{connectionsStatsLine(standing.stats)}</span></>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const groups = guessTop(entries, 'groupsFound');
  const fastest = guessTop(entries, 'bestSolveTimeMs', true);
  const podiums = guessTop(entries, 'podiumFinishes');
  const aside = <ResultsRecords id="pokemon-connections-records-title" records={[
    { key: 'groups', title: 'Más grupos', icon: Puzzle, names: groups?.names ?? null, value: groups ? String(groups.value) : '', unit: groups?.value === 1 ? 'grupo encontrado' : 'grupos encontrados', valueInHelp: true },
    { key: 'fastest', title: 'Tablero más rápido', icon: Timer, names: fastest?.names ?? null, value: fastest ? guessSeconds(fastest.value) : '', unit: 'en completarlo', valueInHelp: true },
    { key: 'podiums', title: 'Más podios de velocidad', icon: Medal, names: podiums?.names ?? null, value: podiums ? String(podiums.value) : '', unit: podiums?.value === 1 ? 'podio' : 'podios', valueInHelp: true },
  ]} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Mentes bien conectadas"
    subtitle={`${game.totalRounds} ${game.totalRounds === 1 ? 'puzle' : 'puzles'} · 1 punto por grupo y 3/2/1 por completar antes`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
