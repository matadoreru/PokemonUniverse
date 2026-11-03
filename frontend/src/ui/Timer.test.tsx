import { describe, expect, it } from 'vitest';
import { countdownCue, timerSeconds, timerUrgent } from './Timer';

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

describe('countdownCue', () => {
  const end = 10_000;
  it('solo suena en los 3 últimos segundos', () => {
    expect(countdownCue(end, 5_000, null)).toBeNull();
    expect(countdownCue(end, 6_500, null)).toBeNull();
    expect(countdownCue(end, 7_000, null)).toBe(3);
    expect(countdownCue(end, 8_900, null)).toBe(2);
    expect(countdownCue(end, 9_500, null)).toBe(1);
  });
  it('una vez por segundo: no repite el que ya sonó', () => {
    expect(countdownCue(end, 7_200, 3)).toBeNull();
    expect(countdownCue(end, 8_100, 3)).toBe(2);
  });
  it('en cero o sin plazo no suena', () => {
    expect(countdownCue(end, 10_000, 1)).toBeNull();
    expect(countdownCue(end, 12_000, null)).toBeNull();
    expect(countdownCue(null, 0, null)).toBeNull();
  });
});

describe('countdownCue con milisegundos restantes (ServerTimer)', () => {
  it('equivale a deadline - restante', () => {
    const deadline = 50_000;
    expect(countdownCue(deadline, deadline - 2_400, null)).toBe(3);
    expect(countdownCue(deadline, deadline - 3_000, null)).toBe(3);
    expect(countdownCue(deadline, deadline - 3_001, null)).toBe(4 > 3 ? null : 0);
  });
});
