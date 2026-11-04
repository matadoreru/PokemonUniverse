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
    const markup = renderToStaticMarkup(createElement(GameSelectionConfig, {
      availableGames: rotation, mode: { type: 'RANDOM', gameIds }, playerCount: 3, disabled: false, room: lobby, onChange: () => undefined,
    }));
    expect(markup).toContain('Demasiados impostores: con 3 jugadores el máximo es 1.');
    expect(markup).toContain('Se omitirá');
    expect(markup).toContain('3/3 listos');
    expect(markup).not.toContain('Revisar');
    expect(markup).not.toContain('bg-berry');
  });

  it('shows the three rotation methods and the selected voting pool', () => {
    const markup = renderToStaticMarkup(createElement(GameSelectionConfig, {
      availableGames: games, mode: { type: 'VOTE', gameIds: games.map((game) => game.id) }, playerCount: 3, disabled: false, onChange: () => undefined,
    }));
    expect(markup).toContain('Mismo minijuego');
    expect(markup).toContain('Aleatorio');
    expect(markup).toContain('Votación');
    expect(markup).toContain('3 seleccionados');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('disables games and rotation modes that do not support the current player count', () => {
    const markup = renderToStaticMarkup(createElement(GameSelectionConfig, {
      availableGames: games, mode: { type: 'VOTE', gameIds: games.map((game) => game.id) }, playerCount: 9, disabled: false, onChange: () => undefined,
    }));
    expect(markup).toContain('Máximo 8 jugadores');
    expect(markup).toContain('Un juego seleccionado ya no admite');
    expect(markup).toContain('No hay 3 juegos compatibles para 9 jugadores.');
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
