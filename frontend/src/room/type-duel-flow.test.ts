import { describe, expect, it } from 'vitest';
import { typeDuelIsLastResult, typeDuelPhaseCue, typeDuelWillRetry } from './type-duel-flow';

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

describe('typeDuelPhaseCue', () => {
  it('suena a revelación (no a error) cuando la combinación existe', () => {
    expect(typeDuelPhaseCue({ phase: 'TYPE_REVEAL', roundNumber: 2, invalidCombinations: 0 })).toEqual({ cue: 'reveal', key: 'reveal:2:0' });
  });
  it('reserva el choque para la combinación imposible, con clave por reintento', () => {
    expect(typeDuelPhaseCue({ phase: 'INVALID_COMBINATION', roundNumber: 2, invalidCombinations: 1 })).toEqual({ cue: 'clang', key: 'invalid:2:1' });
    expect(typeDuelPhaseCue({ phase: 'TYPE_REVEAL', roundNumber: 2, invalidCombinations: 1 })?.key).not.toBe('reveal:2:0');
  });
  it('no suena en el resto de fases', () => {
    for (const phase of ['SELECTING_TYPES', 'POKEMON_SEARCH', 'ROUND_RESULTS']) expect(typeDuelPhaseCue({ phase, roundNumber: 1, invalidCombinations: 0 })).toBeNull();
  });
});
