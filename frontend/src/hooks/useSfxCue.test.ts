import { describe, expect, it } from 'vitest';
import { gameStartCue, gameWinCue, resolveCue, roomRevealKey, shouldCue } from './useSfxCue';

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
  it('el game.win de la sala solo en el reto diario y al ganador local de sus resultados', () => {
    const results = (winnerId: string | null, standings: { playerId: string; won?: boolean }[] = []) => ({ winnerId, standings });
    const room = (gameId: string, r: unknown, phase = 'GAME_RESULTS', daily: unknown = { date: '2026-11-11' }) => ({ phase, gamesPlayed: 3, daily, game: { gameId, results: r } });
    expect(gameWinCue(room('type-duel', results('p1')), 'p1')).toBe('type-duel:3');
    expect(gameWinCue(room('type-duel', results('p2')), 'p1')).toBeNull();
    // Empate o equipo: sin winnerId pero con su fila ganadora.
    expect(gameWinCue(room('pokemon-impostor', results(null, [{ playerId: 'p1', won: true }, { playerId: 'p2', won: false }])), 'p1')).toBe('pokemon-impostor:3');
    expect(gameWinCue(room('pokemon-impostor', results(null, [{ playerId: 'p1', won: false }])), 'p1')).toBeNull();
    // Sin ganador expuesto, fuera de los resultados o sin jugador: silencio.
    expect(gameWinCue(room('type-duel', null), 'p1')).toBeNull();
    expect(gameWinCue(room('type-duel', results('p1'), 'ROUND_RESULTS'), 'p1')).toBeNull();
    expect(gameWinCue(room('type-duel', results('p1')), null)).toBeNull();
    expect(gameWinCue(null, 'p1')).toBeNull();
    // Fuera del reto lo da `ResultsShell`: la sala no lo duplica.
    expect(gameWinCue(room('type-duel', results('p1'), 'GAME_RESULTS', null), 'p1')).toBeNull();
  });

  it('game.start: una clave por partida en juego y ninguna fuera de ella', () => {
    const base = { gamesPlayed: 1, selectedGameId: 'shiny-vote', game: { gameId: 'shiny-vote' }, gameSkipState: { gameInstanceId: 'a' } };
    expect(gameStartCue({ ...base, phase: 'ROUND_ACTIVE' })).toBe('a');
    expect(gameStartCue({ ...base, phase: 'ROUND_RESULTS' })).toBe('a');
    // Saltar la partida y empezar otra cambia la clave (vuelve a sonar).
    expect(gameStartCue({ ...base, phase: 'ROUND_ACTIVE', gameSkipState: { gameInstanceId: 'b' } })).toBe('b');
    expect(gameStartCue({ ...base, phase: 'ROUND_ACTIVE', gameSkipState: null })).toBe('shiny-vote:1');
    for (const phase of ['LOBBY', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'NEXT_GAME_VOTE_RESULTS', 'SESSION_RESULTS'] as const) {
      expect(gameStartCue({ ...base, phase })).toBeNull();
    }
    expect(gameStartCue(null)).toBeNull();
  });
});
