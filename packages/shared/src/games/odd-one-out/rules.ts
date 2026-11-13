/** Puntos extra para los tres primeros en acertar, por orden de voto. */
export const ODD_ONE_OUT_ORDER_BONUSES = [3, 2, 1] as const;

/** Cómo se puntúa la partida, en una frase para la interfaz. */
export function oddOneOutScoringLabel(): string {
  return '1 punto por acierto, y +3, +2 y +1 a los tres primeros en acertar.';
}
