import type { MiniGameManifest, RoomPhase, RoomView } from '@pokemon-universe/shared/public';

/** Fases de la sala sin una partida en juego: el lobby, los resultados, la votación y el final de la sesión. */
const PHASES_WITHOUT_GAME: ReadonlySet<RoomPhase> = new Set(['LOBBY', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'NEXT_GAME_VOTE_RESULTS', 'SESSION_RESULTS']);

/** ¿Hay una partida en juego? Cualquier fase de un minijuego salvo sus resultados. */
export function gameInPlay(phase: RoomPhase): boolean {
  return !PHASES_WITHOUT_GAME.has(phase);
}

/** Juego de la partida en curso: el del estado público o, sin él, el elegido en el lobby. */
export function activeGameId(room: Pick<RoomView, 'game' | 'selectedGameId'>): string {
  return (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
}

/** Manifiesto del juego en curso (nombre, icono y «Cómo se juega»); `null` si la sala no lo trae. */
export function activeGameManifest(room: Pick<RoomView, 'game' | 'selectedGameId' | 'availableGames'>): MiniGameManifest | null {
  const gameId = activeGameId(room);
  return room.availableGames?.find((manifest) => manifest.id === gameId) ?? null;
}
