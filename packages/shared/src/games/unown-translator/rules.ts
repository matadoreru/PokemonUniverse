/** Glifos distintos del alfabeto Unown: uno por letra de la A a la Z. */
export const UNOWN_GLYPH_COUNT = 26;
export const UNOWN_MAX_GUESS_LENGTH = 40;

/** Cómo se puntúa una ronda, en una frase para la interfaz. */
export function unownTranslatorScoringLabel(): string {
  return '1 punto por descifrar y 1 más por cada letra que siguiera oculta.';
}
