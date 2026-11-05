import type { RoomView } from '@pokemon-universe/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
  it('shows game cards without descriptions and separates the lobby into accessible tabs', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onSelectGame={noOp} onConfig={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    /></MemoryRouter>);

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Minijuegos');
    expect(markup).toContain('Configuración');
    expect(markup).toContain('Modo y sesión');
    // Las cartas solo llevan nombre, jugadores e insignias (la descripción sigue en los ajustes del juego elegido).
    expect(markup).not.toContain('Encuentra el shiny verdadero.');
    expect(markup).toContain('Shiny Quiz');
    // Objetos de Pokémon (sprites de PokeAPI), no los emojis del registro.
    expect(markup).not.toContain('🎯');
    expect(markup).not.toContain('✨');
    expect(markup).toContain('items/poke-radar.png');
    expect(markup).toContain('items/shiny-charm.png');
    expect(markup).toContain('Experimental');
    expect(markup).toContain('>TOP<');
    expect(markup).toContain('placeholder="Buscar entre 2 juegos"');
    expect(markup).toContain('Hablando es mejor');
    expect(markup).toContain('Discord, Zoom');
    // El feedback con contexto sale de la píldora de la cabecera: sin tarjeta duplicada en el lobby.
    expect(markup).not.toContain('Tu opinión cuenta');
    expect(markup).not.toContain('/feedback');
    expect(markup).toContain('>Jugadores<');
    expect(markup).toContain('Iniciar partida');
    // Las tres pestañas quedan montadas (la activa visible): cambiar de pestaña no pierde el estado.
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(markup.match(/role="tabpanel"[^>]*hidden=""/g)).toHaveLength(2);
    expect(markup).toContain('Ajustes de Pokédex Distance');
  });

  it('gives the host the red start pill and game cards as toggle buttons, without the ready pill', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onSelectGame={noOp} onConfig={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    /></MemoryRouter>);
    expect(markup).toContain('¡Empezar partida!');
    expect(markup).toContain('id="start-help"');
    expect(markup).not.toContain('Marcarme listo');
    expect(markup).toContain('aria-label="Minijuegos"');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Pokédex Distance/);
    expect(markup).toMatch(/class="[^"]*tick[^"]*" aria-hidden="true"/);
    expect(markup).not.toContain('Solo lectura');
  });
});

describe('lobby how to play', () => {
  it('no game card offers «Cómo se juega» (the rules are in the game intro) and badges sit in the corner', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="guest" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onSelectGame={noOp} onConfig={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    /></MemoryRouter>);
    expect(markup).not.toContain('Cómo se juega');
    expect(markup).toMatch(/class="[^"]*corner[^"]*"><span[^>]*>TOP<\/span>/);
    expect(markup).toMatch(/class="[^"]*corner[^"]*"><span[^>]*><span aria-hidden="true">Exp<\/span><span class="sr-only">Experimental<\/span>/);
    // La elegida solo lleva el tick en su esquina: sin insignia «Seleccionado» que agrande la carta.
    expect(markup).not.toContain('Seleccionado');
    expect(markup).toMatch(/class="[^"]*tick[^"]*" aria-hidden="true"><svg/);
  });

  it('shows a guest read-only cards, their own ready pill and no start pill', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={{ ...room, members: room.members.map((member) => member.id === 'guest' ? { ...member, ready: false } : member) }} selfId="guest" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onSelectGame={noOp} onConfig={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    /></MemoryRouter>);
    expect(markup).not.toContain('Empezar partida');
    expect(markup).toContain('Marcarme listo');
    expect(markup).toContain('Márcate listo para que Eru pueda empezar.');
    expect(markup).toContain('Solo lectura');
    // Las cartas del invitado no son botones (no se atenúan): ningún conmutador de juego.
    expect(markup).not.toMatch(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>(?:(?!<\/button>).)*Pokédex Distance/);
    expect(markup).toMatch(/class="[^"]*tick[^"]*" aria-hidden="true"/);
  });
});

describe('lobby impostor parity', () => {
  const impostorManifest = { id: 'pokemon-impostor', name: 'Pokémon Impostor', icon: '🕵️', description: 'Encuentra al impostor.', minPlayers: 3, profileStats: { metrics: [] } };
  const members = ['host', 'p2', 'p3', 'p4'].map((id) => ({
    id, displayName: id, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const,
    roomRole: id === 'host' ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: id === 'host', ready: true, sessionPoints: 0,
  }));
  const parityRoom: RoomView = {
    ...room, members, availableGames: [...room.availableGames, impostorManifest],
    selectedGameId: 'pokemon-impostor', selectedGameConfig: { impostorCount: 2 },
    gameConfigs: { 'pokemon-impostor': { impostorCount: 2 } },
  };
  const render = (value: RoomView) => renderToStaticMarkup(<MemoryRouter><Lobby
    room={value} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
    onSelectGame={noOp} onConfig={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
    onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
  /></MemoryRouter>);

  it('blocks a fixed start with the parity literal', () => {
    expect(render(parityRoom)).toContain('Demasiados impostores: con 4 jugadores el máximo es 1.');
    expect(render(parityRoom)).toContain('>Falta algo<');
    expect(render(parityRoom)).not.toContain('>Todo listo<');
  });

  it('excludes the game from a rotation instead of blocking the start', () => {
    const markup = render({
      ...parityRoom, selectedGameId: 'pokedex-distance', selectedGameConfig: room.selectedGameConfig,
      gameSelectionMode: { type: 'RANDOM', gameIds: ['pokemon-impostor', 'pokedex-distance', 'shiny-vote'] },
    });
    expect(markup).toContain('La sala está lista.');
    expect(markup).toContain('>Todo listo<');
    expect(markup).not.toContain('>Falta algo<');
  });

  it('does not count the excluded game towards the rotation minimum', () => {
    const markup = render({
      ...parityRoom, selectedGameId: 'pokedex-distance', selectedGameConfig: room.selectedGameConfig,
      gameSelectionMode: { type: 'RANDOM', gameIds: ['pokemon-impostor', 'pokedex-distance'] },
    });
    expect(markup).toContain('La rotación aleatoria necesita al menos 2 minijuegos compatibles.');
  });
});

