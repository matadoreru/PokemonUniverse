import { describe, expect, it } from 'vitest';
import { learnsetLastWarningText } from './learnset-texts';

describe('learnsetLastWarningText', () => {
  it('tells the only missing player the real seconds left', () => {
    expect(learnsetLastWarningText(true, false, 10)).toBe('¡Último aviso! Solo faltas tú: 10 segundos.');
    expect(learnsetLastWarningText(true, false, 4)).toBe('¡Último aviso! Solo faltas tú: 4 segundos.');
  });

  it('tells everyone else the real seconds left', () => {
    expect(learnsetLastWarningText(true, true, 10)).toBe('Último aviso: la ronda se cierra en 10 segundos.');
    expect(learnsetLastWarningText(true, true, 3)).toBe('Último aviso: la ronda se cierra en 3 segundos.');
  });

  it('uses the singular for one second', () => {
    expect(learnsetLastWarningText(true, false, 1)).toBe('¡Último aviso! Solo faltas tú: 1 segundo.');
    expect(learnsetLastWarningText(true, true, 1)).toBe('Último aviso: la ronda se cierra en 1 segundo.');
  });

  it('falls back to neutral wording when no seconds are left to count', () => {
    expect(learnsetLastWarningText(true, false, 0)).toBe('¡Último aviso! Se acaba pronto.');
    expect(learnsetLastWarningText(true, true, Number.NaN)).toBe('¡Último aviso! Se acaba pronto.');
  });

  it('shows nothing without a last warning', () => {
    expect(learnsetLastWarningText(false, false, 10)).toBeNull();
    expect(learnsetLastWarningText(false, true, 10)).toBeNull();
  });
});
