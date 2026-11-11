import { describe, expect, it } from 'vitest';
import { defaultUnownTranslatorConfig, unownTranslatorConfigSchema } from './config.js';
import { UNOWN_GLYPH_COUNT, UNOWN_MAX_GUESS_LENGTH, unownTranslatorScoringLabel } from './rules.js';

describe('Traductor Unown', () => {
  it('explica la puntuación', () => {
    expect(unownTranslatorScoringLabel()).toBe('1 punto por descifrar y 1 más por cada letra que siguiera oculta.');
    expect(UNOWN_GLYPH_COUNT).toBe(26);
    expect(UNOWN_MAX_GUESS_LENGTH).toBe(40);
  });

  it('acepta la configuración por defecto y rechaza valores fuera de rango o claves desconocidas', () => {
    expect(unownTranslatorConfigSchema.safeParse(defaultUnownTranslatorConfig).success).toBe(true);
    for (const bad of [{ rounds: 11 }, { roundSeconds: 29 }, { hintSeconds: 16 }, { extra: true }]) {
      expect(unownTranslatorConfigSchema.safeParse({ ...defaultUnownTranslatorConfig, ...bad }).success).toBe(false);
    }
  });

  it('una configuración sin mode sale con CLASSIC', () => {
    const stored = Object.fromEntries(Object.entries(defaultUnownTranslatorConfig).filter(([key]) => key !== 'mode'));
    expect(unownTranslatorConfigSchema.parse(stored).mode).toBe('CLASSIC');
  });
});
