import { defaultPokedexEntryGuessConfig, type PokedexEntryGuessPlayerState, type PokedexEntryGuessPublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokedexEntryGuessConfigPanel } from '../games/pokedex-entry-guess/ConfigPanel';
import { PokedexEntryGuessGame } from './PokedexEntryGuessGame';
import { PokedexEntryGuessResults } from './PokedexEntryGuessResults';

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): PokedexEntryGuessPublicState {
  const solve = { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, points: 4, attempts: 1 };
  const reveal = { pokemon: { name: 'Absol', sprite: '/absol.png', generation: 3 }, entry: { text: 'Se dice que Absol aparece para advertir de catástrofes.', generation: 3, versionLabel: 'Pokémon Esmeralda' }, solves: { p1: solve }, attemptCounts: { p1: 1, p2: 1 } };
  return { gameId: 'pokedex-entry-guess', phase, roundNumber: 1, totalRounds: 10, referenceGeneration: 5, entryText: phase === 'ROUND_ACTIVE' ? 'Se dice que ??? aparece para advertir de catástrofes.' : null, hints: [], attempts: [{ playerId: 'p2', guessedPokemon: { id: 'umbreon', name: 'Umbreon', sprite: '/umbreon.png' }, attemptedAt: 1_500 }], solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }], scores: { p1: 4, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 26_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 30_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal, results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 4, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 4 } }, { playerId: 'p2', position: 2, points: 0, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } }] } : null };
}

function room(game: PokedexEntryGuessPublicState, player: PokedexEntryGuessPlayerState, spectator = false): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'pokedex-entry-guess', selectedGameConfig: { ...defaultPokedexEntryGuessConfig, generations: [1, 2, 3, 4, 5] }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, ready: false, sessionPoints: 4 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
  ] };
}

describe('Pokédex Entry Guess client', () => {
  it('makes the sanitized Spanish entry prominent and shows only public incorrect attempts', () => {
    const game = publicGame(); game.solvedPlayers = []; const view = room(game, { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null });
    const markup = renderToStaticMarkup(createElement(PokedexEntryGuessGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('aria-labelledby="pokedex-entry-heading"'); expect(markup).toContain('Descripción oficial en español'); expect(markup).toContain('??? aparece'); expect(markup).toContain('Buscar respuesta para la ronda 1'); expect(markup).toContain('Umbreon'); expect(markup).not.toContain('Absol');
  });

  it('locks a solved player and displays solve order without revealing the answer', () => {
    const markup = renderToStaticMarkup(createElement(PokedexEntryGuessGame, { room: room(publicGame(), { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 4, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('¡Has acertado!'); expect(markup).toContain('1.º en encontrarlo'); expect(markup).not.toContain('Buscar respuesta para la ronda'); expect(markup).not.toContain('Absol');
  });

  it('reveals Pokémon, complete entry source, order, points and time only after closure', () => {
    const game = publicGame('ROUND_RESULTS'); const markup = renderToStaticMarkup(createElement(PokedexEntryGuessGame, { room: room(game, { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 4, attemptCount: 1, lastAttempt: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('¡Era Absol!'); expect(markup).toContain('Pokémon Esmeralda'); expect(markup).toContain('Se dice que Absol'); expect(markup).toContain('+4'); expect(markup).toContain('1.0s');
  });

  it('supports spectators, accessible configuration and the session continuation action', () => {
    const spectator = renderToStaticMarkup(createElement(PokedexEntryGuessGame, { room: room(publicGame(), { canGuess: false, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }, true), selfId: 'p1', onAction: async () => undefined }));
    expect(spectator).toContain('Estás observando'); expect(spectator).not.toContain('Buscar respuesta para la ronda');
    const config = renderToStaticMarkup(createElement(PokedexEntryGuessConfigPanel, { config: defaultPokedexEntryGuessConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Generación de referencia'); expect(config).toContain('primera posterior disponible'); expect(config).not.toContain('Nunca una futura'); expect(config).toContain('25s'); expect(config).toContain('Pistas adicionales');
    const results = renderToStaticMarkup(createElement(PokedexEntryGuessResults, { room: room(publicGame('GAME_RESULTS'), { canGuess: false, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(results).toContain('Continuar sesión'); expect(results).toContain('primeras posiciones'); expect(results).toContain('Avatar de Eru');
  });
});
