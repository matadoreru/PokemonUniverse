import type { OneOfUsIsFakePlayerState, OneOfUsIsFakePublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OneOfUsIsFakeGame } from './OneOfUsIsFakeGame';

const members: RoomView['members'] = ['p1', 'p2', 'p3'].map((id, index) => ({
  id, displayName: ['Ana', 'Pedro', 'Carlos'][index]!, avatar: { type: 'DEFAULT' }, connected: true,
  presence: 'CONNECTED', roomRole: index === 0 ? 'HOST' : 'MEMBER', role: 'PLAYER', isHost: index === 0,
  ready: false, sessionPoints: 0,
}));

function publicGame(phase: OneOfUsIsFakePublicState['phase'] = 'ROUND_ACTIVE'): OneOfUsIsFakePublicState {
  return {
    gameId: 'one-of-us-is-fake', phase, roundNumber: 1, totalRounds: 5, playerIds: ['p1', 'p2', 'p3'],
    selectionCompletedIds: ['p1'], revealedChoices: [], votedPlayerIds: [], voteCandidates: ['p1', 'p2', 'p3'],
    voteRoundNumber: 1, scores: { p1: 0, p2: 0, p3: 0 }, roundEndsAt: 31_000,
    nextTransitionAt: null, lastRound: null, results: null,
  };
}

function room(game: OneOfUsIsFakePublicState, player: OneOfUsIsFakePlayerState): RoomView {
  return {
    code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, members,
    availableGames: [{ id: 'one-of-us-is-fake', name: 'One of Us Is Fake', icon: '🕵️', description: 'Categorías', minPlayers: 3, profileStats: { metrics: [] } }],
    selectedGameId: 'one-of-us-is-fake', selectedGameConfig: { generations: [1], selectionSeconds: 30, discussionSeconds: 180, rounds: 5, fakeKnows: false, categorySource: 'OFFICIAL', includeRegionalForms: true },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], game, gamePlayerState: player, serverNow: 1_000,
  };
}

describe('One of Us Is Fake presentation', () => {
  it('shows only the player category and a name-and-sprite choice flow', () => {
    const html = renderToStaticMarkup(createElement(OneOfUsIsFakeGame, {
      room: room(publicGame(), { role: 'PLAYER', myCategory: 'Pokémon que parecen mascotas', ownChoice: null, canSelect: true, canVote: false, ownVotePlayerId: null }),
      selfId: 'p1', onAction: async () => undefined,
    }));
    expect(html).toContain('Pokémon que parecen mascotas'); expect(html).toContain('Elige cualquier Pokémon');
    expect(html).toContain('Estado del grupo'); expect(html).not.toContain('Categoría principal'); expect(html).not.toContain('Categoría del fake');
  });

  it('marks the fake only when the private projection explicitly says so', () => {
    const informed = renderToStaticMarkup(createElement(OneOfUsIsFakeGame, {
      room: room(publicGame(), { role: 'PLAYER', myCategory: 'Pokémon guardaespaldas', isFake: true, ownChoice: null, canSelect: true, canVote: false, ownVotePlayerId: null }),
      selfId: 'p2', onAction: async () => undefined,
    }));
    expect(informed).toContain('Tienes una categoría diferente'); expect(informed).toContain('FAKE');
    const hidden = renderToStaticMarkup(createElement(OneOfUsIsFakeGame, {
      room: room(publicGame(), { role: 'PLAYER', myCategory: 'Pokémon guardaespaldas', ownChoice: null, canSelect: true, canVote: false, ownVotePlayerId: null }),
      selfId: 'p2', onAction: async () => undefined,
    }));
    expect(hidden).not.toContain('Tienes una categoría diferente');
  });

  it('keeps ballot targets secret while showing vote completion and all revealed choices', () => {
    const game = publicGame('DISCUSSION'); game.revealedChoices = [
      { playerId: 'p1', pokemon: { id: 'lapras', name: 'Lapras', sprite: '/lapras.png' } },
      { playerId: 'p2', pokemon: { id: 'arcanine', name: 'Arcanine', sprite: '/arcanine.png' } },
      { playerId: 'p3', pokemon: { id: 'snorlax', name: 'Snorlax', sprite: '/snorlax.png' } },
    ]; game.selectionCompletedIds = ['p1', 'p2', 'p3']; game.votedPlayerIds = ['p2']; game.roundEndsAt = 181_000;
    const html = renderToStaticMarkup(createElement(OneOfUsIsFakeGame, {
      room: room(game, { role: 'PLAYER', myCategory: 'Pokémon de vacaciones', ownChoice: game.revealedChoices[0]!.pokemon, canSelect: false, canVote: true, ownVotePlayerId: null }),
      selfId: 'p1', onAction: async () => undefined,
    }));
    expect(html).toContain('Lapras'); expect(html).toContain('Arcanine'); expect(html).toContain('Snorlax');
    expect(html).toContain('Papeleta secreta'); expect(html).toContain('Ya ha votado'); expect(html).toContain('No puedes votarte');
  });

  it('lets spectators follow social state without category or voting controls', () => {
    const html = renderToStaticMarkup(createElement(OneOfUsIsFakeGame, { room: room(publicGame(), { role: 'SPECTATOR' }), selfId: 'spectator', onAction: async () => undefined }));
    expect(html).toContain('Estás observando'); expect(html).not.toContain('Tu categoría'); expect(html).not.toContain('Buscar Pokémon para tu categoría');
  });
});
