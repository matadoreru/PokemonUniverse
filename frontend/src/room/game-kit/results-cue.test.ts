import { describe, expect, it } from 'vitest';
import { resultsCue } from './ResultsShell';

describe('resultsCue', () => {
  it('podio de la sesión: win al campeón, podium al resto, nunca ambos', () => {
    expect(resultsCue({ podium: true, won: true })).toBe('game.win');
    expect(resultsCue({ podium: true, won: false })).toBe('game.podium');
  });
  it('resultados de partida: solo win al ganador', () => {
    expect(resultsCue({ podium: false, won: true })).toBe('game.win');
    expect(resultsCue({ podium: false, won: false })).toBeNull();
  });
});
