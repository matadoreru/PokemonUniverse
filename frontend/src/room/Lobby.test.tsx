import type { ChatMessage, RoomView } from '@pokemon-universe/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby';

// El hook real, sin `matchMedia` (como en estas pruebas de marcado), da `false`: el móvil. `wide` simula el escritorio.
let wide = false;
vi.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => wide }));

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
/** Chat vacío y sus órdenes: los tests de chat los cambian. */
const chatProps = { chat: [] as ChatMessage[], chatHistoryVersion: 0, onSendChat: noOp, onDeleteChatMessage: noOp, onSetChatMute: noOp };

describe('lobby information hierarchy', () => {
  it('shows game cards without descriptions and separates the lobby into accessible tabs', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
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
    // La nota «Hablando es mejor» pasa a ser el estado vacío del chat.
    expect(markup).toContain('Hablando es mejor');
    expect(markup).toContain('Discord, Zoom');
    expect(markup).not.toContain('Recomendación para jugar');
    // El feedback con contexto sale de la píldora de la cabecera: sin tarjeta duplicada en el lobby.
    expect(markup).not.toContain('Tu opinión cuenta');
    expect(markup).not.toContain('/feedback');
    expect(markup).toContain('>Jugadores<');
    expect(markup).toContain('Iniciar partida');
    // Las cuatro pestañas (con «Chat» en el móvil) quedan montadas: cambiar de pestaña no pierde el estado.
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(markup.match(/role="tabpanel"[^>]*hidden=""/g)).toHaveLength(3);
    expect(markup).toContain('Ajustes de Pokédex Distance');
  });

  it('gives the host the red start pill and game cards as toggle buttons, without the ready pill', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Lobby
      room={room} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
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
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
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
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
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
    onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
  /></MemoryRouter>);
  const card = (markup: string, name: string) => markup.match(new RegExp(`<li[^>]*>(?:(?!</li>).)*${name}(?:(?!</li>).)*</li>`))?.[0] ?? '';

  it('la carta lleva un chip con el modo cuando no es Clásico', () => {
    const markup = render({ 'pokedex-distance': { generations: [1], roundSeconds: 20, selectionVisibility: 'HIDDEN', pointsRounds: 10, mode: 'POINTS' } });
    expect(card(markup, 'Pokédex Distance')).toContain('>Por puntos<');
    expect(card(markup, 'Shiny Quiz')).not.toContain('Supervivencia');
  });

  it('la carta de un juego con varios modos dice cuántos tiene; la de uno sin modos no', () => {
    const markup = render({});
    expect(card(markup, 'Pokédex Distance')).toContain('>2 modos<');
    expect(card(markup, 'Shiny Quiz')).toContain('>2 modos<');
  });

  it('al azar o por votación el chip dice los modos que pueden salir', () => {
    const chance = (allowedModes: Record<string, string[]>, type: 'RANDOM' | 'ORDER' = 'RANDOM') => renderToStaticMarkup(<MemoryRouter><Lobby
      room={{ ...room, gameConfigs: {}, allowedModes, gameSelectionMode: { type, gameIds: room.gameSelectionMode.gameIds } }} selfId="host" onLeave={() => undefined} onReady={noOp} onStart={noOp}
      onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
      onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
    /></MemoryRouter>);
    expect(card(chance({ 'pokedex-distance': ['CLASSIC', 'POINTS'] }), 'Pokédex Distance')).toContain('>2 modos en juego<');
    expect(card(chance({ 'pokedex-distance': ['POINTS'] }), 'Pokédex Distance')).toContain('>Por puntos<');
    expect(card(chance({ 'pokedex-distance': ['CLASSIC'] }), 'Pokédex Distance')).not.toContain('Clásico');
    // Con el host eligiendo cuenta el modo de la configuración, no los marcados.
    expect(card(chance({ 'pokedex-distance': ['CLASSIC', 'POINTS'] }, 'ORDER'), 'Pokédex Distance')).not.toContain('en juego');
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
    onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps}
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
    expect(renderToStaticMarkup(<MemoryRouter><Lobby room={empty} selfId="p2" onLeave={() => undefined} onReady={noOp} onStart={noOp} onGameConfig={noOp} onSession={noOp} onGameSelection={noOp} onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps} /></MemoryRouter>)).not.toContain('Elige al menos un minijuego para empezar.');
  });

  it('starts a rotation with one compatible game, the excluded one is skipped', () => {
    const markup = render({
      ...parityRoom, selectedGameId: 'pokemon-impostor',
      gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-impostor', 'pokedex-distance'] },
    });
    expect(markup).toContain('La sala está lista.');
  });
});


