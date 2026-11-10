import type { UnownToken, UnownTranslatorPlayerState, UnownTranslatorRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { hintCountdownLabel, hitCueRound, newLetters, newLettersAnnouncement, splitWords } from './presentation';

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
    expect(hintCountdownLabel(10_000, 4_200, true)).toBe('Siguiente letra en 6 s');
    expect(hintCountdownLabel(10_000, 10_000, true)).toBe('Siguiente letra en 1 s');
    expect(hintCountdownLabel(null, 4_200, false)).toBe('No quedan letras por revelar');
  });

  it('hintCountdownLabel: sin siguiente letra pero con glifos ocultos dice «No habrá más letras»', () => {
    expect(hintCountdownLabel(null, 4_200, true)).toBe('No habrá más letras');
  });

  it('hitCueRound: suena en el acierto propio, también si ese acierto cerró la ronda, y solo por esa ronda', () => {
    const solved: UnownTranslatorPlayerState = { role: 'PLAYER', canGuess: false, solved: true, answer: 'Pikachu', cooldownUntil: null, attemptCount: 1, lastAttempt: { outcome: 'CORRECT', at: 2_000 } };
    const pending: UnownTranslatorPlayerState = { ...solved, canGuess: true, solved: false, answer: null, lastAttempt: null };
    const round: UnownTranslatorRoundResult = { mode: 'CLASSIC', answer: 'Pikachu', pokemon: null, move: null, solves: [{ playerId: 'p1', points: 3, hiddenLetters: 2, solvedAt: 2_000 }], missingPlayerIds: [] };
    expect(hitCueRound({ phase: 'ROUND_ACTIVE', roundNumber: 2, lastRound: null }, solved, 'p1')).toBe(2);
    expect(hitCueRound({ phase: 'ROUND_ACTIVE', roundNumber: 2, lastRound: null }, pending, 'p1')).toBeNull();
    // Su acierto cerró la ronda: el estado llega ya en la revelación, con la misma clave que tendría en plena ronda.
    expect(hitCueRound({ phase: 'ROUND_RESULTS', roundNumber: 2, lastRound: round }, solved, 'p1')).toBe(2);
    expect(hitCueRound({ phase: 'ROUND_RESULTS', roundNumber: 2, lastRound: round }, { ...pending, canGuess: false }, 'p2')).toBeNull();
    expect(hitCueRound({ phase: 'GAME_RESULTS', roundNumber: 2, lastRound: round }, solved, 'p1')).toBeNull();
    expect(hitCueRound({ phase: 'ROUND_ACTIVE', roundNumber: 2, lastRound: null }, null, 'p1')).toBeNull();
  });

  it('newLettersAnnouncement: «Nueva letra: P.» por cada letra nueva', () => {
    expect(newLettersAnnouncement(['P'])).toBe('Nueva letra: P.');
    expect(newLettersAnnouncement(['P', 'Q'])).toBe('Nueva letra: P. Nueva letra: Q.');
  });
});
