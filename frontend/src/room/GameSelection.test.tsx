import type { MiniGameManifest, RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameOrderChoice, gameOrderHint, queueSlotLabel, queueSlots, queueSlotSpoken, SelectedGamesConfig, sessionModesOf, toggleSelectedGame } from './GameSelectionConfig';
import { NextGameVote } from './NextGameVote';
import { expectSingleLiveRegion } from './test-support/live-regions';
import { member, roomView } from './test-support/room-view';

const games: MiniGameManifest[] = [
  { id: 'one', name: 'Juego uno', icon: '①', description: 'Primera opción.', minPlayers: 1, profileStats: { metrics: [] } },
  { id: 'two', name: 'Juego dos', icon: '②', description: 'Segunda opción.', minPlayers: 2, maxPlayers: 8, profileStats: { metrics: [] } },
  { id: 'three', name: 'Juego tres', icon: '③', description: 'Tercera opción.', minPlayers: 3, profileStats: { metrics: [] } },
];

function room(phase: 'NEXT_GAME_VOTE' | 'NEXT_GAME_VOTE_RESULTS'): RoomView {
  const resolved = phase === 'NEXT_GAME_VOTE_RESULTS';
  return roomView({
    phase, availableGames: games,
    selectedGameId: resolved ? 'two' : 'one', selectedGameConfig: {}, sessionMode: { type: 'GAME_COUNT', target: 5 },
    gameSelectionMode: { type: 'VOTE', gameIds: games.map((game) => game.id) }, gamesPlayed: 1,
    sessionStandings: [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, sessionPoints: 5 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, sessionPoints: 2 },
      { id: 'p3', displayName: 'Leo', avatar: { type: 'DEFAULT' }, sessionPoints: 0 },
    ],
    sessionHistory: [{ gameNumber: 1, gameId: 'one', winnerIds: ['p1'], points: { p1: 5, p2: 2, p3: 0 } }],
    nextGameVote: {
      options: games.map((game) => ({ id: game.id, game, mode: null })), eligibleVoterIds: ['p1', 'p2', 'p3'], votedPlayerIds: resolved ? ['p1', 'p2', 'p3'] : [], ownVoteOptionId: null,
      endsAt: resolved ? null : Date.now() + 15_000, resolvedOptionId: resolved ? 'two' : null,
      tallies: resolved ? { one: 0, two: 3, three: 0 } : null, nextTransitionAt: resolved ? Date.now() + 3_000 : null,
    },
    game: { gameId: 'one', results: { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 5, stats: {} }, { playerId: 'p2', position: 2, points: 2, stats: {} }] } },
    serverNow: Date.now(), members: [
      member({ id: 'p1', displayName: 'Eru', roomRole: 'HOST', isHost: true, sessionPoints: 5 }),
      member({ id: 'p2', displayName: 'Ana', ready: true, sessionPoints: 2 }),
      member({ id: 'p3', displayName: 'Leo', ready: true }),
    ],
  });
}

