import { describe, expect, it } from 'vitest';
import { summarizeGameConfig } from './game-config-summary';

describe('summarizeGameConfig', () => {
  it('uses the singular with a single round, lap or mistake', () => {
    expect(summarizeGameConfig({ rounds: 1, roundSeconds: 30 })).toBe('1 ronda · 30 s por ronda');
    expect(summarizeGameConfig({ maxRounds: 1 })).toBe('1 ronda máx.');
    expect(summarizeGameConfig({ laps: 1, mistakesAllowed: 1 })).toBe('1 vuelta · 1 error');
  });

  it('keeps the plural otherwise and falls back when there is nothing to show', () => {
    expect(summarizeGameConfig({ rounds: 5, laps: 2, mistakesAllowed: 0 })).toBe('5 rondas · 2 vueltas · 0 errores');
    expect(summarizeGameConfig(null)).toBe('Configuración lista');
  });
});
