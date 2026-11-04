import type { RoomView } from '@pokemon-universe/shared/public';

/**
 * Juegos rediseñados (Arcade DS F5 y F6) que pintan «Saltar minijuego» dentro de su pantalla: así la pantalla llena el alto
 * del `main` sin scroll (como la intro). Para el resto, el armazón de la sala lo sigue poniendo encima.
 */
export const GAMES_WITH_SKIP_IN_SCREEN: ReadonlySet<string> = new Set(['pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess', 'whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess']);

/** ¿Pinta el armazón la fila de «Saltar minijuego»? No en la intro (va en su pantalla) ni en los juegos que la llevan dentro. */
export function skipRowInLayout(room: Pick<RoomView, 'phase' | 'gameIntro' | 'gameSkipState' | 'game' | 'selectedGameId'>): boolean {
  if (!room.gameSkipState) return false;
  if (room.phase === 'GAME_STARTING' && room.gameIntro) return false;
  const gameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  return !(GAMES_WITH_SKIP_IN_SCREEN.has(gameId) && room.phase !== 'GAME_RESULTS');
}
