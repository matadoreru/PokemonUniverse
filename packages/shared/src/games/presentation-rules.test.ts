import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEARNSET_INITIAL_POINTS, LEARNSET_MIN_POINTS, LEARNSET_ORDER_BONUSES, learnsetManualRevealPoints, learnsetPoints,
  MOST_LIKELY_TO_WIN_POINTS, normalizeTabooText, ONE_OF_US_IS_FAKE_FAKE_ROUND_POINTS, ONE_OF_US_IS_FAKE_NORMAL_ROUND_POINTS,
  POKE_TABOO_DESCRIPTOR_POINTS, POKE_TABOO_GUESSER_MAX_POINTS, POKE_TABOO_GUESSER_MIN_POINTS, RED_FLAG_WIN_POINTS,
  SKETCHMON_DRAWER_POINTS, SPEED_PODIUM_BONUSES, SPEED_PODIUM_MAX_POINTS, SPEED_PODIUM_MAX_STREAK_BONUS, SPEED_PODIUM_MIN_POINTS, speedPodiumScoringText, speedPodiumStreakBonus, SKETCHMON_GUESSER_MAX_POINTS, SKETCHMON_GUESSER_MIN_POINTS, TCG_HIGHER_LOWER_SAME_POINTS,
  TYPE_DUEL_MAX_INVALID_COMBINATIONS, WHO_IS_WHO_WIN_POINTS, WOULD_YOU_RATHER_MAJORITY_POINTS, WOULD_YOU_RATHER_PREDICTION_POINTS,
} from '../public.js';

/**
 * La web explica la puntuación con copias de reglas de los motores. `web-contracts/presentation-rules.json` lo graba
 * `WebPresentationRulesTest` desde Java (aquí solo se lee): si cambia un número en Java, este test falla hasta que la
 * copia TS diga lo mismo.
 */
interface PresentationRules {
  'learnset-guess': { initialPoints: number; minPoints: number; orderBonuses: number[]; learnsetPoints: Record<string, number>; learnsetManualRevealPoints: Record<string, number> };
  'most-likely-to': { winPoints: number };
  'one-of-us-is-fake': { normalRoundPoints: number; fakeRoundPoints: number };
  'pokemon-red-flag': { winPoints: number };
  'tcg-higher-lower': { samePoints: number; correctPoints: number };
  'would-you-rather': { majorityPoints: number; predictionPoints: number };
  'poke-taboo': { guesserMaxPoints: number; guesserMinPoints: number; descriptorPoints: number; normalizeTabooText: Record<string, string> };
  sketchmon: { drawerPoints: number; guesserMaxPoints: number; guesserMinPoints: number };
  'speed-podium': { maxSpeedPoints: number; minSpeedPoints: number; podiumBonuses: number[]; maxStreakBonus: number; streakBonus: Record<string, number> };
  'type-duel': { maxInvalidCombinations: number };
  'who-is-who-pokemon': { winPoints: number };
}

const rules = JSON.parse(readFileSync(new URL('../../../../backend/src/test/resources/web-contracts/presentation-rules.json', import.meta.url), 'utf8')) as PresentationRules;
const pairs = (table: Record<string, number>) => Object.entries(table).map(([key, value]) => [...key.split(',').map(Number), value] as [number, number, number]);

