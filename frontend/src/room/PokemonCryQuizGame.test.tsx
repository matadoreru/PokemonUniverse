import type { PokemonCryQuizPlayerState, PokemonCryQuizPublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonCryQuizGame } from './PokemonCryQuizGame';
import { PokemonCryQuizResults } from './PokemonCryQuizResults';

const members: RoomView['members'] = [{ id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 }];
const player: PokemonCryQuizPlayerState = { role: 'PLAYER', canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
function game(phase: PokemonCryQuizPublicState['phase'] = 'ROUND_ACTIVE'): PokemonCryQuizPublicState {
  return { gameId: 'pokemon-cry-quiz', phase, roundNumber: 1, totalRounds: 1, cryUrl: phase === 'ROUND_ACTIVE' ? '/api/rooms/ABC/games/opaque/rounds/1/options/cry/audio' : null, attempts: [], solvedPlayers: [], scores: { p1: 0 }, roundStartedAt: 1_000, roundEndsAt: 21_000, nextTransitionAt: null, lastRound: null, results: null };
}
function room(publicGame: PokemonCryQuizPublicState, privateState: PokemonCryQuizPlayerState = player): RoomView {
  return { code: 'ABC234', phase: publicGame.phase, hostId: 'p1', maxPlayers: 8, members, availableGames: [], selectedGameId: 'pokemon-cry-quiz', selectedGameConfig: { generations: [1], roundSeconds: 20, rounds: 1, cryVersion: 'LATEST', includeRegionalForms: false }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: publicGame, gamePlayerState: privateState, serverNow: 2_000 };
}

describe('Adivina el Grito presentation', () => {
  it('renders an opaque playable audio source and the existing Pokémon search flow', () => {
    const html = renderToStaticMarkup(createElement(PokemonCryQuizGame, { room: room(game()), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('Adivina el Grito'); expect(html).toContain('/options/cry/audio'); expect(html).toContain('Pulsa para escuchar'); expect(html).toContain('Buscar Pokémon');
    expect(html).not.toContain('Pikachu'); expect(html).not.toContain('raw.githubusercontent.com');
  });

  it('reveals the Pokémon and final ranking only in their corresponding phases', () => {
    const reveal = game('ROUND_RESULTS'); reveal.nextTransitionAt = 5_000; reveal.lastRound = { pokemon: { name: 'Pikachu', sprite: '/pikachu.png', generation: 1 }, cryVersion: 'LATEST', cryUrl: '/api/rooms/ABC/games/opaque/rounds/1/options/cry/audio', solves: { p1: { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, speedPoints: 10, placementBonus: 3, points: 13, attempts: 1 } }, attemptCounts: { p1: 1 } };
    const revealHtml = renderToStaticMarkup(createElement(PokemonCryQuizGame, { room: room(reveal, { ...player, canGuess: false, solved: true, solveOrder: 1, roundPoints: 13 }), selfId: 'p1', onAction: async () => undefined }));
    expect(revealHtml).toContain('¡Era Pikachu!'); expect(revealHtml).toContain('Volver a escuchar');
    const finished = { ...reveal, phase: 'GAME_RESULTS' as const, results: { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 13, won: true, stats: { correct: 1, totalAttempts: 1, firstTry: 1 } }] } };
    const resultsHtml = renderToStaticMarkup(createElement(PokemonCryQuizResults, { room: room(finished), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(resultsHtml).toContain('Resultados · Adivina el Grito'); expect(resultsHtml).toContain('13 pts');
  });
});
