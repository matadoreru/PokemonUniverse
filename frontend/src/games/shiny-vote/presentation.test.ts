import { describe, expect, it } from 'vitest';
import { shinyRecords } from './presentation';

describe('shinyRecords', () => {
  it('da el mejor valor de cada récord y junta los empates', () => {
    const records = shinyRecords([
      { name: 'Eru', stats: { votes: 4, correctVotes: 3, accuracy: 75 } },
      { name: 'Ana', stats: { votes: 3, correctVotes: 3, accuracy: 100 } },
      { name: 'Leo', stats: { votes: 4, correctVotes: 1, accuracy: 25 } },
    ]);
    expect(records.correct).toEqual({ value: 3, names: ['Eru', 'Ana'] });
    expect(records.accuracy).toEqual({ value: 100, names: ['Ana'] });
  });

  it('sin aciertos no hay récord (ni con estadísticas ausentes)', () => {
    expect(shinyRecords([{ name: 'Eru', stats: { votes: 2, correctVotes: 0, accuracy: 0 } }, { name: 'Ana', stats: {} }])).toEqual({ correct: null, accuracy: null });
    expect(shinyRecords([])).toEqual({ correct: null, accuracy: null });
  });
});
