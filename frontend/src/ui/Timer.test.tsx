import { describe, expect, it } from 'vitest';
import { timerSeconds, timerUrgent } from './Timer';

describe('Timer', () => {
  it('timerSeconds redondea hacia arriba y no baja de 0', () => {
    expect(timerSeconds(10_000, 0)).toBe(10);
    expect(timerSeconds(10_001, 0)).toBe(11);
    expect(timerSeconds(1_000, 999)).toBe(1);
    expect(timerSeconds(1_000, 5_000)).toBe(0);
    expect(timerSeconds(null, 0)).toBe(0);
  });
  it('timerUrgent en los últimos 5 s', () => {
    expect(timerUrgent(5_000, 0)).toBe(true);
    expect(timerUrgent(5_001, 0)).toBe(false);
    expect(timerUrgent(0, 100)).toBe(true);
    expect(timerUrgent(null, 0)).toBe(false);
  });
});