describe('reglas de presentación frente a Java', () => {
  it('Learnset Guess: constantes, learnsetPoints y learnsetManualRevealPoints', () => {
    const java = rules['learnset-guess'];
    expect({ initialPoints: LEARNSET_INITIAL_POINTS, minPoints: LEARNSET_MIN_POINTS, orderBonuses: [...LEARNSET_ORDER_BONUSES] })
      .toEqual({ initialPoints: java.initialPoints, minPoints: java.minPoints, orderBonuses: java.orderBonuses });
    for (const [stage, order, points] of pairs(java.learnsetPoints)) expect(learnsetPoints(stage, order), `${stage},${order}`).toBe(points);
    for (const [total, visible, points] of pairs(java.learnsetManualRevealPoints)) expect(learnsetManualRevealPoints(total, visible), `${total},${visible}`).toBe(points);
  });

  it('Poké Taboo: puntos y normalizeTabooText', () => {
    const java = rules['poke-taboo'];
    expect({ guesserMaxPoints: POKE_TABOO_GUESSER_MAX_POINTS, guesserMinPoints: POKE_TABOO_GUESSER_MIN_POINTS, descriptorPoints: POKE_TABOO_DESCRIPTOR_POINTS })
      .toEqual({ guesserMaxPoints: java.guesserMaxPoints, guesserMinPoints: java.guesserMinPoints, descriptorPoints: java.descriptorPoints });
    for (const [input, output] of Object.entries(java.normalizeTabooText)) expect(normalizeTabooText(input), input).toBe(output);
  });

  it('Sketchmon, Type Duel y Quién es Quién', () => {
    expect({ drawerPoints: SKETCHMON_DRAWER_POINTS, guesserMaxPoints: SKETCHMON_GUESSER_MAX_POINTS, guesserMinPoints: SKETCHMON_GUESSER_MIN_POINTS }).toEqual(rules.sketchmon);
    expect({ maxInvalidCombinations: TYPE_DUEL_MAX_INVALID_COMBINATIONS }).toEqual(rules['type-duel']);
    expect({ winPoints: WHO_IS_WHO_WIN_POINTS }).toEqual(rules['who-is-who-pokemon']);
  });

  it('rapidez y podio (Who\'s That, Cry Quiz y Palette): constantes, racha y el texto de ayuda', () => {
    const java = rules['speed-podium'];
    expect({ maxSpeedPoints: SPEED_PODIUM_MAX_POINTS, minSpeedPoints: SPEED_PODIUM_MIN_POINTS, podiumBonuses: [...SPEED_PODIUM_BONUSES], maxStreakBonus: SPEED_PODIUM_MAX_STREAK_BONUS })
      .toEqual({ maxSpeedPoints: java.maxSpeedPoints, minSpeedPoints: java.minSpeedPoints, podiumBonuses: java.podiumBonuses, maxStreakBonus: java.maxStreakBonus });
    for (const [solves, bonus] of Object.entries(java.streakBonus)) expect(speedPodiumStreakBonus(Number(solves)), solves).toBe(bonus);
    // La ayuda sale de las constantes: dice los tres extras del podio (antes Palette decía «el primero suma un extra»).
    expect(speedPodiumScoringText()).toBe(`Cuanto antes aciertes, más puntos; los 3 primeros suman ${java.podiumBonuses.slice(0, -1).join(', ')} y ${java.podiumBonuses.at(-1)} extra.`);
    expect(speedPodiumScoringText(true)).toContain(`hasta +${java.maxStreakBonus}`);
  });

  it('juegos de votar y Higher or Lower TCG', () => {
    expect({ winPoints: MOST_LIKELY_TO_WIN_POINTS }).toEqual(rules['most-likely-to']);
    expect({ normalRoundPoints: ONE_OF_US_IS_FAKE_NORMAL_ROUND_POINTS, fakeRoundPoints: ONE_OF_US_IS_FAKE_FAKE_ROUND_POINTS }).toEqual(rules['one-of-us-is-fake']);
    expect({ winPoints: RED_FLAG_WIN_POINTS }).toEqual(rules['pokemon-red-flag']);
    expect({ majorityPoints: WOULD_YOU_RATHER_MAJORITY_POINTS, predictionPoints: WOULD_YOU_RATHER_PREDICTION_POINTS }).toEqual(rules['would-you-rather']);
    // Los demás aciertos valen 1: la web lo da por hecho («+1 punto»).
    expect({ samePoints: TCG_HIGHER_LOWER_SAME_POINTS, correctPoints: 1 }).toEqual(rules['tcg-higher-lower']);
  });
});
