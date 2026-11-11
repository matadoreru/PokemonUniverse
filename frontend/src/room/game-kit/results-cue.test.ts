import { describe, expect, it } from 'vitest';
import { resultsCelebration, resultsCue } from './ResultsShell';

describe('resultsCue', () => {
  it('podio de la sesión: win al campeón, podium al resto, nunca ambos', () => {
    expect(resultsCue({ podium: true, won: true })).toBe('game.win');
    expect(resultsCue({ podium: true, won: false })).toBe('game.podium');
  });
  it('resultados de partida: solo win al ganador', () => {
    expect(resultsCue({ podium: false, won: true })).toBe('game.win');
    expect(resultsCue({ podium: false, won: false })).toBeNull();
  });
});

describe('resultsCelebration', () => {
  const standings = [
    { id: 'a', position: 1, points: 9 },
    { id: 'b', position: 2, points: 5 },
    { id: 'c', position: 3, points: 0 },
    { id: 'd', position: 4, points: 0 },
  ];
  it('gana quien el juego dice con `won`, también sin clasificación', () => {
    expect(resultsCelebration({ won: true })).toBe('win');
    expect(resultsCelebration({ won: true, standings, selfId: 'd' })).toBe('win');
  });
  it('el podio sale de la clasificación: 2.º y 3.º, y con `winnersNeedPoints` solo con puntos', () => {
    expect(resultsCelebration({ won: false, standings, selfId: 'b' })).toBe('podium');
    expect(resultsCelebration({ won: false, standings, selfId: 'c' })).toBe('podium');
    expect(resultsCelebration({ won: false, standings, selfId: 'c', winnersNeedPoints: true })).toBeNull();
    expect(resultsCelebration({ won: false, standings, selfId: 'd' })).toBeNull();
    // 1.º sin `won` (p. ej. un empate a cero): ni victoria ni podio.
    expect(resultsCelebration({ won: false, standings, selfId: 'a' })).toBeNull();
    expect(resultsCelebration({ won: false, standings })).toBeNull();
    expect(resultsCelebration({ won: false, podium: true })).toBe('podium');
  });
  it('las partidas cooperativas no celebran', () => {
    expect(resultsCelebration({ won: true, noWinner: true })).toBeNull();
    expect(resultsCelebration({ won: false, standings, selfId: 'b', noWinner: true })).toBeNull();
  });
});
