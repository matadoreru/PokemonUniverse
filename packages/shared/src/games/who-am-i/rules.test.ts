import { describe, expect, it } from 'vitest';
import { defaultWhoAmIConfig, whoAmIConfigSchema } from './config.js';
import { whoAmIActionSchema } from './types.js';
import { WHO_AM_I_MAX_QUESTION_LENGTH, whoAmIScoringLabel } from './rules.js';

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0]?.message;

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

  it('ASK_QUESTION rechaza la pregunta vacía y la larga con su mensaje', () => {
    expect(firstMessage(whoAmIActionSchema.safeParse({ type: 'ASK_QUESTION', text: '   ' }))).toBe('Escribe una pregunta antes de enviarla.');
    expect(firstMessage(whoAmIActionSchema.safeParse({ type: 'ASK_QUESTION', text: 'a'.repeat(121) }))).toBe('La pregunta no puede superar 120 caracteres.');
    expect(whoAmIActionSchema.parse({ type: 'ASK_QUESTION', text: ' ¿Soy de fuego? ' })).toEqual({ type: 'ASK_QUESTION', text: '¿Soy de fuego?' });
  });

  it('rechaza respuestas desconocidas y claves extra, y acepta las acciones válidas', () => {
    expect(whoAmIActionSchema.safeParse({ type: 'ANSWER_QUESTION', answer: 'MAYBE' }).success).toBe(false);
    expect(whoAmIActionSchema.safeParse({ type: 'PASS_TURN', extra: 1 }).success).toBe(false);
    expect(whoAmIActionSchema.safeParse({ type: 'PASS_TURN' }).success).toBe(true);
    expect(whoAmIActionSchema.safeParse({ type: 'ANSWER_QUESTION', answer: 'PARTLY' }).success).toBe(true);
    expect(whoAmIActionSchema.safeParse({ type: 'GUESS_SELF', pokemonId: '25' }).success).toBe(true);
    expect(whoAmIActionSchema.safeParse({ type: 'GUESS_SELF', pokemonId: '' }).success).toBe(false);
  });
});