/** Quita del marcado cada `div` que empieza por `start`, con todo su contenido (cuenta los `div` anidados). */
function stripDivs(markup: string, start: string): string {
  let out = markup;
  for (let at = out.indexOf(start); at !== -1; at = out.indexOf(start)) {
    const tags = /<div[\s>]|<\/div>/g;
    tags.lastIndex = at;
    let depth = 0;
    let end = out.length;
    for (let tag = tags.exec(out); tag; tag = tags.exec(out)) {
      depth += tag[0] === '</div>' ? -1 : 1;
      if (depth === 0) { end = tag.index + tag[0].length; break; }
    }
    out = out.slice(0, at) + out.slice(end);
  }
  return out;
}

describe('lobby chat', () => {
  const message = (seq: number, authorId: string, authorName: string, text: string): ChatMessage => ({ seq, authorId, authorName, text, sentAt: 0 });
  const reconnecting: RoomView = { ...room, members: room.members.map((member) => member.id === 'host' ? { ...member, presence: 'TEMPORARILY_DISCONNECTED' as const, connected: false } : member) };
  const render = (props: { room?: RoomView; selfId?: string; chat?: ChatMessage[] } = {}) => renderToStaticMarkup(<MemoryRouter><Lobby
    room={props.room ?? room} selfId={props.selfId ?? 'guest'} onLeave={() => undefined} onReady={noOp} onStart={noOp}
    onGameConfig={noOp} onSession={noOp} onGameSelection={noOp}
    onSetRoomRole={noOp} onTransferHost={noOp} onKick={noOp} onEndSession={() => undefined} {...chatProps} chat={props.chat ?? []}
  /></MemoryRouter>);
  const tabs = (markup: string) => [...markup.matchAll(/<button[^>]*role="tab"[^>]*>((?:(?!<\/button>).)*)<\/button>/g)].map((match) => match[1] ?? '');
  /**
   * Regiones vivas del lobby fuera de los paneles de pestaña. Las de dentro de una pestaña (el aviso del orden de los
   * minijuegos, las notas de los ajustes) son de esa pestaña y quedan inertes mientras está oculta (`hidden` =
   * `display: none`); la del lobby es la única que se oye siempre: el chat y el aviso del host reconectando.
   */
  const liveRegions = (markup: string) => stripDivs(markup, '<div role="tabpanel"').match(/role="status"|aria-live=/g) ?? [];

  it('sin matchMedia (móvil) hay cuatro pestañas y la cuarta es «Chat»', () => {
    wide = false;
    const labels = tabs(render());
    expect(labels).toHaveLength(4);
    expect(labels[3]).toContain('Chat');
    expect(render()).toContain('id="lobby-panel-chat"');
  });

  it('los nombres accesibles «Minijuegos» y «Configuración» se mantienen, con las etiquetas cortas ocultas', () => {
    const markup = render();
    expect(markup).toContain('<span class="lg:hidden" aria-hidden="true">Juegos</span><span class="max-lg:sr-only">Minijuegos</span>');
    expect(markup).toContain('<span class="lg:hidden" aria-hidden="true">Ajustes</span><span class="max-lg:sr-only">Configuración</span>');
    expect(markup).toContain('Modo<span class="max-lg:sr-only"> y sesión</span>');
  });

  it('en escritorio el chat va en la columna lateral, sin pestaña «Chat»', () => {
    wide = true;
    try {
      const markup = render();
      expect(tabs(markup)).toHaveLength(3);
      expect(markup).not.toContain('id="lobby-panel-chat"');
      expect(markup).toMatch(/aria-label="Mensajes del chat"|Hablando es mejor/);
      expect(markup.indexOf('>Chat<')).toBeGreaterThan(markup.indexOf('>Jugadores<'));
    } finally { wide = false; }
  });

  it('lobby has one live region', () => {
    for (const isWide of [false, true]) {
      wide = isWide;
      try {
        for (const value of [room, reconnecting]) {
          const markup = render({ room: value, chat: [message(1, 'host', 'Eru', 'hola')] });
          expect(liveRegions(markup)).toHaveLength(2); // role="status" y aria-live del mismo <p>
          expect(markup).toMatch(/<p class="sr-only" role="status" aria-live="polite">/);
        }
        expect(liveRegions(render({ chat: [] }))).toHaveLength(2);
      } finally { wide = false; }
    }
    // El aviso visible del host reconectando ya no es región viva: su texto va por la del lobby.
    expect(render({ room: reconnecting })).toMatch(/<p class="sr-only" role="status" aria-live="polite"><span>El host está reconectando/);
  });

  it('remount with existing messages shows no unread', () => {
    const markup = render({ chat: [message(1, 'host', 'Eru', 'hola'), message(2, 'host', 'Eru', '¿listos?')] });
    const chatTab = tabs(markup)[3] ?? '';
    expect(chatTab).toContain('Chat');
    expect(chatTab).not.toContain('sin leer');
    expect(chatTab.replace(/<svg.*?<\/svg>/g, '')).not.toMatch(/\d/);
    expect(markup).toMatch(/<p class="sr-only" role="status" aria-live="polite"><span><\/span><span><\/span><\/p>/);
  });
});
