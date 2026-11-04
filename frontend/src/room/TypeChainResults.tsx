import type { RoomView, TypeChainPublicState } from '@pokemon-universe/shared/public';
import { Equal, Link2, ShieldCheck, Skull, XCircle } from 'lucide-react';
import { typeChainEliminationLabels } from '../games/type-chain/presentation';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/**
 * Resultados de Type Chain: la clasificación del catálogo (`ResultsShell` con podio, ganador y «+N») con, en texto, los
 * eslabones válidos, los fallos, los turnos superados y cómo cayó cada uno (superviviente, o eliminado por tiempo o
 * por desconexión y en qué orden); la cadena más larga, en el subtítulo. Al lado, los récords: más eslabones, más turnos y menos fallos.
 */
export function TypeChainResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as TypeChainPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    const stats = standing.stats;
    const elimination = game.eliminations.find((entry) => entry.playerId === standing.playerId);
    const valid = Number(stats.validSubmissions ?? 0); const invalid = Number(stats.invalidAttempts ?? 0); const turns = Number(stats.turnsSurvived ?? 0); const timeouts = Number(stats.timeoutEliminations ?? 0);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>
        {sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        {elimination
          ? <Chip tone="bad" icon={<Icon icon={Skull} size={18} />}>{`Eliminado ${elimination.eliminationOrder}.º`}</Chip>
          : <Chip tone="ok" icon={<Icon icon={ShieldCheck} size={18} />}>Sigue en pie</Chip>}
        <span>{[...(elimination ? [`Cayó: ${typeChainEliminationLabels[elimination.reason]}`] : []), count(valid, 'válido', 'válidos'), count(invalid, 'fallo', 'fallos'), count(turns, 'turno superado', 'turnos superados'), count(timeouts, 'eliminación por tiempo', 'eliminaciones por tiempo')].join(' · ')}</span>
      </>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const links = guessTop(entries, 'validSubmissions');
  const turns = guessTop(entries, 'turnsSurvived');
  // Menos fallos: entre quienes pusieron algún eslabón (si no, «0 fallos» premiaría a quien no jugó).
  const played = entries.filter((entry) => Number(entry.stats.validSubmissions ?? 0) > 0);
  const fewest = played.length ? Math.min(...played.map((entry) => Number(entry.stats.invalidAttempts ?? 0))) : null;
  const aside = <ResultsRecords id="type-chain-records-title" records={[
    { key: 'links', title: 'Más eslabones', icon: Link2, names: links?.names ?? null, value: String(links?.value ?? ''), unit: links?.value === 1 ? 'Pokémon válido' : 'Pokémon válidos' },
    { key: 'turns', title: 'Más turnos superados', icon: ShieldCheck, names: turns?.names ?? null, value: String(turns?.value ?? ''), unit: turns?.value === 1 ? 'turno' : 'turnos' },
    { key: 'fewest', title: 'Menos fallos', icon: XCircle, names: fewest === null ? null : played.filter((entry) => Number(entry.stats.invalidAttempts ?? 0) === fewest).map((entry) => entry.name), value: String(fewest ?? ''), unit: fewest === 1 ? 'intento que no valió' : 'intentos que no valieron' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`Type Chain · cadena más larga: ${game.longestChain} Pokémon`}
    standings={rows} selfId={selfId} aside={aside} actions={<ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}
