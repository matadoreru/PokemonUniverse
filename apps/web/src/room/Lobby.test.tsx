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
    { id: 'pokedex-distance', name: 'Pokédex Distance', icon: '🎯', description: 'Elige el número más cercano.', minPlayers: 2, profileStats: { metrics: [] } },
    { id: 'shiny-vote', name: 'Shiny Quiz', icon: '✨', description: 'Encuentra el shiny verdadero.', minPlayers: 1, profileStats: { metrics: [] } },
  ],
  selectedGameId: 'pokedex-distance', selectedGameConfig: { generations: [1], roundSeconds: 20 },
  sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null,
  gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, serverNow: 1_000,
};

const noOp = async () => undefined;

describe('lobby information hierarchy', () => {
  it('orders game selection, configuration, players and start while keeping the catalog searchable', () => {
    const markup = renderToStaticMarkup(<Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onSelectGame={noOp} onConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    />);

    const selection = markup.indexOf('Elige un minijuego');
    const configuration = markup.indexOf('Ajustes de Pokédex Distance');
    const players = markup.indexOf('>Jugadores<');
    const start = markup.indexOf('Iniciar partida');
    expect(selection).toBeGreaterThan(-1);
    expect(configuration).toBeGreaterThan(selection);
    expect(players).toBeGreaterThan(configuration);
    expect(start).toBeGreaterThan(players);
    expect(markup).toContain('placeholder="Buscar entre 2 juegos"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
