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
  sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokedex-distance'] }, nextGameVote: null,
  gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, serverNow: 1_000,
};

const noOp = async () => undefined;

describe('lobby information hierarchy', () => {
  it('shows game cards without descriptions and separates the lobby into accessible tabs', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
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
    expect(markup).toContain('>BETA<');
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
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    /></MemoryRouter>);
    expect(markup).toContain('¡Empezar partida!');
    expect(markup).toContain('id="start-help"');
    expect(markup).not.toContain('Marcarme listo');
    expect(markup).toContain('aria-label="Minijuegos"');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Pokédex Distance/);
    // La elegida lleva su número de orden en la sesión.
    expect(markup).toMatch(/class="[^"]*tick[^"]*" aria-hidden="true">1</);
    expect(markup).toContain('n.º 1 de la sesión');
    expect(markup).toContain('1 elegido');
    expect(markup).not.toContain('Solo lectura');
  });
});

describe('lobby how to play', () => {
  it('no game card offers «Cómo se juega» and badges sit in the corner', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="guest" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
    /></MemoryRouter>);
    expect(markup).not.toContain('Cómo se juega');
    expect(markup).toMatch(/class="[^"]*corner[^"]*"><span[^>]*>TOP<\/span>/);
    expect(markup).toMatch(/class="[^"]*corner[^"]*"><span[^>]*>BETA<\/span>/);
    // La elegida solo lleva su número en la esquina: sin insignia «Seleccionado» que agrande la carta.
    expect(markup).not.toContain('Seleccionado');
    expect(markup).toMatch(/class="[^"]*tick[^"]*" aria-hidden="true">1</);
  });

  it('shows a guest read-only cards, their own ready pill and no start pill', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={{ ...room, members: room.members.map((member) => member.id === 'guest' ? { ...member, ready: false } : member) }} selfId="guest" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
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

describe('lobby game modes', () => {
  const render = (gameConfigs: Record<string, unknown>) => renderToStaticMarkup(<MemoryRouter><Lobby
    room={{ ...room, gameConfigs }} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
    onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
    onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
  /></MemoryRouter>);
  const card = (markup: string, name: string) => markup.match(new RegExp(`<li[^>]*>(?:(?!</li>).)*${name}(?:(?!</li>).)*</li>`))?.[0] ?? '';

  it('la carta lleva un chip con el modo cuando no es Clásico', () => {
    const markup = render({ 'pokedex-distance': { generations: [1], roundSeconds: 20, selectionVisibility: 'HIDDEN', pointsRounds: 10, mode: 'POINTS' } });
    expect(card(markup, 'Pokédex Distance')).toContain('>Por puntos<');
    expect(card(markup, 'Shiny Quiz')).not.toContain('Supervivencia');
  });

  it('sin chip de modo en Clásico ni en una configuración guardada sin mode', () => {
    for (const config of [{ generations: [1], roundSeconds: 20, mode: 'CLASSIC' }, { generations: [1], roundSeconds: 20 }]) {
      const markup = render({ 'pokedex-distance': config });
      expect(card(markup, 'Pokédex Distance')).not.toContain('Por puntos');
      expect(card(markup, 'Pokédex Distance')).not.toContain('Clásico');
    }
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
    gameConfigs: { 'pokemon-impostor': { impostorCount: 2 } }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-impostor'] },
  };
  const render = (value: RoomView) => renderToStaticMarkup(<MemoryRouter><Lobby
    room={value} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
    onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
    onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined}
  /></MemoryRouter>);

  it('blocks a single-game start with the parity literal', () => {
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

  it('blocks the start when no selected game fits the connected players', () => {
    const markup = render({
      ...parityRoom, selectedGameId: 'pokemon-impostor',
      gameSelectionMode: { type: 'VOTE', gameIds: ['pokemon-impostor', 'shiny-vote'] },
      members: parityRoom.members.slice(0, 1).concat(parityRoom.members.slice(1).map((member) => ({ ...member, presence: 'LEFT' as const, connected: false }))),
      availableGames: parityRoom.availableGames.map((game) => game.id === 'shiny-vote' ? { ...game, maxPlayers: 0 } : game),
    });
    expect(markup).toContain('Ningún minijuego elegido admite el número actual de jugadores.');
  });

  it('with no game selected, the start waits for a game before anything else but the host check', () => {
    const empty: RoomView = { ...parityRoom, gameSelectionMode: { type: 'VOTE', gameIds: [] }, members: parityRoom.members.map((member) => member.id === 'p2' ? { ...member, ready: false } : member) };
    const markup = render(empty);
    expect(markup).toContain('Elige al menos un minijuego para empezar.');
    expect(markup).not.toContain('Falta por confirmar');
    expect(markup).toMatch(/<button[^>]*aria-describedby="start-help"[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Empezar partida/);
    expect(markup).toContain('0 elegidos');
    // Un invitado sigue viendo que solo el host puede empezar.
    expect(renderToStaticMarkup(<MemoryRouter><Lobby room={empty} selfId="p2" onLeave={() => undefined} onReady={noOp} onStart={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp} onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} /></MemoryRouter>)).not.toContain('Elige al menos un minijuego para empezar.');
  });

  it('starts a rotation with one compatible game, the excluded one is skipped', () => {
    const markup = render({
      ...parityRoom, selectedGameId: 'pokemon-impostor',
      gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-impostor', 'pokedex-distance'] },
    });
    expect(markup).toContain('La sala está lista.');
  });
});

