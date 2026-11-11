import type { TypeChainPublicState } from '@pokemon-universe/shared/public';
import { Equal, ListOrdered, ShieldCheck, Skull, XCircle } from 'lucide-react';
import { typeChainEliminationLabels } from './presentation';
import { Chip, Icon } from '../../ui';
import { guessTop } from '../../room/guess-kit';
import { sharesPosition } from '../../room/game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from '../../room/game-kit/ResultsRecords';
import { ResultsShell, standingRows } from '../../room/game-kit/ResultsShell';
import { useRoomMembers } from '../../room/room-members';
import type { GameResultsProps } from '../../room/room-command';
import { plural } from '../../lib/format';

/**
 * Resultados de Type Chain: la clasificación del catálogo (`ResultsShell` con podio, ganador y «+N»), que ordena por
 * Pokémon nombrados (a igualdad, quien aguantó más y luego quien menos falló), con, en texto, los nombrados, los fallos
 * y cómo cayó cada uno (superviviente, o eliminado por tiempo o por desconexión y en qué orden); la regla y la cadena
 * más larga, en el subtítulo. Al lado, los récords: más Pokémon nombrados y menos fallos.
 */
export function TypeChainResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as TypeChainPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => {
    const stats = standing.stats;
    const elimination = game.eliminations.find((entry) => entry.playerId === standing.playerId);
    const named = Number(stats.validSubmissions ?? 0); const invalid = Number(stats.invalidAttempts ?? 0);
    return {
      meta: <>
        {sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        {elimination
          ? <Chip tone="bad" icon={<Icon icon={Skull} size={18} />}>{`Eliminado ${elimination.eliminationOrder}.º`}</Chip>
          : <Chip tone="ok" icon={<Icon icon={ShieldCheck} size={18} />}>Sigue en pie</Chip>}
        <span>{[plural(named, 'Pokémon nombrado', 'Pokémon nombrados'), ...(elimination ? [`Cayó: ${typeChainEliminationLabels[elimination.reason]}`] : []), plural(invalid, 'fallo', 'fallos')].join(' · ')}</span>
      </>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const named = guessTop(entries, 'validSubmissions');
  // Menos fallos: entre quienes nombraron algún Pokémon (si no, «0 fallos» premiaría a quien no jugó).
  const played = entries.filter((entry) => Number(entry.stats.validSubmissions ?? 0) > 0);
  const fewest = played.length ? Math.min(...played.map((entry) => Number(entry.stats.invalidAttempts ?? 0))) : null;
  const aside = <ResultsRecords id="type-chain-records-title" records={[
    { key: 'named', title: 'Más Pokémon nombrados', icon: ListOrdered, names: named?.names ?? null, value: String(named?.value ?? ''), unit: 'Pokémon' },
    { key: 'fewest', title: 'Menos fallos', icon: XCircle, names: fewest === null ? null : played.filter((entry) => Number(entry.stats.invalidAttempts ?? 0) === fewest).map((entry) => entry.name), value: String(fewest ?? ''), unit: fewest === 1 ? 'intento que no valió' : 'intentos que no valieron' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`Type Chain · gana quien más Pokémon nombra · cadena más larga: ${game.longestChain} Pokémon`}
    standings={rows} selfId={selfId} aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}
