import { Check, Link2, UserPlus } from 'lucide-react';
import type { StateBoxProps } from '../ui';
import { formatPendingReadyNames, type MiniGameManifest, type RoomMemberView, type SessionMode } from '@pokemon-universe/shared/public';

/** El modo por partidas con otro número de partidas; conserva «La última partida vale doble». */
export function withGameCountTarget(mode: SessionMode, target: number): SessionMode {
  return mode.type === 'GAME_COUNT' ? { ...mode, target } : { type: 'GAME_COUNT', target };
}

/** El modo por partidas con la última partida doble o sin ella; los otros modos no tienen la opción (`null`). */
export function withDoubleLastGame(mode: SessionMode, doubleLastGame: boolean): SessionMode | null {
  return mode.type === 'GAME_COUNT' ? { ...mode, doubleLastGame } : null;
}

/** Texto de búsqueda sin tildes ni mayúsculas. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

/** Minijuegos cuyo nombre o descripción contienen la búsqueda (sin tildes); sin búsqueda, todos. */
export function filterGames<T extends Pick<MiniGameManifest, 'name' | 'description'>>(games: readonly T[], query: string): T[] {
  const normalized = normalizeSearch(query);
  return normalized ? games.filter((game) => normalizeSearch(`${game.name} ${game.description}`).includes(normalized)) : [...games];
}

/** «+2 jugadores»: solo el mínimo (el máximo, 8, es el de la sala y no se repite en cada carta). */
export function playerRangeLabel(game: Pick<MiniGameManifest, 'minPlayers' | 'maxPlayers'>): string {
  return `+${game.minPlayers} jugadores`;
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

/**
 * Por qué el host no puede empezar todavía (o `null` si puede), en este orden: permiso, algún juego elegido, los
 * pendientes de confirmar, el número de jugadores y la configuración (`configReason`, ya calculado). Con un solo juego,
 * el motivo exacto (mínimo o máximo de jugadores), como el servidor; si no, solo cuando ninguno admite a los conectados.
 */
export function lobbyStartReason({ canStart, selectedGames, compatibleCount, pendingReadyNames, connectedPlayers, configReason }: {
  canStart: boolean;
  /** Manifiestos de los juegos elegidos (los que la sala conoce). */
  selectedGames: readonly (Pick<MiniGameManifest, 'minPlayers' | 'maxPlayers'> | undefined)[];
  /** Cuántos de los elegidos admiten a los conectados. */
  compatibleCount: number;
  pendingReadyNames: readonly string[];
  connectedPlayers: number;
  configReason: string | null;
}): string | null {
  if (!canStart) return 'Solo el host puede iniciar la partida.';
  if (selectedGames.length === 0) return 'Elige al menos un minijuego para empezar.';
  if (pendingReadyNames.length > 0) return `Falta por confirmar: ${formatPendingReadyNames(pendingReadyNames)}.`;
  const only = selectedGames.length === 1 ? selectedGames[0] : undefined;
  const playerCountReason = only
    ? connectedPlayers < only.minPlayers
      ? `Se necesitan al menos ${only.minPlayers} jugadores conectados.`
      : only.maxPlayers !== undefined && connectedPlayers > only.maxPlayers
        ? `Este juego admite un máximo de ${only.maxPlayers} jugadores.`
        : null
    : compatibleCount === 0 ? 'Ningún minijuego elegido admite el número actual de jugadores.' : null;
  return playerCountReason ?? configReason;
}

/**
 * Estado vacío de la placa de jugadores con un solo jugador conectado: «Copiar enlace» (o «Enlace copiado» justo
 * después) y, si hay panel de amigos, «Invitar amigos», que lo abre.
 */
export function emptyRoomState({ copied, onCopy, onInvite }: { copied: boolean; onCopy(): void; onInvite: (() => void) | null }): Omit<StateBoxProps, 'live'> {
  return {
    kind: 'empty',
    compact: true,
    title: 'Aún no ha llegado nadie',
    text: 'Comparte el enlace de la sala para que entre tu grupo.',
    action: { label: copied ? 'Enlace copiado' : 'Copiar enlace', icon: copied ? Check : Link2, onClick: onCopy },
    ...(onInvite ? { secondaryAction: { label: 'Invitar amigos', icon: UserPlus, onClick: onInvite } } : {}),
  };
}
