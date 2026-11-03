import { describe, expect, it } from 'vitest';
import { playerCountReadinessReason, validateGameConfigReadiness } from './config-readiness.js';

describe('validateGameConfigReadiness', () => {
  it('rejects impostor parity before start', () => {
    expect(validateGameConfigReadiness('pokemon-impostor', { impostorCount: 2 }, { playerCount: 4 }))
      .toBe('Demasiados impostores: con 4 jugadores el máximo es 1.');
  });

  it('accepts parity with more innocents', () => {
    expect(validateGameConfigReadiness('pokemon-impostor', { impostorCount: 2 }, { playerCount: 5 })).toBeNull();
  });

  it('computes the maximum with odd player counts', () => {
    expect(validateGameConfigReadiness('pokemon-impostor', { impostorCount: 3 }, { playerCount: 5 }))
      .toBe('Demasiados impostores: con 5 jugadores el máximo es 2.');
  });

  it('skips the parity check without a player count', () => {
    expect(validateGameConfigReadiness('pokemon-impostor', { impostorCount: 2 })).toBeNull();
    expect(validateGameConfigReadiness('pokemon-impostor', { impostorCount: 2 }, { playerCount: 0 })).toBeNull();
  });

  it('only applies the parity check to Pokémon Impostor', () => {
    expect(validateGameConfigReadiness('pokedex-distance', { impostorCount: 2 }, { playerCount: 4 })).toBeNull();
  });

  it('still requires at least one Pokeddle clue', () => {
    expect(validateGameConfigReadiness('pokeddle-race', { clues: {} })).toBe('Selecciona al menos una pista.');
  });
});

describe('playerCountReadinessReason', () => {
  it('reports only the player-count dependent reason', () => {
    expect(playerCountReadinessReason('pokemon-impostor', { impostorCount: 2 }, 4))
      .toBe('Demasiados impostores: con 4 jugadores el máximo es 1.');
    expect(playerCountReadinessReason('pokemon-impostor', { impostorCount: 2 }, 5)).toBeNull();
    expect(playerCountReadinessReason('pokeddle-race', { clues: {} }, 4)).toBeNull();
  });
});
