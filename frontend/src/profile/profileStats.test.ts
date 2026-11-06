import { describe, expect, it } from 'vitest';
import { formatDerivedMetric, formatStoredMetric, gameWinRate, globalWinRate, sortProfileGames, visibleStoredMetrics, winRate } from './profileStats';

describe('profile stats', () => {
  it('rounds the win rate and shows 0 % with no games', () => {
    expect(winRate(2, 3)).toBe('67 %');
    expect(winRate(0, 0)).toBe('0 %');
  });

  it('computes the win rate of a game over its ranked games only', () => {
    // 4 jugadas, 1 cooperativa: 2 ganadas de 3 clasificadas.
    expect(gameWinRate({ gamesPlayed: 4, gamesWon: 2, metrics: { unrankedGamesPlayed: 1 } })).toBe('67 %');
    expect(gameWinRate({ gamesPlayed: 3, gamesWon: 1, metrics: {} })).toBe('33 %');
    // Solo cooperativas: ninguna clasificada, 0 % y no NaN.
    expect(gameWinRate({ gamesPlayed: 2, gamesWon: 0, metrics: { unrankedGamesPlayed: 2 } })).toBe('0 %');
  });

  it('computes the global win rate without the unranked games of every game', () => {
    const games = [
      { stats: { metrics: { unrankedGamesPlayed: 2 } } },
      { stats: { metrics: { correct: 5 } } },
      { stats: { metrics: { unrankedGamesPlayed: 1 } } },
    ];
    // 7 jugadas, 3 sin clasificar: 2 ganadas de 4.
    expect(globalWinRate({ gamesPlayed: 7, gamesWon: 2 }, games)).toBe('50 %');
    expect(globalWinRate({ gamesPlayed: 3, gamesWon: 0 }, games)).toBe('0 %');
    expect(globalWinRate({ gamesPlayed: 0, gamesWon: 0 }, [])).toBe('0 %');
  });

  it('hides the internal unranked games metric from the visible rows', () => {
    const metrics = [{ key: 'coopGamesPlayed' }, { key: 'unrankedGamesPlayed' }, { key: 'coopFinds' }];
    expect(visibleStoredMetrics(metrics).map((metric) => metric.key)).toEqual(['coopGamesPlayed', 'coopFinds']);
  });

  it('formats stored and derived metrics', () => {
    expect(formatStoredMetric({ key: 't', label: 'T', aggregation: 'MIN', format: 'DURATION_MS' }, 1234)).toBe('1,2 s');
    expect(formatStoredMetric({ key: 'n', label: 'N', aggregation: 'SUM' }, 12)).toBe('12');
    const percent = { key: 'p', label: 'P', kind: 'PERCENT' as const, numerator: 'a', denominator: ['a', 'b'] };
    expect(formatDerivedMetric(percent, { a: 1, b: 3 })).toBe('25 %');
    expect(formatDerivedMetric(percent, {})).toBe('0 %');
    const average = { key: 'm', label: 'M', kind: 'AVERAGE' as const, numerator: 'a', denominator: ['b'] };
    expect(formatDerivedMetric(average, { a: 5, b: 2 })).toBe('2,5');
    expect(formatDerivedMetric(average, {})).toBe('—');
    expect(formatDerivedMetric({ ...average, format: 'DURATION_MS' }, { a: 3000, b: 2 })).toBe('1,5 s');
  });

  it('puts played games first by points and keeps the catalogue order for the rest', () => {
    const game = (id: string, gamesPlayed: number, points: number) => ({ id, stats: { gamesPlayed, points } });
    const sorted = sortProfileGames([game('a', 0, 0), game('b', 2, 10), game('c', 0, 0), game('d', 1, 30)]);
    expect(sorted.map((g) => g.id)).toEqual(['d', 'b', 'a', 'c']);
  });
});
