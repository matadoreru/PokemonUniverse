import { describe, expect, it } from 'vitest';
import { guessRecords, guessRoundFirsts, guessStatsLine, guessTop } from './results';

const entries = [
  { name: 'Ana', stats: { correct: 2, missed: 1, totalAttempts: 4, firstTry: 0, roundFirsts: 2, solveTimeTotalMs: 6_000, bestTimeMs: 2_500 } },
  { name: 'Bruno', stats: { correct: 2, missed: 1, totalAttempts: 2, firstTry: 2, roundFirsts: 1, solveTimeTotalMs: 4_000, bestTimeMs: 1_500 } },
  { name: 'Carla', stats: { correct: 0, missed: 3, totalAttempts: 3, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0 } },
];

describe('guess-kit: resultados', () => {
  it('guessTop: mayor o menor entre los que pasan de 0, con empates; nadie → null', () => {
    expect(guessTop(entries, 'correct')).toEqual({ value: 2, names: ['Ana', 'Bruno'] });
    expect(guessTop(entries, 'bestTimeMs', true)).toEqual({ value: 1_500, names: ['Bruno'] });
    expect(guessTop(entries, 'missing')).toBeNull();
    expect(guessTop(entries, (stats) => Number(stats.firstTry ?? 0) * 10)).toEqual({ value: 20, names: ['Bruno'] });
  });

  it('guessStatsLine: la base común más los extras; sin aciertos, media y mejor «—»', () => {
    expect(guessStatsLine(entries[0]!.stats)).toBe('2 aciertos · 1 sin acertar · 4 intentos · 50% precisión · media 3.0s · mejor 2.5s · 0 al primer intento');
    expect(guessStatsLine(entries[2]!.stats, ['0 a máximo zoom'])).toBe('0 aciertos · 3 sin acertar · 3 intentos · 0% precisión · media — · mejor — · 0 al primer intento · 0 a máximo zoom');
    expect(guessStatsLine({})).toContain('media —');
  });

  it('guessRecords: más aciertos, el más rápido (mínimo), al primer intento y primeros de ronda', () => {
    const records = guessRecords(entries);
    expect(records.correct).toEqual({ value: '2', names: ['Ana', 'Bruno'] });
    expect(records.fastest).toEqual({ value: '1.5s', names: ['Bruno'] });
    expect(records.firstTry).toEqual({ value: '2', names: ['Bruno'] });
    expect(records.roundFirsts).toEqual({ value: '2', names: ['Ana'] });
    expect(guessRecords([{ name: 'X', stats: {} }])).toEqual({ correct: null, fastest: null, firstTry: null, roundFirsts: null });
  });

  it('Zoomed: «primero en acertar» sale de firstPositions', () => {
    const zoomed = [{ name: 'Ana', stats: { correct: 3, firstPositions: 2 } }, { name: 'Bruno', stats: { correct: 1, firstPositions: 1 } }];
    expect(guessRoundFirsts(zoomed[0]!.stats)).toBe(2);
    expect(guessRecords(zoomed).roundFirsts).toEqual({ value: '2', names: ['Ana'] });
  });
});
