import { describe, expect, it } from 'vitest';
import { resolveCue, roomRevealKey, shouldCue } from './useSfxCue';

describe('useSfxCue', () => {
  it('traduce los nombres antiguos al catálogo', () => {
    expect(['tick', 'hit', 'miss', 'reveal', 'win', 'clang'].map((c) => resolveCue(c as never))).toEqual(['ui.tick', 'game.hit', 'game.miss', 'game.reveal', 'game.win', 'game.clang']);
    expect(resolveCue('game.bid')).toBe('game.bid');
  });
  it('no suena en el primer render ni con la misma clave', () => {
    expect(shouldCue(1, 1, 'hit')).toBe(false);
    expect(shouldCue(1, 2, 'hit')).toBe(true);
    expect(shouldCue(1, null, 'hit')).toBe(false);
    expect(shouldCue(null, 3, null)).toBe(false);
  });
  it('el reveal de la sala solo en resultados de ronda y sin duplicar a los juegos que lo piden', () => {
    expect(roomRevealKey({ gameId: 'type-duel', phase: 'ROUND_RESULTS', roundNumber: 2 })).toBe('type-duel:2');
    expect(roomRevealKey({ gameId: 'type-duel', phase: 'QUESTION', roundNumber: 2 })).toBeNull();
    expect(roomRevealKey({ gameId: 'pokedex-distance', phase: 'ROUND_RESULTS', roundNumber: 2 })).toBeNull();
    expect(roomRevealKey(null)).toBeNull();
  });
});
