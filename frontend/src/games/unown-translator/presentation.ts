import type { UnownAlphabetEntry, UnownToken } from '@pokemon-universe/shared/public';

/** ¿Es la pieza un separador de palabras? Un `LITERAL` solo de espacios. */
const isSpace = (token: UnownToken) => token.kind === 'LITERAL' && token.text.trim() === '';

/**
 * Parte el mensaje en palabras por los `LITERAL` de espacio, que no se incluyen; los demás literales (`.`, `-`, `'`)
 * se quedan dentro de su palabra. Nunca hay palabras vacías (dos espacios seguidos, o al principio o al final).
 */
export function splitWords(tokens: readonly UnownToken[]): UnownToken[][] {
  const words: UnownToken[][] = [];
  let current: UnownToken[] = [];
  for (const token of tokens) {
    if (isSpace(token)) {
      if (current.length > 0) words.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) words.push(current);
  return words;
}

/** Las letras que trae `next` y no estaban en `previous`, en su orden (para «Nueva letra: P» en la región viva). */
export function newLetters(previous: readonly UnownAlphabetEntry[], next: readonly UnownAlphabetEntry[]): string[] {
  const known = new Set(previous.map((entry) => entry.glyph));
  return next.filter((entry) => !known.has(entry.glyph)).map((entry) => entry.letter);
}

/** Cuánto falta para la siguiente letra (`now` en hora del servidor), o que ya no quedan letras por revelar. */
export function hintCountdownLabel(nextHintAt: number | null, now: number): string {
  if (nextHintAt === null) return 'No quedan letras por revelar';
  return `Siguiente letra en ${Math.max(1, Math.ceil((nextHintAt - now) / 1_000))} s`;
}

/** Lo que anuncia la región viva al llegar letras nuevas: «Nueva letra: P. Nueva letra: Q.». */
export function newLettersAnnouncement(letters: readonly string[]): string {
  return letters.map((letter) => `Nueva letra: ${letter}.`).join(' ');
}
