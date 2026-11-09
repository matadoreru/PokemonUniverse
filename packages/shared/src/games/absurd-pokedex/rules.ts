import type { AbsurdPokedexMode } from './config.js';

export const ABSURD_POKEDEX_MAX_ENTRY_LENGTH = 150;

/** Cómo se puntúa una ronda en `mode`, en una frase para la interfaz. */
export function absurdPokedexScoringLabel(mode: AbsurdPokedexMode): string {
  return mode === 'REAL_ENTRY'
    ? '+2 si aciertas la oficial, +1 por cada jugador al que engañes y +1 por cada voto a la más graciosa.'
    : '+1 por cada voto y +2 a la más votada.';
}
