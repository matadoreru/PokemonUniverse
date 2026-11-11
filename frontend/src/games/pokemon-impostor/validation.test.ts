import { describe, expect, it } from 'vitest';
import { validateImpostorClue } from './validation';

describe('validateImpostorClue', () => {
  it('en Una palabra rechaza una pista con espacios tras recortar', () => {
    expect(validateImpostorClue('dos palabras', 'ONE_WORD')).toBe('La pista debe ser una sola palabra.');
    expect(validateImpostorClue('uno\tdos', 'ONE_WORD')).toBe('La pista debe ser una sola palabra.');
  });

  it('en Una palabra acepta una palabra, también con espacios alrededor', () => {
    expect(validateImpostorClue('  Bola \u00a0', 'ONE_WORD')).toBeNull();
  });

  it('en Clásico no mira los espacios', () => {
    expect(validateImpostorClue('dos palabras', 'CLASSIC')).toBeNull();
    expect(validateImpostorClue('dos palabras', undefined)).toBeNull();
  });
});

describe('validateImpostorClue con el nombre del Pokémon', () => {
  const error = 'No puedes decir el nombre del Pokémon.';

  it.each(['CLASSIC', 'ONE_WORD'] as const)('en %s rechaza el nombre con mayúsculas, tildes, letras repetidas o guiones', (mode) => {
    for (const clue of ['Pikachu', 'pikachuuu', 'PIKACHÚ', 'pi-ka-chu']) {
      expect(validateImpostorClue(clue, mode, 'Pikachu')).toBe(error);
    }
  });

  it('acepta una pista sin el nombre', () => {
    expect(validateImpostorClue('ratón eléctrico', 'CLASSIC', 'Pikachu')).toBeNull();
  });

  it('en Una palabra, la regla de los espacios va antes', () => {
    expect(validateImpostorClue('pika chu', 'ONE_WORD', 'Pikachu')).toBe('La pista debe ser una sola palabra.');
  });

  it('sin el nombre (el impostor) no lo comprueba', () => {
    expect(validateImpostorClue('Pikachu', 'CLASSIC', null)).toBeNull();
    expect(validateImpostorClue('Pikachu', 'CLASSIC')).toBeNull();
  });

  it('un nombre vacío tras normalizar no bloquea nada', () => {
    expect(validateImpostorClue('cabra', 'CLASSIC', '♀ 2')).toBeNull();
  });
});
