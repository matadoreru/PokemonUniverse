import type { RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerList } from './PlayerList';
import { SessionResults } from './SessionResults';
import { member, roomView } from './test-support/room-view';

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

    expect(markup).not.toContain('Controla el inicio');
    expect(markup).toContain('Listo');
    expect(markup).toContain('Reconectando…');
  });

  it('renders tied champions and point history for a player who already left', () => {
    const room: RoomView = roomView({
      phase: 'SESSION_RESULTS', hostId: 'host',
      members: [member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true, sessionPoints: 8 })],
      availableGames: [
        { id: 'one', name: 'Juego uno', icon: '①', description: 'Uno', howTo: [], minPlayers: 1, profileStats: { metrics: [] } },
        { id: 'two', name: 'Juego dos', icon: '②', description: 'Dos', howTo: [], minPlayers: 1, profileStats: { metrics: [] } },
      ],
      selectedGameId: 'two', selectedGameConfig: {}, sessionMode: { type: 'GAME_COUNT', target: 2 }, gamesPlayed: 2,
      sessionStandings: [
        { id: 'host', displayName: 'Eru', avatar: { type: 'DEFAULT' }, sessionPoints: 8 },
        { id: 'departed', displayName: 'Ana', avatar: { type: 'DEFAULT' }, sessionPoints: 8 },
      ],
      sessionHistory: [
        { gameNumber: 1, gameId: 'one', winnerIds: ['host'], points: { host: 5, departed: 3 } },
        { gameNumber: 2, gameId: 'two', winnerIds: ['departed'], points: { host: 3, departed: 5 } },
      ],
    });

    const markup = renderToStaticMarkup(createElement(SessionResults, { room, selfId: 'host', onLobby: () => undefined }));
    expect(markup).toContain('Campeones de la sesión');
    expect(markup).toContain('Ana y Eru');
    expect(markup).toContain('Evolución de puntos');
    expect(markup).toContain('Volver al lobby');
    expect(markup).not.toContain('Terminar');
    // Empate: los dos comparten el primer puesto y la insignia de ganador.
    expect(markup.match(/Ganador/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Clasificación"');
    expect(markup).not.toMatch(/btn-|text-xs/);

    const guest = renderToStaticMarkup(createElement(SessionResults, { room: { ...room, hostId: 'departed' }, selfId: 'host', onLobby: () => undefined, onLeave: () => undefined }));
    expect(guest).not.toContain('Volver al lobby');
    expect(guest).toContain('Terminar');
  });

  it('shows an empty standings state when the session ends before any game', () => {
    const room: RoomView = roomView({
      phase: 'SESSION_RESULTS', hostId: 'host', members: [member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true })],
      selectedGameId: 'one', selectedGameConfig: {}, sessionStandings: [{ id: 'host', displayName: 'Eru', avatar: { type: 'DEFAULT' }, sessionPoints: 0 }],
    });
    const markup = renderToStaticMarkup(createElement(SessionResults, { room, selfId: 'host', onLobby: () => undefined }));
    expect(markup).toContain('Sesión terminada');
    expect(markup).toContain('Aún no se ha jugado ninguna partida');
    expect(markup).not.toContain('Ganador');
    expect(markup).not.toContain('Evolución de puntos');
  });
});
