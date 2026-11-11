import type { MiniGameManifest, RoomView } from '@pokemon-universe/shared/public';

/** Juego de la partida en curso: el del estado público o, sin él (en la intro aún no hay), el del reto o el elegido. */
export function activeGameId(room: Pick<RoomView, 'game' | 'daily' | 'selectedGameId'>): string {
  return (room.game as { gameId?: string } | null)?.gameId ?? room.daily?.gameId ?? room.selectedGameId;
}

/** Manifiesto del juego en curso (nombre, icono y «Cómo se juega»); `null` si la sala no lo trae. */
export function activeGameManifest(room: Pick<RoomView, 'game' | 'daily' | 'selectedGameId' | 'availableGames'>): MiniGameManifest | null {
  const gameId = activeGameId(room);
  return room.availableGames?.find((manifest) => manifest.id === gameId) ?? null;
}

/** Estado de la intro para quien la mira: si cuenta, si ya pulsó «¡Listo!» y cuántos lo están. */
export interface IntroStatus {
  /** Es jugador conectado de la partida: su «¡Listo!» cuenta. */
  counts: boolean;
  ready: boolean;
  readyCount: number;
  total: number;
}

export function introStatus(room: Pick<RoomView, 'intro'>, selfId: string): IntroStatus {
  const intro = room.intro ?? null;
  const playerIds = intro?.playerIds ?? [];
  const readyIds = new Set(intro?.readyPlayerIds ?? []);
  return {
    counts: playerIds.includes(selfId),
    ready: readyIds.has(selfId),
    readyCount: playerIds.filter((id) => readyIds.has(id)).length,
    total: playerIds.length,
  };
}

/** Título de la placa de acción de la intro. */
export function introActionTitle(status: IntroStatus): string {
  if (!status.counts) return 'Miras como espectador';
  if (!status.ready) return '¿Listo para jugar?';
  return status.readyCount >= status.total ? '¡Empieza!' : 'Esperando al resto…';
}

/**
 * Texto de la única región viva de la intro: el juego al entrar y luego cuántos están listos (la cuenta atrás, que
 * cambia cada segundo, queda fuera).
 */
export function introAnnouncement(gameName: string, status: IntroStatus): string {
  const count = status.total === 1 ? `${status.readyCount} de 1 jugador listo` : `${status.readyCount} de ${status.total} jugadores listos`;
  return `Empieza ${gameName}. ${count}.`;
}
