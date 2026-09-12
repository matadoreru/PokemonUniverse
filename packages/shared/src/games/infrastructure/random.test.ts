import { describe, expect, it } from 'vitest';
import { contentDeck, shuffled } from './random.js';

describe('deterministic content selection', () => {
  it('preserves the input and visits each value once per shuffle', () => {
    const input = [1, 2, 3, 4];
    expect(shuffled(input, () => 0)).toEqual([2, 3, 4, 1]);
    expect(input).toEqual([1, 2, 3, 4]);
  });
  it('refills finite pools, handles a singleton and rejects an empty pool', () => {
    const deck = contentDeck(['a', 'b'], 9, () => 0, String);
    expect(deck).toHaveLength(9);
    expect(deck.every((item, index) => index === 0 || item !== deck[index - 1])).toBe(true);
    expect(contentDeck(['a'], 3, () => 0, String)).toEqual(['a', 'a', 'a']);
    expect(() => contentDeck([], 1, () => 0, String)).toThrow('Empty');
  });
});
