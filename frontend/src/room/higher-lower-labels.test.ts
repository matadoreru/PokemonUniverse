import { describe, expect, it } from 'vitest';
import type { HigherLowerOutcome } from '@pokemon-universe/shared/public';
import { higherLowerChoiceLabels, higherLowerOutcomeDetail, higherLowerRevealCountdown, higherLowerStatsLine, higherLowerVisibilityLabels } from './higher-lower-labels';

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
});

describe('higherLowerVisibilityLabels', () => {
  it('nombra los dos modos de visibilidad', () => {
    expect(higherLowerVisibilityLabels).toEqual({ LIVE: 'En directo', REVEAL: 'Al revelar' });
  });
});

describe('higherLowerOutcomeDetail', () => {
  const outcome = (streakBonus: number, speedBonus: number): HigherLowerOutcome => ({ choice: 'HIGHER', correct: true, basePoints: 1, streakBonus, speedBonus, awardedPoints: 1 + streakBonus + speedBonus, streak: 3 });
  it('desglosa los bonus de racha y de rapidez', () => {
    expect(higherLowerOutcomeDetail(outcome(1, 1))).toBe('+1 racha · +1 rapidez');
    expect(higherLowerOutcomeDetail(outcome(0, 1))).toBe('+1 rapidez');
    expect(higherLowerOutcomeDetail(outcome(2, 0))).toBe('+2 racha');
  });
  it('devuelve null sin bonus', () => {
    expect(higherLowerOutcomeDetail(outcome(0, 0))).toBeNull();
  });
});
