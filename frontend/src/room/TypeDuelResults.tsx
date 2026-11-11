import { gameModeLabel, type TypeDuelPublicState } from '@pokemon-universe/shared/public';
import { Equal, HandHeart, Percent, Swords, Timer, Users } from 'lucide-react';
import { sharesPosition } from './results-ties';
import { typeDuelCoopStatsLine, typeDuelRecords, typeDuelStatsLine } from '../games/type-duel/presentation';
import { Chip, Icon } from '../ui';
import { playerColor } from './player-color';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import type { GameResultsProps } from './room-command';

/**
 * Resultados de Type Duel: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con insignia y
 * «+N», duelos ganados, porcentaje, fallos y tiempo medio de cada uno) y, al lado, los récords de la partida (más
 * duelos ganados, mejor porcentaje y acierto más rápido; empates juntos). Abajo, la acción del host. Un empate a cero no
 * corona. En Cooperativo no hay ganador: la clasificación es la aportación de cada uno (el servidor ya ordena por ella) y
 * al lado van el total del grupo y la mayor aportación.
 */
export function TypeDuelResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as TypeDuelPublicState; const host = room.hostId === selfId;
  if (game.mode === 'COOP') return <TypeDuelCoopResults room={room} selfId={selfId} onLobby={onLobby} onEnd={onEnd} />;
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
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Type Duel" subtitle={`Type Duel · ${game.totalRounds} ${game.totalRounds === 1 ? 'duelo' : 'duelos'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}

const coopPoints = (points: number) => `${points} Pokémon`;

function TypeDuelCoopResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as TypeDuelPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const groupTotal = standings.reduce((sum, standing) => sum + standing.points, 0);
  const best = Math.max(0, ...standings.map((standing) => standing.points));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <span>{typeDuelCoopStatsLine(standing.stats)}</span>,
    };
  });
  const aside = <ResultsRecords id="type-duel-records-title" title="El grupo" records={[
    { key: 'group', title: 'Total del grupo', icon: Users, names: groupTotal > 0 ? ['Entre todos'] : null, value: String(groupTotal), unit: groupTotal === 1 ? 'Pokémon distinto encontrado' : 'Pokémon distintos encontrados' },
    { key: 'best', title: 'Mayor aportación', icon: HandHeart, names: best > 0 ? standings.filter((standing) => standing.points === best).map((standing) => nameOf(standing.playerId)) : null, value: String(best), unit: 'Pokémon aportados' },
  ]} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;
  const modeLabel = gameModeLabel('type-duel', game);
  return <ResultsShell title="Resultado del grupo" subtitle={`Type Duel${modeLabel ? ` · ${modeLabel}` : ''} · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} noWinner pointsLabel={coopPoints} aside={aside} actions={actions} fillLarge />;
}
