import type { MiniGameManifest, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameSelectionConfig } from './GameSelectionConfig';
import { NextGameVote } from './NextGameVote';

const games: MiniGameManifest[] = [
  { id: 'one', name: 'Juego uno', icon: '①', description: 'Primera opción.', minPlayers: 1, profileStats: { metrics: [] } },
  { id: 'two', name: 'Juego dos', icon: '②', description: 'Segunda opción.', minPlayers: 2, maxPlayers: 8, profileStats: { metrics: [] } },
  { id: 'three', name: 'Juego tres', icon: '③', description: 'Tercera opción.', minPlayers: 3, profileStats: { metrics: [] } },
];

function room(phase: 'NEXT_GAME_VOTE' | 'NEXT_GAME_VOTE_RESULTS'): RoomView {
  const resolved = phase === 'NEXT_GAME_VOTE_RESULTS';
  return {
    code: 'ABC234', phase, hostId: 'p1', maxPlayers: 8, availableGames: games,
    selectedGameId: resolved ? 'two' : 'one', selectedGameConfig: {}, sessionMode: { type: 'GAME_COUNT', target: 5 },
    gameSelectionMode: { type: 'VOTE', gameIds: games.map((game) => game.id) }, gamesPlayed: 1,
    nextGameVote: {
      options: games, eligibleVoterIds: ['p1', 'p2'], votedPlayerIds: resolved ? ['p1', 'p2'] : [], ownVoteGameId: null,
      endsAt: resolved ? null : Date.now() + 15_000, resolvedGameId: resolved ? 'two' : null,
      tallies: resolved ? { one: 0, two: 2, three: 0 } : null, nextTransitionAt: resolved ? Date.now() + 3_000 : null,
    },
    game: { gameId: 'one', results: { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 5, stats: {} }, { playerId: 'p2', position: 2, points: 2, stats: {} }] } },
    gamePlayerState: null, serverNow: Date.now(), members: [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, sessionPoints: 5 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, sessionPoints: 2 },
    ],
  };
}

describe('game selection UI', () => {
  it('shows the three rotation methods and the selected voting pool', () => {
    const markup = renderToStaticMarkup(createElement(GameSelectionConfig, {
      availableGames: games, mode: { type: 'VOTE', gameIds: games.map((game) => game.id) }, disabled: false, onChange: () => undefined,
    }));
    expect(markup).toContain('Mismo minijuego');
    expect(markup).toContain('Aleatorio');
    expect(markup).toContain('Votación');
    expect(markup).toContain('3 seleccionados');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('renders a private active vote and the public winning reveal', () => {
    const active = renderToStaticMarkup(createElement(NextGameVote, { room: room('NEXT_GAME_VOTE'), selfId: 'p1', onVote: async () => undefined, onEnd: () => undefined }));
    expect(active).toContain('Elige el siguiente minijuego');
    expect(active).toContain('Confirmar voto');
    expect(active).toContain('0/2 votos');
    expect(active).not.toContain('Ganador');

    const result = renderToStaticMarkup(createElement(NextGameVote, { room: room('NEXT_GAME_VOTE_RESULTS'), selfId: 'p1', onVote: async () => undefined, onEnd: () => undefined }));
    expect(result).toContain('La sala ha elegido Juego dos');
    expect(result).toContain('Ganador');
    expect(result).toContain('2 votos');
  });
});
