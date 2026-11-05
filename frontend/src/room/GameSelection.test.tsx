import type { MiniGameManifest, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameOrderChoice, gameOrderHint, SelectedGamesConfig, toggleSelectedGame } from './GameSelectionConfig';
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
    sessionStandings: [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, sessionPoints: 5 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, sessionPoints: 2 },
      { id: 'p3', displayName: 'Leo', avatar: { type: 'DEFAULT' }, sessionPoints: 0 },
    ],
    sessionHistory: [{ gameNumber: 1, gameId: 'one', winnerIds: ['p1'], points: { p1: 5, p2: 2, p3: 0 } }],
    nextGameVote: {
      options: games, eligibleVoterIds: ['p1', 'p2', 'p3'], votedPlayerIds: resolved ? ['p1', 'p2', 'p3'] : [], ownVoteGameId: null,
      endsAt: resolved ? null : Date.now() + 15_000, resolvedGameId: resolved ? 'two' : null,
      tallies: resolved ? { one: 0, two: 3, three: 0 } : null, nextTransitionAt: resolved ? Date.now() + 3_000 : null,
    },
    game: { gameId: 'one', results: { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 5, stats: {} }, { playerId: 'p2', position: 2, points: 2, stats: {} }] } },
    gamePlayerState: null, serverNow: Date.now(), members: [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 5 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: true, sessionPoints: 2 },
      { id: 'p3', displayName: 'Leo', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: true, sessionPoints: 0 },
    ],
  };
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
    expect(gameOrderHint('ORDER', 3)).toBe('Se juegan los 3 minijuegos en el orden en que los elegiste y se vuelve a empezar.');
    expect(gameOrderHint('RANDOM', 2)).toContain('al azar entre los 2');
    expect(gameOrderHint('VOTE', 5)).toBe('Tras cada partida se vota entre 3 de los 5 minijuegos.');
    expect(gameOrderHint('VOTE', 1)).toBe('Con un solo minijuego compatible, se juega siempre ese.');
  });

  it('toggles games keeping the selection order and never empties it', () => {
    expect(toggleSelectedGame({ type: 'ORDER', gameIds: ['one'] }, 'two')).toEqual({ type: 'ORDER', gameIds: ['one', 'two'] });
    expect(toggleSelectedGame({ type: 'VOTE', gameIds: ['one', 'two'] }, 'one')).toEqual({ type: 'VOTE', gameIds: ['two'] });
    expect(toggleSelectedGame({ type: 'RANDOM', gameIds: ['one'] }, 'one')).toBeNull();
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
  });
});
