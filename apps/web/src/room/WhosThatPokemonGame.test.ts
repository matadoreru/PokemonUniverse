import { defaultWhosThatPokemonConfig, type RoomView, type WhosThatPokemonPlayerState, type WhosThatPokemonPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WhosThatPokemonConfigPanel } from '../games/whos-that-pokemon/ConfigPanel';
import { WhosThatPokemonGame } from './WhosThatPokemonGame';
import { WhosThatPokemonResults } from './WhosThatPokemonResults';

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): WhosThatPokemonPublicState {
  const reveal = { pokemon: { name: 'Lucario', sprite: '/api/rooms/ABC234/games/token/rounds/1/options/reveal/sprite', generation: 4 }, solves: { p1: { solvedAt: 2_000, elapsedMs: 1_000, points: 5, attempts: 1 } }, attemptCounts: { p1: 1, p2: 1 } };
  return { gameId: 'whos-that-pokemon', phase, roundNumber: 1, totalRounds: 10, silhouetteSprite: phase === 'ROUND_ACTIVE' ? '/api/rooms/ABC234/games/token/rounds/1/options/shadow/sprite' : null, visibleHints: [], attempts: [{ playerId: 'p2', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }], solvedPlayerIds: phase === 'ROUND_ACTIVE' ? ['p1'] : ['p1'], scores: { p1: 5, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 21_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 25_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal, results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 5, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 5 } }, { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } }] } : null };
}

function room(game: WhosThatPokemonPublicState, player: WhosThatPokemonPlayerState, spectator = false): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'whos-that-pokemon', selectedGameConfig: defaultWhosThatPokemonConfig, sessionMode: { type: 'INFINITE' }, gamesPlayed: 0, serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, sessionPoints: 5 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, sessionPoints: 0 },
  ] };
}

describe('¿Quién es ese Pokémon? client', () => {
  it('renders a normalized opaque silhouette, shared search and public attempts without target metadata', () => {
    const game = publicGame(); game.solvedPlayerIds = []; const view = room(game, { canGuess: true, solved: false, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null });
    const markup = renderToStaticMarkup(createElement(WhosThatPokemonGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('aria-label="Silueta misteriosa normalizada"');
    expect(markup).toContain('/options/shadow/sprite');
    expect(markup).toContain('aria-label="Buscar respuesta para la ronda 1"');
    expect(markup).toContain('Ana'); expect(markup).toContain('Raichu');
    expect(markup).not.toMatch(/Lucario|448\.png|targetPokemon/);
  });

  it('hides the search after solving without revealing the answer', () => {
    const game = publicGame(); const view = room(game, { canGuess: false, solved: true, cooldownUntil: null, roundPoints: 5, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } });
    const markup = renderToStaticMarkup(createElement(WhosThatPokemonGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('¡Has acertado!'); expect(markup).toContain('Ha acertado');
    expect(markup).not.toContain('Buscar respuesta para la ronda'); expect(markup).not.toContain('Lucario');
  });

  it('shows the real Pokémon and per-player round summary only during reveal', () => {
    const game = publicGame('ROUND_RESULTS'); const view = room(game, { canGuess: false, solved: true, cooldownUntil: null, roundPoints: 5, attemptCount: 1, lastAttempt: null });
    const markup = renderToStaticMarkup(createElement(WhosThatPokemonGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('¡Era Lucario!'); expect(markup).toContain('/options/reveal/sprite'); expect(markup).toContain('+5'); expect(markup).toContain('1.0s');
  });

  it('keeps spectators read-only and exposes configuration and final lobby controls', () => {
    const active = publicGame(); active.solvedPlayerIds = [];
    const spectatorMarkup = renderToStaticMarkup(createElement(WhosThatPokemonGame, { room: room(active, { canGuess: false, solved: false, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }, true), selfId: 'p1', onAction: async () => undefined }));
    expect(spectatorMarkup).toContain('Estás observando'); expect(spectatorMarkup).not.toContain('Buscar respuesta para la ronda');
    const configMarkup = renderToStaticMarkup(createElement(WhosThatPokemonConfigPanel, { config: defaultWhosThatPokemonConfig, disabled: false, onChange: async () => undefined }));
    expect(configMarkup).toContain('Tiempo por ronda'); expect(configMarkup).toContain('Pistas adicionales'); expect(configMarkup).toContain('Formas regionales');
    const finished = publicGame('GAME_RESULTS'); const resultsMarkup = renderToStaticMarkup(createElement(WhosThatPokemonResults, { room: room(finished, { canGuess: false, solved: false, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(resultsMarkup).toContain('Volver al mismo lobby'); expect(resultsMarkup).toContain('Avatar de Eru');
  });
});
