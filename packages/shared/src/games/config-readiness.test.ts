import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playerCountReadinessReason, validateGameConfigReadiness, type GameConfigReadinessContext } from './config-readiness.js';

/**
 * Java rechaza empezar y la web avisa en la sala, cada uno con su regla. `web-contracts/readiness-cases.json` lo graba
 * `GameConfigReadinessTest` (aquí solo se lee): juego, config, contexto y el mensaje de Java o `null`.
 */
const cases = JSON.parse(readFileSync(new URL('../../../../backend/src/test/resources/web-contracts/readiness-cases.json', import.meta.url), 'utf8')) as {
  gameId: string; config: unknown; context: Required<GameConfigReadinessContext>; message: string | null;
}[];

describe('readiness-cases.json de Java', () => {
  it('trae casos que pasan y que no pasan de cada juego con regla', () => {
    const ruled = ['pokeddle-race', 'pokemon-bingo', 'pokemon-impostor', 'one-of-us-is-fake', 'secret-ranking', 'most-likely-to', 'would-you-rather'];
    for (const gameId of ruled) {
      const outcomes = cases.filter((entry) => entry.gameId === gameId).map(({ message }) => message === null);
      expect(new Set(outcomes), gameId).toEqual(new Set([true, false]));
    }
  });

  it.each(cases.map((entry, index) => [index, entry.gameId, entry] as const))('caso %i (%s)', (_index, gameId, { config, context, message }) => {
    expect(validateGameConfigReadiness(gameId, config, context)).toBe(message);
  });
});

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
