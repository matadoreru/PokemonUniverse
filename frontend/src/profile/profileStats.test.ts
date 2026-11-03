import { describe, expect, it } from 'vitest';
import { formatDerivedMetric, formatStoredMetric, sortProfileGames, winRate } from './profileStats';

describe('profile stats', () => {
  it('rounds the win rate and shows 0 % with no games', () => {
    expect(winRate(2, 3)).toBe('67 %');
    expect(winRate(0, 0)).toBe('0 %');
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
