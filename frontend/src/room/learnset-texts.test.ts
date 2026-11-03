import { describe, expect, it } from 'vitest';
import { learnsetLastWarningText } from './learnset-texts';

describe('learnsetLastWarningText', () => {
  it('tells the only missing player that the round is about to close', () => {
    expect(learnsetLastWarningText(true, false)).toBe('¡Último aviso! Solo faltas tú: 10 segundos.');
  });

  it('tells everyone else that the round closes in ten seconds', () => {
    expect(learnsetLastWarningText(true, true)).toBe('Último aviso: la ronda se cierra en 10 segundos.');
  });

  it('shows nothing without a last warning', () => {
    expect(learnsetLastWarningText(false, false)).toBeNull();
    expect(learnsetLastWarningText(false, true)).toBeNull();
  });
});
