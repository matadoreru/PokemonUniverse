import type { UnownToken } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { hintCountdownLabel, newLetters, newLettersAnnouncement, splitWords } from './presentation';

const glyph = (n: number): UnownToken => ({ kind: 'GLYPH', glyph: n });
const letter = (n: number, l: string): UnownToken => ({ kind: 'LETTER', glyph: n, letter: l });
const space: UnownToken = { kind: 'LITERAL', text: ' ' };

describe('Traductor Unown: presentación', () => {
  it('splitWords corta PUNO FUEGO por el espacio y no lo incluye', () => {
    const puno = [letter(15, 'P'), glyph(20), glyph(13), glyph(14)];
    const fuego = [glyph(5), glyph(20), glyph(4), glyph(6), glyph(14)];
    expect(splitWords([...puno, space, ...fuego])).toEqual([puno, fuego]);
  });

  it('splitWords deja los demás literales dentro de su palabra y no crea palabras vacías', () => {
    const dot: UnownToken = { kind: 'LITERAL', text: '.' };
    expect(splitWords([space, glyph(12), glyph(17), dot, space, space, glyph(12)])).toEqual([[glyph(12), glyph(17), dot], [glyph(12)]]);
  });

  it('newLetters devuelve la letra nueva', () => {
    expect(newLetters([{ glyph: 3, letter: 'A' }], [{ glyph: 3, letter: 'A' }, { glyph: 9, letter: 'P' }])).toEqual(['P']);
  });

  it('newLetters devuelve dos letras nuevas en su orden', () => {
    expect(newLetters([], [{ glyph: 9, letter: 'P' }, { glyph: 1, letter: 'Q' }])).toEqual(['P', 'Q']);
    expect(newLetters([{ glyph: 9, letter: 'P' }], [{ glyph: 9, letter: 'P' }])).toEqual([]);
  });

  it('hintCountdownLabel: segundos hasta la siguiente letra o que no quedan', () => {
    expect(hintCountdownLabel(10_000, 4_200)).toBe('Siguiente letra en 6 s');
    expect(hintCountdownLabel(10_000, 10_000)).toBe('Siguiente letra en 1 s');
    expect(hintCountdownLabel(null, 4_200)).toBe('No quedan letras por revelar');
  });

  it('newLettersAnnouncement: «Nueva letra: P.» por cada letra nueva', () => {
    expect(newLettersAnnouncement(['P'])).toBe('Nueva letra: P.');
    expect(newLettersAnnouncement(['P', 'Q'])).toBe('Nueva letra: P. Nueva letra: Q.');
  });
});
