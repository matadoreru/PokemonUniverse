import { describe, expect, it } from 'vitest';
import type { HigherLowerOutcome } from '@pokemon-universe/shared/public';
import { higherLowerBars, higherLowerChoiceLabels, higherLowerEndlessStatsLine, higherLowerOutcomeLine, higherLowerOutcomeStatus, higherLowerRevealCountdown, higherLowerStatsLine, higherLowerStreakMilestone, higherLowerVisibilityLabels } from './higher-lower-labels';

describe('higherLowerChoiceLabels', () => {
  it('traduce las tres respuestas al español', () => {
    expect(higherLowerChoiceLabels).toEqual({ HIGHER: 'Mayor', SAME: 'Igual', LOWER: 'Menor' });
  });
});

describe('higherLowerStatsLine', () => {
  it('usa singular con 1 y plural con el resto', () => {
    expect(higherLowerStatsLine({ correct: 1, sameCorrect: 1, bestStreak: 1, accuracy: 100 })).toBe('1 acierto · 1 igual · mejor racha 1 · 100%');
    expect(higherLowerStatsLine({ correct: 0, sameCorrect: 2, bestStreak: 0, accuracy: 0 })).toBe('0 aciertos · 2 iguales · mejor racha 0 · 0%');
  });
});

describe('higherLowerRevealCountdown', () => {
  it('anuncia la siguiente ronda mientras queden rondas', () => {
    expect(higherLowerRevealCountdown({ roundNumber: 1, totalRounds: 10 }, 3)).toBe('Siguiente ronda en 3s…');
  });
  it('anuncia la clasificación tras la última ronda, como el motor (roundNumber >= rounds)', () => {
    expect(higherLowerRevealCountdown({ roundNumber: 1, totalRounds: 1 }, 2)).toBe('Clasificación en 2s…');
    expect(higherLowerRevealCountdown({ roundNumber: 10, totalRounds: 10 }, 0)).toBe('Clasificación en 1s…');
  });
  it('en Racha infinita anuncia la clasificación cuando no queda nadie en pie', () => {
    expect(higherLowerRevealCountdown({ roundNumber: 4, totalRounds: 100, alive: ['p1'] }, 3)).toBe('Siguiente ronda en 3s…');
    expect(higherLowerRevealCountdown({ roundNumber: 4, totalRounds: 100, alive: [] }, 3)).toBe('Clasificación en 3s…');
    expect(higherLowerRevealCountdown({ roundNumber: 100, totalRounds: 100, alive: ['p1'] }, 3)).toBe('Clasificación en 3s…');
  });
});

describe('higherLowerEndlessStatsLine', () => {
  it('dice en qué ronda cayó cada uno, o que llegó al tope en pie', () => {
    expect(higherLowerEndlessStatsLine({ correct: 3, incorrect: 1 })).toBe('Cayó en la ronda 4');
    expect(higherLowerEndlessStatsLine({ correct: 0, incorrect: 1 })).toBe('Cayó en la ronda 1');
    expect(higherLowerEndlessStatsLine({ correct: 100, incorrect: 0 })).toBe('Sigue en pie');
  });
});

describe('higherLowerVisibilityLabels', () => {
  it('nombra los dos modos de visibilidad', () => {
    expect(higherLowerVisibilityLabels).toEqual({ LIVE: 'En directo', REVEAL: 'Al revelar' });
  });
});

const outcome = (streak: number, streakBonus: number, speedBonus: number, correct = true): HigherLowerOutcome => ({ choice: 'HIGHER', correct, basePoints: correct ? 1 : 0, streakBonus, speedBonus, awardedPoints: correct ? 1 + streakBonus + speedBonus : 0, streak });

describe('higherLowerBars', () => {
  it('higherLowerBars handles zero and equal values', () => {
    expect(higherLowerBars(0, 0)).toEqual({ previousScale: 0, currentScale: 0, leader: 'tie', diffLabel: '=' });
    expect(higherLowerBars(50, 50)).toEqual({ previousScale: 1, currentScale: 1, leader: 'tie', diffLabel: '=' });
  });
  it('escala sobre el mayor y firma la diferencia del actual', () => {
    const up = higherLowerBars(40, 63);
    expect(up.leader).toBe('current');
    expect(up.diffLabel).toBe('+23');
    expect(up.currentScale).toBe(1);
    expect(up.previousScale).toBeCloseTo(40 / 63);
    const down = higherLowerBars(63, 40);
    expect(down.leader).toBe('previous');
    expect(down.diffLabel).toBe('\u221223');
    expect(down.previousScale).toBe(1);
    expect(down.currentScale).toBeCloseTo(40 / 63);
  });
});

describe('higherLowerOutcomeLine', () => {
  it('pone el bonus de racha entre paréntesis y la rapidez aparte', () => {
    expect(higherLowerOutcomeLine(outcome(3, 1, 1))).toBe('Racha 3 (+1) · +1 rapidez');
  });
  it('solo la racha sin bonus', () => {
    expect(higherLowerOutcomeLine(outcome(1, 0, 0))).toBe('Racha 1');
  });
  it('racha sin bonus con rapidez', () => {
    expect(higherLowerOutcomeLine(outcome(2, 0, 1))).toBe('Racha 2 · +1 rapidez');
  });
});

describe('higherLowerStreakMilestone', () => {
  it('celebra las rachas de 3, 5 y 10', () => {
    expect(higherLowerStreakMilestone(outcome(3, 1, 0))).toEqual({ title: '¡Racha ×3!', subtitle: '+1', spoken: 'Hito: 3 aciertos seguidos, +1 de bonus de racha.' });
    expect(higherLowerStreakMilestone(outcome(5, 2, 1))).toEqual({ title: '¡Racha ×5!', subtitle: '+2', spoken: 'Hito: 5 aciertos seguidos, +2 de bonus de racha.' });
    expect(higherLowerStreakMilestone(outcome(10, 0, 0))).toEqual({ title: '¡Racha ×10!', subtitle: '¡Sigue así!', spoken: 'Hito: 10 aciertos seguidos.' });
  });
  it('no celebra otras rachas ni un fallo', () => {
    expect(higherLowerStreakMilestone(outcome(4, 1, 0))).toBeNull();
    expect(higherLowerStreakMilestone(outcome(5, 2, 0, false))).toBeNull();
  });
});

describe('higherLowerOutcomeStatus', () => {
  it('nombra el resultado con texto, no solo con color o glifo', () => {
    expect(higherLowerOutcomeStatus(outcome(1, 0, 0))).toBe('acierto');
    expect(higherLowerOutcomeStatus(outcome(0, 0, 0, false))).toBe('Fallo');
    expect(higherLowerOutcomeStatus({ ...outcome(0, 0, 0, false), choice: null })).toBe('Sin respuesta');
    expect(higherLowerOutcomeStatus(undefined)).toBe('Sin respuesta');
  });
});
