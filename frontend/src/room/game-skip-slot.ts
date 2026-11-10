import type { RoomView } from '@pokemon-universe/shared/public';

/**
 * Juegos rediseñados (Arcade DS F5, F6, F7 y F8: ya los 28) que pintan «Saltar minijuego» dentro de su pantalla: así la pantalla llena el alto
 * del `main` sin scroll. Para el resto, el armazón de la sala lo sigue poniendo encima.
 */
export const GAMES_WITH_SKIP_IN_SCREEN: ReadonlySet<string> = new Set(['pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess', 'whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess', 'pokemon-cry-quiz', 'pokedex-entry-guess', 'guess-from-stats', 'pokeddle-race', 'type-chain', 'pokemon-trivia', 'tcg-higher-lower', 'pokemon-connections', 'pokemon-bingo', 'most-likely-to', 'pokemon-red-flag', 'would-you-rather', 'one-of-us-is-fake', 'secret-ranking', 'poke-taboo', 'sketchmon', 'pokemon-team-auction', 'pokemon-bluff-auction', 'who-is-who-pokemon', 'absurd-pokedex', 'unown-translator']);

/** ¿Pinta el armazón la fila de «Saltar minijuego»? No en los juegos que la llevan dentro de su pantalla. */
export function skipRowInLayout(room: Pick<RoomView, 'phase' | 'gameSkipState' | 'game' | 'selectedGameId'>): boolean {
  if (!room.gameSkipState) return false;
  const gameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  return !(GAMES_WITH_SKIP_IN_SCREEN.has(gameId) && room.phase !== 'GAME_RESULTS');
}
