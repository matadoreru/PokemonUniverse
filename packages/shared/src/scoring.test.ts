import { describe, expect, it } from 'vitest';
import { sessionPointsForResults, buildRankedResults, rankCompetition } from './scoring.js';

describe('shared ranking infrastructure', () => {
  it('uses competition positions and a game-provided tie key', () => {
    const ranked = rankCompetition(
      [{ id: 'c', score: 5 }, { id: 'a', score: 10 }, { id: 'b', score: 5 }, { id: 'd', score: 1 }],
      (left, right) => right.score - left.score || left.id.localeCompare(right.id),
      (entry) => entry.score,
    );
    expect(ranked.map(({ entry, position }) => [entry.id, position])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
  });

  it('returns no unique winner when first place is tied', () => {
    const results = buildRankedResults([
      { playerId: 'a', points: 5, stats: { correct: 2 } },
      { playerId: 'b', points: 5, stats: { correct: 2 } },
    ], {
      compare: (left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId),
      tieKey: (entry) => entry.points,
    });
    expect(results.winnerId).toBeNull();
    expect(results.standings.every((standing) => standing.won)).toBe(true);
  });
});

it('normalizes session awards independently of each game score scale', () => {
  const results = (scale: number) => ({ winnerId: 'a', standings: [
    { stats: {}, playerId: 'a', position: 1, points: 10 * scale },
    { stats: {}, playerId: 'b', position: 2, points: 5 * scale },
    { stats: {}, playerId: 'c', position: 3, points: 0 },
  ] });
  expect(sessionPointsForResults(results(1))).toEqual({ a: 6, b: 3, c: 0 });
  expect(sessionPointsForResults(results(1_000))).toEqual(sessionPointsForResults(results(1)));
});

it('gives equal session awards to tied standings and none to a zero-score game', () => {
  expect(sessionPointsForResults({ winnerId: null, standings: [
    { stats: {}, playerId: 'a', position: 1, points: 5 }, { stats: {}, playerId: 'b', position: 1, points: 5 },
  ] })).toEqual({ a: 4, b: 4 });
  expect(sessionPointsForResults({ winnerId: null, standings: [
    { stats: {}, playerId: 'a', position: 1, points: 0 }, { stats: {}, playerId: 'b', position: 1, points: 0 },
  ] })).toEqual({ a: 0, b: 0 });
});
