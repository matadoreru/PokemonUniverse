import type { RoomView, WhoIsWhoPlayerState, WhoIsWhoPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WhoIsWhoPokemonGame } from './WhoIsWhoPokemonGame';

const board = [
  { id: 'forretress', nationalDexNumber: 205, name: 'Forretress', sprite: '/forretress.png' },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', sprite: '/pikachu.png' },
  { id: 'bulbasaur', nationalDexNumber: 1, name: 'Bulbasaur', sprite: '/bulbasaur.png' },
];
const members: RoomView['members'] = ['blue-1', 'blue-2', 'red-1'].map((id, index) => ({
  id, displayName: ['Jose', 'Pepe', 'Eru'][index]!, avatar: { type: 'DEFAULT' }, connected: true,
  presence: 'CONNECTED', roomRole: index === 0 ? 'HOST' : 'MEMBER', role: 'PLAYER', isHost: index === 0,
  ready: false, sessionPoints: 0,
}));

function game(): WhoIsWhoPublicState {
  return {
    gameId: 'who-is-who-pokemon', phase: 'TURN_ACTIVE', board,
    teams: { BLUE: { playerIds: ['blue-1', 'blue-2'], secretReady: true }, RED: { playerIds: ['red-1'], secretReady: true } }, currentTeam: 'BLUE',
    roundNumber: 2, turnNumber: 3, totalRounds: 25, roundStartedAt: 1_000, roundEndsAt: 31_000,
    guesses: [], winnerTeam: null, revealedSecrets: { BLUE: null, RED: null }, results: null,
  };
}

function room(player: WhoIsWhoPlayerState): RoomView {
  return {
    code: 'ABC234', phase: 'TURN_ACTIVE', hostId: 'blue-1', maxPlayers: 8, members,
    availableGames: [], selectedGameId: 'who-is-who-pokemon', selectedGameConfig: { generations: [1, 2], boardSize: 24, turnSeconds: 30, rounds: 25 },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], game: game(), gamePlayerState: player, serverNow: 2_000,
  };
}

describe('Who is Who Pokémon table presentation', () => {
  it('renders two symmetric team boards and the own secret as the visual center', () => {
    const html = renderToStaticMarkup(createElement(WhoIsWhoPokemonGame, {
      room: room({ role: 'PLAYER', team: 'BLUE', ownSecret: board[0]!, discardedPokemonIds: ['pikachu'], canChooseSecret: false, canManageBoard: true, canAct: true, canGuess: true, guessUsed: false, lastGuess: null }),
      selfId: 'blue-1', onAction: async () => undefined,
    }));
    expect(html).toContain('Equipo Azul'); expect(html).toContain('Equipo Rojo');
    expect(html).toContain('TU POKÉMON'); expect(html).toContain('Forretress'); expect(html).toContain('N.º 205');
    expect(html).toContain('Adivinar Pokémon'); expect(html).toContain('aria-label="Restaurar Pikachu"');
    expect(html).toContain('opacity-30'); expect(html).toContain('grayscale');
    expect(html).not.toContain('Cómo jugar'); expect(html).not.toContain('conserva'); expect(html).not.toContain('descartes disponibles');
  });

  it('does not render a secret or board controls for spectators', () => {
    const html = renderToStaticMarkup(createElement(WhoIsWhoPokemonGame, {
      room: room({ role: 'SPECTATOR', team: null, ownSecret: null, discardedPokemonIds: [], canChooseSecret: false, canManageBoard: false, canAct: false, canGuess: false, guessUsed: false, lastGuess: null }),
      selfId: 'spectator', onAction: async () => undefined,
    }));
    expect(html).toContain('TU POKÉMON'); expect(html).toContain('>?</span>');
    expect(html).not.toContain('N.º 205'); expect(html).not.toContain('Restaurar Pikachu');
    expect(html).not.toContain('Forretress</h2>');
  });
});
