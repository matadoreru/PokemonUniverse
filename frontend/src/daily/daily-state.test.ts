import { describe, expect, it } from 'vitest';
import type { DailyOverviewResponse } from '../lib/api-contract';
import { countdownText, dailyChipText, dailyPlayersText, dailyRowAction } from './daily-state';

const overviewFixture = (overrides: Partial<DailyOverviewResponse> = {}): DailyOverviewResponse => ({
  date: '2026-11-07', resetsAt: '2026-11-07T23:00:00Z', gameId: 'higher-lower', name: 'Higher or Lower', icon: 'trending-up',
  roundCount: 10, players: 40, status: 'AVAILABLE', result: null, ...overrides,
});

const finished = (score: number, position: number, total: number) => overviewFixture({
  status: 'FINISHED', result: { score, correct: 7, roundCount: 10, rounds: [1, 1, 0, 1, 1, 1, 0, 1, 1, -1], position, total },
});

describe('dailyRowAction', () => {
  it.each([
    ['AVAILABLE', 'play'],
    ['IN_PROGRESS', 'resume'],
    ['FINISHED', 'result'],
    ['ABANDONED', 'leaderboard'],
  ] as const)('%s → %s', (status, action) => {
    expect(dailyRowAction(overviewFixture({ status }))).toBe(action);
  });
});

describe('dailyChipText', () => {
  it('terminado: puntos, puesto y total', () => {
    expect(dailyChipText(finished(612, 3, 40))).toBe('612 pts · 3.º de 40');
  });
  it('agrupa los miles como el texto para compartir', () => {
    expect(dailyChipText(finished(1234, 1, 2))).toBe('1.234 pts · 1.º de 2');
  });
  it('con empate, los dos comparten el puesto que da el servidor', () => {
    // Clasificación 1, 1, 3: los dos empatados a 500 dicen «1.º»; el siguiente, «3.º» (no «2.º»).
    expect(dailyChipText(finished(500, 1, 3))).toBe('500 pts · 1.º de 3');
    expect(dailyChipText(finished(420, 3, 3))).toBe('420 pts · 3.º de 3');
  });
  it('abandonado', () => {
    expect(dailyChipText(overviewFixture({ status: 'ABANDONED' }))).toBe('Abandonado');
  });
  it('sin chip mientras se puede jugar o sigue en curso', () => {
    expect(dailyChipText(overviewFixture())).toBeNull();
    expect(dailyChipText(overviewFixture({ status: 'IN_PROGRESS' }))).toBeNull();
  });
});

describe('dailyPlayersText', () => {
  it('singular y plural', () => {
    expect(dailyPlayersText(1)).toBe('1 ha jugado hoy');
    expect(dailyPlayersText(40)).toBe('40 han jugado hoy');
    expect(dailyPlayersText(0)).toBe('Nadie ha jugado todavía');
  });
});

describe('countdownText', () => {
  const resetsAt = '2026-11-07T23:00:00Z';
  const at = (iso: string) => Date.parse(iso);
  it('horas y minutos', () => {
    expect(countdownText(resetsAt, at('2026-11-07T17:48:00Z'))).toBe('Nuevo reto en 5 h 12 min');
  });
  it('trunca los segundos', () => {
    expect(countdownText(resetsAt, at('2026-11-07T17:47:01Z'))).toBe('Nuevo reto en 5 h 12 min');
  });
  it('horas en punto y solo minutos', () => {
    expect(countdownText(resetsAt, at('2026-11-07T18:00:00Z'))).toBe('Nuevo reto en 5 h');
    expect(countdownText(resetsAt, at('2026-11-07T22:15:00Z'))).toBe('Nuevo reto en 45 min');
  });
  it('menos de 1 min (y pasada la hora, también)', () => {
    expect(countdownText(resetsAt, at('2026-11-07T22:59:30Z'))).toBe('Nuevo reto en menos de 1 min');
    expect(countdownText(resetsAt, at('2026-11-07T23:00:05Z'))).toBe('Nuevo reto en menos de 1 min');
  });
  it('el día del cambio de hora cuenta horas reales, no de reloj', () => {
    // 25/10/2026: de las 00:00 de Madrid (CEST, +02:00) a la medianoche siguiente (CET, +01:00) hay 25 h.
    expect(countdownText('2026-10-25T23:00:00Z', at('2026-10-25T00:00:00+02:00'))).toBe('Nuevo reto en 25 h');
    // 29/03/2026: de las 00:00 (CET) a la medianoche siguiente (CEST) hay 23 h.
    expect(countdownText('2026-03-29T22:00:00Z', at('2026-03-29T00:00:00+01:00'))).toBe('Nuevo reto en 23 h');
  });
});
