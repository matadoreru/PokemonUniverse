import { describe, expect, it } from 'vitest';
import { outcomeCue } from './useOutcomeCue';

describe('outcomeCue', () => {
  it('acierto y fallo, con booleano o con nombre', () => {
    expect(outcomeCue(true)).toBe('game.hit');
    expect(outcomeCue('hit')).toBe('game.hit');
    expect(outcomeCue(false)).toBe('game.miss');
    expect(outcomeCue('miss')).toBe('game.miss');
  });

  it('sin resultado no suena', () => {
    expect(outcomeCue(null)).toBeNull();
    expect(outcomeCue(undefined)).toBeNull();
  });
});
