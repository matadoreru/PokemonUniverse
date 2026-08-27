import type { RoomView } from '@pokemon-universe/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Lobby } from './Lobby';

const room: RoomView = {
  code: 'ABC234', phase: 'LOBBY', hostId: 'host', maxPlayers: 8,
  members: [
    { id: 'host', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 },
    { id: 'guest', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: true, sessionPoints: 0 },
  ],
  availableGames: [
    { id: 'pokedex-distance', name: 'Pokédex Distance', icon: '🎯', description: 'Elige el número más cercano.', recommended: true, minPlayers: 2, profileStats: { metrics: [] } },
    { id: 'shiny-vote', name: 'Shiny Quiz', icon: '✨', description: 'Encuentra el shiny verdadero.', experimental: true, minPlayers: 1, profileStats: { metrics: [] } },
  ],
  selectedGameId: 'pokedex-distance', selectedGameConfig: { generations: [1], roundSeconds: 20 },
  sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null,
  gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, serverNow: 1_000,
};

const noOp = async () => undefined;

describe('lobby information hierarchy', () => {
  it('keeps game descriptions visible and separates the lobby into accessible tabs', () => {
    const markup = renderToStaticMarkup(<Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onSelectGame={noOp} onConfig={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    />);

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Minijuegos');
    expect(markup).toContain('Configuración');
    expect(markup).toContain('Modo y sesión');
    expect(markup).toContain('Elige el número más cercano.');
    expect(markup).toContain('Encuentra el shiny verdadero.');
    expect(markup).toContain('Experimental');
    expect(markup).toContain('>TOP<');
    expect(markup).toContain('placeholder="Buscar entre 2 juegos"');
    expect(markup).toContain('Hablando es mejor');
    expect(markup).toContain('Discord, Zoom');
    expect(markup).toContain('>Jugadores<');
    expect(markup).toContain('Iniciar partida');
  });
});
