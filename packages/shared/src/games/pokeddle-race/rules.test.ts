import { describe, expect, it } from 'vitest';
import { comparePokeddleEvolution } from './rules.js';

describe('Pokédle Race: comparación de la etapa evolutiva', () => {
  it('verde solo con la misma etapa y el mismo total; misma etapa y otro total es parcial', () => {
    expect(comparePokeddleEvolution({ stage: 1, stages: 1 }, { stage: 1, stages: 3 })).toBe('PARTIAL');
    expect(comparePokeddleEvolution({ stage: 2, stages: 3 }, { stage: 2, stages: 3 })).toBe('MATCH');
    expect(comparePokeddleEvolution({ stage: 1, stages: 2 }, { stage: 2, stages: 3 })).toBe('HIGHER');
    expect(comparePokeddleEvolution({ stage: 3, stages: 3 }, { stage: 2, stages: 3 })).toBe('LOWER');
  });
});
