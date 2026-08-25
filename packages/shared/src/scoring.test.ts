import { describe, expect, it } from 'vitest';
import { buildRankedResults, rankCompetition } from './scoring.js';

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
