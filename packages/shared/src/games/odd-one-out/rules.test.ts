import { describe, expect, it } from 'vitest';
import { defaultOddOneOutConfig, oddOneOutConfigSchema } from './config.js';
import { oddOneOutActionSchema } from './types.js';
import { ODD_ONE_OUT_ORDER_BONUSES, oddOneOutScoringLabel } from './rules.js';

describe('El Intruso', () => {
  it('explica la puntuación', () => {
    expect(oddOneOutScoringLabel()).toBe('1 punto por acierto, y +3, +2 y +1 a los tres primeros en acertar.');
    expect([...ODD_ONE_OUT_ORDER_BONUSES]).toEqual([3, 2, 1]);
  });

  it('la configuración por defecto es válida y los valores fuera de rango o claves desconocidas se rechazan', () => {
    expect(oddOneOutConfigSchema.safeParse(defaultOddOneOutConfig).success).toBe(true);
    expect(defaultOddOneOutConfig.generations).toHaveLength(9);
    expect([defaultOddOneOutConfig.rounds, defaultOddOneOutConfig.roundSeconds]).toEqual([10, 20]);
    for (const bad of [{ rounds: 2 }, { rounds: 31 }, { roundSeconds: 9 }, { roundSeconds: 61 }, { mode: 'CLASSIC' }, { extra: true }]) {
      expect(oddOneOutConfigSchema.safeParse({ ...defaultOddOneOutConfig, ...bad }).success).toBe(false);
    }
  });

  it('la acción solo admite A-D y es estricta', () => {
    expect(oddOneOutActionSchema.safeParse({ type: 'VOTE', optionId: 'D' }).success).toBe(true);
    expect(oddOneOutActionSchema.safeParse({ type: 'VOTE', optionId: 'E' }).success).toBe(false);
    expect(oddOneOutActionSchema.safeParse({ type: 'VOTE', optionId: 'A', extra: 1 }).success).toBe(false);
  });
});
