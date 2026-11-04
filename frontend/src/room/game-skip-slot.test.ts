import { describe, expect, it } from 'vitest';
import { skipRowInLayout } from './game-skip-slot';

const skip = { gameInstanceId: 'g1', votes: 0, requiredVotes: 2, currentUserVoted: false, canVote: true } as never;
const base = { phase: 'ROUND_ACTIVE', gameIntro: null, gameSkipState: skip, selectedGameId: 'zoomed-pokemon', game: { gameId: 'zoomed-pokemon' } } as never;

describe('skipRowInLayout', () => {
  it('pone la fila encima de los juegos sin rediseñar', () => {
    expect(skipRowInLayout(base)).toBe(true);
  });
  it('sin votación no hay fila', () => {
    expect(skipRowInLayout({ ...(base as object), gameSkipState: null } as never)).toBe(false);
  });
  it('en la intro va dentro de su pantalla', () => {
    expect(skipRowInLayout({ ...(base as object), phase: 'GAME_STARTING', gameIntro: { gameInstanceId: 'g1' } } as never)).toBe(false);
  });
  it('Shiny Quiz también la lleva dentro salvo en los resultados', () => {
    const shiny = { ...(base as object), selectedGameId: 'shiny-vote', game: { gameId: 'shiny-vote' } };
    expect(skipRowInLayout(shiny as never)).toBe(false);
    expect(skipRowInLayout({ ...shiny, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...shiny, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Type Duel la lleva dentro de su pantalla salvo en los resultados', () => {
    const duel = { ...(base as object), selectedGameId: 'type-duel', game: { gameId: 'type-duel' } };
    expect(skipRowInLayout(duel as never)).toBe(false);
    expect(skipRowInLayout({ ...duel, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...duel, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Learnset Guess la lleva dentro de su pantalla salvo en los resultados', () => {
    const learnset = { ...(base as object), selectedGameId: 'learnset-guess', game: { gameId: 'learnset-guess' } };
    expect(skipRowInLayout(learnset as never)).toBe(false);
    expect(skipRowInLayout({ ...learnset, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...learnset, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokédex Distance la lleva dentro de su pantalla salvo en los resultados', () => {
    const distance = { ...(base as object), selectedGameId: 'pokedex-distance', game: { gameId: 'pokedex-distance' } };
    expect(skipRowInLayout(distance as never)).toBe(false);
    expect(skipRowInLayout({ ...distance, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...distance, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
});
