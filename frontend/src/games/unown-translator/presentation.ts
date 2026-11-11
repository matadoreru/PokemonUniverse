import type { UnownAlphabetEntry, UnownToken, UnownTranslatorPlayerState, UnownTranslatorPublicState } from '@pokemon-universe/shared/public';

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

/**
 * Medidas del mensaje para que el CSS escale las piezas: cuántas palabras hay, cuántas piezas suman (sin los espacios)
 * y cuántas tiene la palabra más larga. Nunca son cero.
 */
export function messageMetrics(words: readonly (readonly UnownToken[])[]): { words: number; total: number; longest: number } {
  const lengths = words.map((word) => word.length);
  return { words: Math.max(1, lengths.length), total: Math.max(1, lengths.reduce((sum, n) => sum + n, 0)), longest: Math.max(1, ...lengths) };
}

/**
 * Las letras que anunciar al pasar de `before` a `next`: el alfabeto es de la ronda, así que al cambiar de ronda todas
 * las de la nueva (las iniciales) son nuevas, aunque alguna coincida con la ronda anterior; en la misma ronda, solo las
 * que no estaban.
 */
export function lettersToAnnounce(before: { roundNumber: number; alphabet: readonly UnownAlphabetEntry[] }, next: { roundNumber: number; alphabet: readonly UnownAlphabetEntry[] }): string[] {
  return newLetters(before.roundNumber === next.roundNumber ? before.alphabet : [], next.alphabet);
}

/** Las letras que trae `next` y no estaban en `previous`, en su orden (para «Nueva letra: P» en la región viva). */
export function newLetters(previous: readonly UnownAlphabetEntry[], next: readonly UnownAlphabetEntry[]): string[] {
  const known = new Set(previous.map((entry) => entry.glyph));
  return next.filter((entry) => !known.has(entry.glyph)).map((entry) => entry.letter);
}

/**
 * Cuánto falta para la siguiente letra (`now` en hora del servidor). Sin siguiente letra: «No habrá más letras» si aún
 * quedan glifos ocultos (no se programa una pista que caería tras el fin de ronda) o, si no, que no quedan por revelar.
 */
export function hintCountdownLabel(nextHintAt: number | null, now: number, hiddenGlyphs: boolean): string {
  if (nextHintAt === null) return hiddenGlyphs ? 'No habrá más letras' : 'No quedan letras por revelar';
  return `Siguiente letra en ${Math.max(1, Math.ceil((nextHintAt - now) / 1_000))} s`;
}

/** Lo que anuncia la región viva al llegar letras nuevas: «Nueva letra: P. Nueva letra: Q.». */
export function newLettersAnnouncement(letters: readonly string[]): string {
  return letters.map((letter) => `Nueva letra: ${letter}.`).join(' ');
}

/**
 * La ronda por la que suena «hit» (clave de `useSfxCue`), o `null`: la del propio acierto, en plena ronda o en la
 * revelación si ese acierto la cerró (`lastRound.solves` lo incluye). Como la clave no cambia al pasar de una fase a otra,
 * suena una sola vez por ronda.
 */
export function hitCueRound(game: Pick<UnownTranslatorPublicState, 'phase' | 'roundNumber' | 'lastRound'>, player: UnownTranslatorPlayerState | null, selfId: string): number | null {
  if (player?.role !== 'PLAYER' || !player.solved) return null;
  if (game.phase === 'ROUND_ACTIVE') return game.roundNumber;
  if (game.phase === 'ROUND_RESULTS' && game.lastRound?.solves.some((solve) => solve.playerId === selfId)) return game.roundNumber;
  return null;
}
