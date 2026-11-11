import { describe, expect, it } from 'vitest';
import { joinNames, plural, roundsLabel, secondsLabel } from './format';

describe('format', () => {
  it('plural: singular solo con 1', () => {
    expect(plural(1, 'acierto', 'aciertos')).toBe('1 acierto');
    expect(plural(0, 'acierto', 'aciertos')).toBe('0 aciertos');
    expect(plural(3, 'vez el primero', 'veces el primero')).toBe('3 veces el primero');
  });
  it('segundos y rondas', () => {
    expect(secondsLabel(1)).toBe('1 segundo');
    expect(secondsLabel(30)).toBe('30 segundos');
    expect(roundsLabel(1)).toBe('1 ronda');
    expect(roundsLabel(5)).toBe('5 rondas');
  });
  it('joinNames: «y» antes del último y comas entre los demás', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Eru'])).toBe('Ana y Eru');
    expect(joinNames(['Ana', 'Eru', 'Leo'])).toBe('Ana, Eru y Leo');
  });
});
