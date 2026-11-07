import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDailyLeaderboard } from './daily-api';

const api = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('../lib/api', () => ({ api }));

describe('fetchDailyLeaderboard', () => {
  beforeEach(() => api.mockClear());

  it('sin fecha, la de hoy', async () => {
    await fetchDailyLeaderboard();
    expect(api).toHaveBeenCalledWith('/daily/leaderboard', undefined);
  });

  it('con fecha, la del día de la partida', async () => {
    const signal = new AbortController().signal;
    await fetchDailyLeaderboard(signal, '2026-11-06');
    expect(api).toHaveBeenCalledWith('/daily/leaderboard?date=2026-11-06', { signal });
  });
});
