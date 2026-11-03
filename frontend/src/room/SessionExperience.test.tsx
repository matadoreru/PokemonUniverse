import type { RoomMemberView, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerList } from './PlayerList';
import { SessionResults } from './SessionResults';

function member(overrides: Partial<RoomMemberView> & Pick<RoomMemberView, 'id' | 'displayName'>): RoomMemberView {
  return {
    avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false,
    ready: false, sessionPoints: 0, ...overrides,
  };
}

describe('priority session experience', () => {
  it('shows readiness and reconnecting states as visible text', () => {
    const markup = renderToStaticMarkup(createElement(PlayerList, {
      members: [
        member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true }),
        member({ id: 'ready', displayName: 'Ana', ready: true }),
        member({ id: 'away', displayName: 'Leo', connected: false, presence: 'TEMPORARILY_DISCONNECTED' }),
      ],
      selfId: 'host',
    }));

    expect(markup).toContain('Controla el inicio');
    expect(markup).toContain('Listo');
    expect(markup).toContain('Reconectando…');
  });

  it('renders tied champions and point history for a player who already left', () => {
    const room: RoomView = {
      code: 'ABC234', phase: 'SESSION_RESULTS', hostId: 'host', maxPlayers: 8,
      members: [member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true, sessionPoints: 8 })],
      availableGames: [
        { id: 'one', name: 'Juego uno', icon: '①', description: 'Uno', minPlayers: 1, profileStats: { metrics: [] } },
        { id: 'two', name: 'Juego dos', icon: '②', description: 'Dos', minPlayers: 1, profileStats: { metrics: [] } },
      ],
      selectedGameId: 'two', selectedGameConfig: {}, sessionMode: { type: 'GAME_COUNT', target: 2 }, gameSelectionMode: { type: 'FIXED' },
      nextGameVote: null, gamesPlayed: 2,
      sessionStandings: [
        { id: 'host', displayName: 'Eru', avatar: { type: 'DEFAULT' }, sessionPoints: 8 },
        { id: 'departed', displayName: 'Ana', avatar: { type: 'DEFAULT' }, sessionPoints: 8 },
      ],
      sessionHistory: [
        { gameNumber: 1, gameId: 'one', winnerIds: ['host'], points: { host: 5, departed: 3 } },
        { gameNumber: 2, gameId: 'two', winnerIds: ['departed'], points: { host: 3, departed: 5 } },
      ],
      game: null, gamePlayerState: null, serverNow: 1_000,
    };

    const markup = renderToStaticMarkup(createElement(SessionResults, { room, selfId: 'host', onLobby: () => undefined }));
    expect(markup).toContain('Campeones de la sesión');
    expect(markup).toContain('Ana y Eru');
    expect(markup).toContain('Evolución de puntos');
    expect(markup).toContain('Nueva sesión');
  });
});
