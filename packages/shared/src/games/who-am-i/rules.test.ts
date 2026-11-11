import { describe, expect, it } from 'vitest';
import { defaultWhoAmIConfig, whoAmIConfigSchema } from './config.js';
import { WHO_AM_I_MAX_QUESTION_LENGTH, whoAmIScoringLabel } from './rules.js';

describe('¿Quién soy?', () => {
  it('explica la puntuación', () => {
    expect(whoAmIScoringLabel()).toBe('10 puntos menos uno por pregunta (mínimo 2), y +3, +2 y +1 a los tres primeros en acertar.');
    expect(WHO_AM_I_MAX_QUESTION_LENGTH).toBe(120);
  });

  it('la configuración por defecto es válida y los valores fuera de rango o claves desconocidas se rechazan', () => {
    expect(whoAmIConfigSchema.safeParse(defaultWhoAmIConfig).success).toBe(true);
    expect(defaultWhoAmIConfig.generations).toHaveLength(9);
    expect([defaultWhoAmIConfig.maxLaps, defaultWhoAmIConfig.askSeconds, defaultWhoAmIConfig.answerSeconds]).toEqual([10, 45, 20]);
    for (const bad of [{ maxLaps: 2 }, { maxLaps: 21 }, { askSeconds: 19 }, { askSeconds: 91 }, { answerSeconds: 9 }, { answerSeconds: 61 }, { extra: true }, { mode: 'CLASSIC' }]) {
      expect(whoAmIConfigSchema.safeParse({ ...defaultWhoAmIConfig, ...bad }).success).toBe(false);
    }
  });
});
