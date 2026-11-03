import { describe, expect, it } from 'vitest';
import { typeDuelIsLastResult, typeDuelWillRetry } from './type-duel-flow';

describe('typeDuelWillRetry', () => {
  it('retries while there are impossible tries left and the cap is not reached', () => {
    expect(typeDuelWillRetry({ invalidCombinations: 1, finalSelectionCycle: false })).toBe(true);
    expect(typeDuelWillRetry({ invalidCombinations: 2, finalSelectionCycle: false })).toBe(true);
  });
  it('does not retry on the third impossible combination', () => {
    expect(typeDuelWillRetry({ invalidCombinations: 3, finalSelectionCycle: false })).toBe(false);
  });
  it('does not retry on the final selection cycle', () => {
    expect(typeDuelWillRetry({ invalidCombinations: 1, finalSelectionCycle: true })).toBe(false);
  });
});

describe('typeDuelIsLastResult', () => {
  it('is the last result when every duel is completed', () => {
    expect(typeDuelIsLastResult({ completedRounds: 3, totalRounds: 3, finalSelectionCycle: false })).toBe(true);
  });
  it('is the last result when the selection cap is reached', () => {
    expect(typeDuelIsLastResult({ completedRounds: 2, totalRounds: 3, finalSelectionCycle: true })).toBe(true);
  });
  it('is not the last result otherwise', () => {
    expect(typeDuelIsLastResult({ completedRounds: 1, totalRounds: 3, finalSelectionCycle: false })).toBe(false);
  });
});
