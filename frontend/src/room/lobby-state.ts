import type { MiniGameManifest, RoomMemberView } from '@pokemon-universe/shared/public';

/** Texto de búsqueda sin tildes ni mayúsculas. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

/** Minijuegos cuyo nombre o descripción contienen la búsqueda (sin tildes); sin búsqueda, todos. */
export function filterGames<T extends Pick<MiniGameManifest, 'name' | 'description'>>(games: readonly T[], query: string): T[] {
  const normalized = normalizeSearch(query);
  return normalized ? games.filter((game) => normalizeSearch(`${game.name} ${game.description}`).includes(normalized)) : [...games];
}

/** «2–8 jugadores» o «3+ jugadores». */
export function playerRangeLabel(game: Pick<MiniGameManifest, 'minPlayers' | 'maxPlayers'>): string {
  return game.maxPlayers === undefined ? `${game.minPlayers}+ jugadores` : `${game.minPlayers}–${game.maxPlayers} jugadores`;
}

/** Jugadores conectados (el contador de la placa de jugadores y las comprobaciones de inicio usan el mismo). */
export function connectedCount(members: readonly Pick<RoomMemberView, 'presence'>[]): number {
  return members.filter((member) => member.presence === 'CONNECTED').length;
}

export interface LobbyActionStatus {
  /** Antetítulo (solo escritorio). */
  kicker: string;
  title: string;
  /** Texto de `#start-help`. */
  text: string;
  ok: boolean;
}

/**
 * Lo que dice el bloque de la acción del lobby. El host (único que puede empezar) ve qué falta o «La sala está lista.»;
 * los demás, su propio estado: márcate listo o espera a que el host empiece.
 */
export function lobbyActionStatus({ canStart, ready, startReason, hostName }: { canStart: boolean; ready: boolean; startReason: string | null; hostName: string | undefined }): LobbyActionStatus {
  if (canStart) {
    return { kicker: startReason ? 'Falta algo' : 'Todo listo', title: 'Iniciar partida', text: startReason ?? 'La sala está lista.', ok: !startReason };
  }
  return ready
    ? { kicker: 'Tu estado', title: 'Estás listo', text: `${hostName ?? 'El host'} empezará la partida cuando esté todo preparado.`, ok: true }
    : { kicker: 'Tu estado', title: '¿Preparado?', text: `Márcate listo para que ${hostName ?? 'el host'} pueda empezar.`, ok: false };
}
