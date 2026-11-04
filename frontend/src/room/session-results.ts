import type { RoomView } from '@pokemon-universe/shared/public';
import { playerColor } from './player-color';
import type { ResultsStanding } from './ResultsShell';

export interface SessionPodium {
  /** Clasificación con puestos de competición: los empatados comparten puesto (1, 1, 3…). */
  standings: ResultsStanding[];
  /** Campeones (los del puesto 1); vacío si aún no se ha jugado ninguna partida. */
  champions: ResultsStanding[];
  tied: boolean;
  /** El jugador local está entre los campeones. */
  won: boolean;
  title: string;
  subtitle: string;
}

/**
 * Podio de la sesión (`SESSION_RESULTS`). Ordena por puntos y, a igualdad, por nombre; el color sale del orden en
 * `room.members` (un jugador que ya se fue no tiene color). Sin partidas jugadas no hay campeón: todos tendrían 0.
 */
export function sessionPodium(room: Pick<RoomView, 'sessionStandings' | 'members' | 'gamesPlayed'>, selfId: string): SessionPodium {
  const order = new Map(room.members.map((member, index) => [member.id, index]));
  const sorted = [...room.sessionStandings].sort((a, b) => b.sessionPoints - a.sessionPoints || a.displayName.localeCompare(b.displayName, 'es'));
  const standings = sorted.map((standing): ResultsStanding => {
    const position = sorted.findIndex((other) => other.sessionPoints === standing.sessionPoints) + 1;
    const index = order.get(standing.id);
    return { id: standing.id, position, name: standing.displayName, points: standing.sessionPoints, avatar: standing.avatar, color: index === undefined ? undefined : playerColor(index) };
  });
  const played = room.gamesPlayed > 0;
  const champions = played ? standings.filter((standing) => standing.position === 1) : [];
  const tied = champions.length > 1;
  return {
    standings,
    champions,
    tied,
    won: champions.some((standing) => standing.id === selfId),
    title: !played || champions.length === 0 ? 'Sesión terminada' : tied ? 'Campeones de la sesión' : 'Campeón de la sesión',
    subtitle: `${room.gamesPlayed} partida${room.gamesPlayed === 1 ? '' : 's'} disputada${room.gamesPlayed === 1 ? '' : 's'}`,
  };
}

/** «Ana», «Ana y Eru», «Ana, Eru y Leo». */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}