describe('game selection UI', () => {
  it('marks an Impostor excluded by parity as skipped instead of needing review', () => {
    const impostor: MiniGameManifest = { id: 'pokemon-impostor', name: 'Pokémon Impostor', icon: '🕵️', description: 'Encuentra al impostor.', minPlayers: 3, profileStats: { metrics: [] } };
    const rotation: MiniGameManifest[] = [
      { id: 'pokedex-distance', name: 'Pokédex Distance', icon: '🎯', description: 'Elige el número más cercano.', minPlayers: 2, profileStats: { metrics: [] } },
      { id: 'shiny-vote', name: 'Shiny Quiz', icon: '✨', description: 'Encuentra el shiny verdadero.', minPlayers: 1, profileStats: { metrics: [] } },
      impostor,
    ];
    const gameIds = rotation.map((game) => game.id);
    const lobby: RoomView = {
      ...room('NEXT_GAME_VOTE'), phase: 'LOBBY', nextGameVote: null, availableGames: rotation, selectedGameId: 'pokedex-distance',
      gameSelectionMode: { type: 'RANDOM', gameIds }, gameConfigs: { 'pokemon-impostor': { impostorCount: 2 } },
    };
    const markup = renderToStaticMarkup(createElement(SelectedGamesConfig, {
      room: lobby, selfId: 'p1', playerCount: 3, disabled: false, onConfig: async () => undefined,
    }));
    expect(markup).toContain('Demasiados impostores: con 3 jugadores el máximo es 1.');
    expect(markup).toContain('Se omitirá');
    expect(markup).toContain('3/3 listos');
    expect(markup).not.toContain('Revisar');
    expect(markup).not.toContain('bg-berry');
  });

  it('shows the three order modes, keeping the selected games when switching', () => {
    const changes: unknown[] = [];
    const markup = renderToStaticMarkup(createElement(GameOrderChoice, {
      mode: { type: 'VOTE', gameIds: ['two', 'one'] }, compatibleCount: 2, disabled: false, onChange: (mode) => changes.push(mode),
    }));
    expect(markup).toContain('Por orden');
    expect(markup).toContain('Aleatorio');
    expect(markup).toContain('Votación');
    expect(markup).toContain('aria-label="Orden de los minijuegos"');
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain('Tras cada partida se vota entre 2 de los 2 minijuegos.');
  });

  it('explains how each order mode uses the compatible games', () => {
    expect(gameOrderHint('ORDER', 3, 3)).toBe('Se juegan los 3 minijuegos en el orden en que los elegiste y se vuelve a empezar.');
    expect(gameOrderHint('RANDOM', 2, 2)).toContain('al azar entre los 2');
    expect(gameOrderHint('VOTE', 5, 5)).toBe('Tras cada partida se vota entre 3 de los 5 minijuegos.');
    expect(gameOrderHint('VOTE', 1, 1)).toBe('Con un solo minijuego compatible, se juega siempre ese.');
    expect(gameOrderHint('ORDER', 0, 0)).toBe('Elige al menos un minijuego.');
    expect(gameOrderHint('VOTE', 0, 2)).toBe('Ninguno de los minijuegos elegidos admite a los jugadores de ahora.');
    expect(gameOrderHint('RANDOM', 1, 3)).toBe('Con un solo minijuego compatible, se juega siempre ese.');
    // Al azar o por votación, cada modo marcado es una opción más; en orden no cuenta.
    expect(gameOrderHint('RANDOM', 1, 1, 2)).toBe('Cada partida sale al azar entre 2 opciones de minijuego y modo, sin repetir la anterior.');
    expect(gameOrderHint('VOTE', 2, 2, 4)).toBe('Tras cada partida se vota entre 3 de las 4 opciones de minijuego y modo.');
    // Por orden, cada modo marcado ocupa su propio turno: la pista cuenta pares juego y modo.
    expect(gameOrderHint('ORDER', 2, 2, 4)).toBe('Se juegan las 4 partidas de minijuego y modo en el orden de la cola y se vuelve a empezar.');
    expect(gameOrderHint('ORDER', 1, 1, 2)).toBe('Se juegan las 2 partidas de minijuego y modo en el orden de la cola y se vuelve a empezar.');
    expect(gameOrderHint('ORDER', 2, 2, 2)).toBe('Se juegan los 2 minijuegos en el orden en que los elegiste y se vuelve a empezar.');
    const vacio = renderToStaticMarkup(createElement(GameOrderChoice, {
      mode: { type: 'ORDER', gameIds: [] }, compatibleCount: 0, disabled: false, onChange: () => undefined,
    }));
    expect(vacio).toContain('Elige al menos un minijuego.');
  });

  it('toggles games keeping the selection order, down to an empty list', () => {
    expect(toggleSelectedGame({ type: 'ORDER', gameIds: ['one'] }, 'two')).toEqual({ type: 'ORDER', gameIds: ['one', 'two'] });
    expect(toggleSelectedGame({ type: 'VOTE', gameIds: ['one', 'two'] }, 'one')).toEqual({ type: 'VOTE', gameIds: ['two'] });
    // Quitar el único elegido deja la lista vacía (el modo se conserva).
    expect(toggleSelectedGame({ type: 'RANDOM', gameIds: ['one'] }, 'one')).toEqual({ type: 'RANDOM', gameIds: [] });
  });

  const realGames: MiniGameManifest[] = [
    { id: 'shiny-vote', name: 'Shiny Quiz', icon: '✨', description: 'Encuentra el shiny verdadero.', minPlayers: 1, maxPlayers: 8, profileStats: { metrics: [] } },
    { id: 'higher-lower', name: 'Higher or Lower', icon: '📈', description: 'Mayor o menor.', minPlayers: 1, profileStats: { metrics: [] } },
  ];
  const lobbyWith = (gameIds: string[]): RoomView => ({ ...room('NEXT_GAME_VOTE'), phase: 'LOBBY', nextGameVote: null, availableGames: realGames, selectedGameId: gameIds[0]!, gameSelectionMode: { type: 'ORDER', gameIds } });

  it('lists every selected game in order with its own settings editor', () => {
    const markup = renderToStaticMarkup(createElement(SelectedGamesConfig, { room: lobbyWith(['higher-lower', 'shiny-vote']), selfId: 'p1', playerCount: 9, disabled: false, onConfig: async () => undefined }));
    expect(markup).toContain('aria-label="Minijuegos elegidos"');
    expect(markup.indexOf('Higher or Lower')).toBeLessThan(markup.indexOf('Shiny Quiz'));
    expect(markup).toContain('Ajustes de Higher or Lower');
    expect(markup).toContain('Máximo 8 jugadores');
    expect(markup).toContain('aria-label="Ajustar Shiny Quiz"');
  });

  it('por orden numera la lista por turnos de la cola (las casillas del panel las prueba GameModeField)', () => {
    const lobby = { ...lobbyWith(['higher-lower', 'shiny-vote']), allowedModes: { 'higher-lower': ['CLASSIC', 'ENDLESS'] } };
    const markup = renderToStaticMarkup(createElement(SelectedGamesConfig, { room: lobby, selfId: 'p1', playerCount: 3, disabled: false, onConfig: async () => undefined, onAllowedModes: () => undefined }));
    // Higher or Lower ocupa los turnos 1 y 2; Shiny Quiz, el 3.
    expect(markup).toMatch(/aria-hidden="true">1–2<\/span>(?:(?!<\/li>).)*Higher or Lower/);
    expect(markup).toMatch(/aria-hidden="true">3<\/span>(?:(?!<\/li>).)*Shiny Quiz/);
  });

  it('el panel lleva las casillas de modos en las tres formas de sesión', () => {
    const lobby = { ...lobbyWith(['higher-lower', 'pokemon-bingo']), allowedModes: { 'higher-lower': ['CLASSIC', 'ENDLESS'] } };
    const changes: unknown[] = [];
    const ordered = sessionModesOf(lobby, 'higher-lower', (gameId, modes) => changes.push([gameId, modes]));
    expect(ordered).toMatchObject({ gameId: 'higher-lower', allowed: ['CLASSIC', 'ENDLESS'], order: true });
    ordered?.onChange(['ENDLESS']);
    expect(changes).toEqual([['higher-lower', ['ENDLESS']]]);
    for (const type of ['RANDOM', 'VOTE'] as const) {
      expect(sessionModesOf({ ...lobby, gameSelectionMode: { type, gameIds: lobby.gameSelectionMode.gameIds } }, 'higher-lower', () => undefined)?.order).toBe(false);
    }
    expect(sessionModesOf(lobby, 'pokemon-bingo', () => undefined)).toBeNull();
    expect(sessionModesOf(lobby, 'higher-lower', undefined)).toBeNull();
  });

  it('queueSlots cuenta pares por orden y juegos al azar o por votación', () => {
    const lobby = { ...lobbyWith(['higher-lower', 'pokemon-bingo', 'shiny-vote']), allowedModes: { 'higher-lower': ['CLASSIC', 'ENDLESS'], 'shiny-vote': ['CLASSIC', 'SURVIVAL'] } };
    expect(queueSlots(lobby)).toEqual({ 'higher-lower': [1, 2], 'pokemon-bingo': [3, 3], 'shiny-vote': [4, 5] });
    expect(queueSlots({ ...lobby, gameSelectionMode: { type: 'RANDOM', gameIds: lobby.gameSelectionMode.gameIds } }))
      .toEqual({ 'higher-lower': [1, 1], 'pokemon-bingo': [2, 2], 'shiny-vote': [3, 3] });
    expect(queueSlotLabel([1, 2])).toBe('1–2');
    expect(queueSlotLabel([3, 3])).toBe('3');
    expect(queueSlotSpoken([3, 3])).toBe('3');
    expect(queueSlotSpoken([1, 2])).toBe('1 y 2');
    expect(queueSlotSpoken([1, 3])).toBe('1 a 3');
  });

  it('with no game selected shows an empty state instead of the settings', () => {
    const markup = renderToStaticMarkup(createElement(SelectedGamesConfig, { room: { ...lobbyWith([]), selectedGameId: 'higher-lower' }, selfId: 'p1', playerCount: 2, disabled: false, onConfig: async () => undefined }));
    expect(markup).toContain('Elige uno o varios minijuegos');
    expect(markup).not.toContain('Ajustes de Higher or Lower');
  });

  it('shows only the editor when a single game is selected', () => {
    const markup = renderToStaticMarkup(createElement(SelectedGamesConfig, { room: lobbyWith(['shiny-vote']), selfId: 'p1', playerCount: 3, disabled: true, onConfig: async () => undefined }));
    expect(markup).toContain('Ajustes de Shiny Quiz');
    expect(markup).not.toContain('Minijuegos elegidos');
    expect(markup).toContain('Solo el host y los co-hosts pueden cambiar estos ajustes.');
  });

  it('renders a private active vote and the public winning reveal', () => {
    const active = renderToStaticMarkup(createElement(NextGameVote, { room: room('NEXT_GAME_VOTE'), selfId: 'p1', onVote: async () => undefined, onEnd: () => undefined }));
    expect(active).toContain('Elige el siguiente minijuego');
    expect(active).toContain('Confirmar voto');
    expect(active).toContain('0/3 votos');
    expect(active).not.toContain('Ganador');
    expect(active).toContain('aria-label="Opciones de voto"');
    expect(active.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(active).toContain('Terminar sesión');
    expect(active).not.toMatch(/btn-|class="chip|class="panel|text-xs/);
    // La clasificación de la sesión en franjas.
    expect(active).toContain('Clasificación de la sesión');
    expect(active).toContain('5 pts');

    const guest = renderToStaticMarkup(createElement(NextGameVote, { room: room('NEXT_GAME_VOTE'), selfId: 'p2', onVote: async () => undefined, onEnd: () => undefined }));
    expect(guest).not.toContain('Terminar sesión');

    const result = renderToStaticMarkup(createElement(NextGameVote, { room: room('NEXT_GAME_VOTE_RESULTS'), selfId: 'p1', onVote: async () => undefined, onEnd: () => undefined }));
    expect(result).toContain('La sala ha elegido Juego dos');
    expect(result).toContain('Ganador');
    expect(result).toContain('3 votos');
    expect(result).toContain('Siguiente minijuego');
    expect(result).not.toContain('Confirmar voto');
    expect(result).not.toContain('aria-pressed');
    // La región viva es el título en las dos fases (existe antes del revelado); la cuenta atrás queda fuera.
    expect(active).toMatch(/role="status" aria-live="polite">Elige una carta</);
    expect(result).toMatch(/role="status" aria-live="polite">La sala ha elegido Juego dos</);
    expect(result).not.toMatch(/aria-live="polite">[^<]*empieza en/);
    // El cut-in del ganador solo se ve: lo dice ya el título de la placa.
    expectSingleLiveRegion(active);
    expectSingleLiveRegion(result);
  });

  it('la votación de la última partida dice que vale doble si la sesión lo pide', () => {
    const base = room('NEXT_GAME_VOTE');
    const render = (sessionMode: RoomView['sessionMode'], gamesPlayed: number) => renderToStaticMarkup(createElement(NextGameVote, { room: { ...base, sessionMode, gamesPlayed }, selfId: 'p1', onVote: async () => undefined, onEnd: () => undefined }));
    expect(render({ type: 'GAME_COUNT', target: 3, doubleLastGame: true }, 2)).toContain('Última partida: vale doble');
    expect(render({ type: 'GAME_COUNT', target: 3, doubleLastGame: true }, 1)).not.toContain('Última partida: vale doble');
    expect(render({ type: 'GAME_COUNT', target: 3 }, 2)).not.toContain('Última partida: vale doble');
    expect(render({ type: 'INFINITE' }, 2)).not.toContain('Última partida: vale doble');
  });

  it('shows each allowed mode of a game as its own vote option, keyed by option id', () => {
    const higherLower = realGames[1]!;
    const base = room('NEXT_GAME_VOTE_RESULTS');
    const vote = { ...base.nextGameVote!, options: [
      { id: 'higher-lower:CLASSIC', game: higherLower, mode: 'CLASSIC' },
      { id: 'higher-lower:ENDLESS', game: higherLower, mode: 'ENDLESS' },
      { id: 'one', game: games[0]!, mode: null },
    ], resolvedOptionId: 'higher-lower:ENDLESS', tallies: { 'higher-lower:CLASSIC': 1, 'higher-lower:ENDLESS': 2, one: 0 } };
    const result = renderToStaticMarkup(createElement(NextGameVote, { room: { ...base, nextGameVote: vote }, selfId: 'p1', onVote: async () => undefined, onEnd: () => undefined }));
    expect(result).toContain('Higher or Lower · Clásico');
    expect(result).toContain('Higher or Lower · Racha infinita');
    expect(result).toContain('La sala ha elegido Higher or Lower · Racha infinita');
    expect(result).toContain('Un fallo y estás fuera. Gana quien encadene más aciertos.');
    expect(result).toContain('2 votos');
    expect(result).toContain('>Juego uno<');
  });
});
