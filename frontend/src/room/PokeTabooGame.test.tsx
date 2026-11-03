import type { PokeTabooPlayerState, PokeTabooPublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokeTabooGame } from './PokeTabooGame';

function publicGame(): PokeTabooPublicState {
  return {
    gameId: 'poke-taboo', phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 3, lapNumber: 1, totalLaps: 1,
    descriptorId: 'p1', nextDescriptorId: 'p2', descriptorOrder: ['p1', 'p2', 'p3'], hints: [], attempts: [], scores: { p1: 0, p2: 0, p3: 0 },
    roundStartedAt: 1_000, roundEndsAt: 61_000, nextTransitionAt: null, lastRound: null, results: null,
  };
}

function room(player: PokeTabooPlayerState): RoomView {
  return {
    code: 'ABC234', phase: 'ROUND_ACTIVE', hostId: 'p1', maxPlayers: 8,
    members: [
      { id: 'p1', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 },
      { id: 'p2', displayName: 'Pedro', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
      { id: 'p3', displayName: 'Carlos', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
    ],
    availableGames: [{ id: 'poke-taboo', name: 'PokéTaboo', icon: '🎙️', description: 'Describe', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'poke-taboo', selectedGameConfig: { generations: [1, 4], roundSeconds: 60, laps: 1, includeRegionalForms: true },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], game: publicGame(), gamePlayerState: player, serverNow: 1_000,
  };
}

describe('PokéTaboo role presentation', () => {
  it('shows the complete secret only to the descriptor', () => {
    const descriptor = renderToStaticMarkup(createElement(PokeTabooGame, { room: room({ role: 'DESCRIPTOR', canSendHint: true, secretPokemon: {
      id: 'lucario', name: 'Lucario', sprite: '/lucario.png', generation: 4, types: ['fighting', 'steel'], hp: 70, attack: 110,
      defense: 70, specialAttack: 115, specialDefense: 70, speed: 90, baseStatTotal: 525, evolutionStage: 2,
      evolutionStageCount: 2, heightDecimeters: 12, weightHectograms: 540, legendaryStatus: 'NORMAL', abilities: ['inner-focus'],
    } }), selfId: 'p1', onAction: async () => undefined }));
    expect(descriptor).toContain('SOLO TÚ PUEDES VER ESTO'); expect(descriptor).toContain('Lucario'); expect(descriptor).toContain('Total de stats'); expect(descriptor).toContain('Escribe una pista');
  });

  it('gives guessers only the voice guidance, text hints and shared name-and-sprite search', () => {
    const guesser = renderToStaticMarkup(createElement(PokeTabooGame, { room: room({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0 }), selfId: 'p2', onAction: async () => undefined }));
    expect(guesser).toContain('Ana está describiendo'); expect(guesser).toContain('Pistas de Ana'); expect(guesser).toContain('Buscar Pokémon');
    expect(guesser).not.toContain('SOLO TÚ PUEDES VER ESTO'); expect(guesser).not.toContain('Total de stats'); expect(guesser).not.toContain('Lucario');
  });

  it('lets spectators follow the round without response controls', () => {
    const spectator = renderToStaticMarkup(createElement(PokeTabooGame, { room: room({ role: 'SPECTATOR' }), selfId: 'p3', onAction: async () => undefined }));
    expect(spectator).toContain('Estás observando'); expect(spectator).toContain('Pistas de Ana'); expect(spectator).not.toContain('Buscar respuesta para la ronda');
  });
});
