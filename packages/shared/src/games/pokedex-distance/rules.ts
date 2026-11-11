/**
 * Desempates como máximo antes de resolver un empate a la fuerza. En `HIDDEN` los empatados pueden repetir el mismo
 * Pokémon en cada desempate; el tope garantiza que la partida acabe (`maxTiebreaks` configurable es de la Fase 3).
 */
export const MAX_TIEBREAK_DEPTH = 3;
