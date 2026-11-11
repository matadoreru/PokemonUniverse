import { describe, expect, it } from 'vitest';
import { sharesPosition } from './results-ties';

describe('sharesPosition', () => {
  it('marks shared positions as a tie (in game, only with points)', () => {
    const ranking = [{ id: 'a', position: 1 }, { id: 'b', position: 1 }, { id: 'c', position: 3 }];
    const points = (id: string) => (id === 'c' ? 0 : 2);
    expect(sharesPosition(ranking, 'a', points, true)).toBe(true);
    expect(sharesPosition(ranking, 'c', points, true)).toBe(false);
    expect(sharesPosition([{ id: 'x', position: 1 }, { id: 'y', position: 1 }], 'x', () => 0, true)).toBe(false);
    expect(sharesPosition([{ id: 'x', position: 1 }, { id: 'y', position: 1 }], 'x', () => 0)).toBe(true);
  });
});
