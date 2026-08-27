import type { PokemonBluffAuctionPlayerState, PokemonBluffAuctionPublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { confirmBluffAuctionPass, PokemonBluffAuctionGame } from './PokemonBluffAuctionGame';

const players = ['Ana', 'Pedro', 'Carlos'].map((displayName, index) => ({
  id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true,
  presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const,
  role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: 0,
}));

function game(phase: PokemonBluffAuctionPublicState['phase'] = 'ROUND_ACTIVE'): PokemonBluffAuctionPublicState {
  return {
    gameId: 'pokemon-bluff-auction', phase, roundNumber: 2, totalRounds: 10, playerIds: ['p1', 'p2', 'p3'],
    condition: { description: 'Tipo Agua + Velocidad > 80', clauses: ['Tipo Agua', 'Velocidad > 80'] },
    bidOrder: ['p2', 'p1', 'p3'], currentTurnPlayerId: phase === 'ROUND_ACTIVE' ? 'p1' : null,
    passedPlayerIds: ['p2'], currentBid: 5, minimumBid: 6, currentBidderId: 'p3',
    bidHistory: [{ playerId: 'p2', type: 'PASS' }, { playerId: 'p3', type: 'BID', amount: 5 }],
    maxBid: 1025, bidderId: phase === 'ROUND_ACTIVE' ? null : 'p3', targetBid: phase === 'ROUND_ACTIVE' ? null : 5,
    attempts: [], correctCount: 0, incorrectCount: 0, remainingCount: phase === 'ROUND_ACTIVE' ? 0 : 5,
    scores: { p1: 0, p2: 0, p3: 0 }, roundEndsAt: phase === 'POKEMON_SEARCH' ? 31_000 : null,
    nextTransitionAt: null, lastRound: null, results: null,
  };
}

function room(publicGame: PokemonBluffAuctionPublicState, player: PokemonBluffAuctionPlayerState): RoomView {
  return {
    code: 'ABC234', phase: publicGame.phase, hostId: 'p1', maxPlayers: 8, members: players,
    availableGames: [{ id: 'pokemon-bluff-auction', name: 'Pokémon Bluff Auction', icon: '🔨', description: 'Pujas', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'pokemon-bluff-auction', selectedGameConfig: { generations: [1, 2, 3], demonstrationSeconds: 30, rounds: 10 },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null,
    gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: publicGame, gamePlayerState: player, serverNow: 1_000,
  };
}

describe('Pokémon Bluff Auction presentation', () => {
  it('makes condition, current bid, active turn and passed players immediately clear', () => {
    const html = renderToStaticMarkup(createElement(PokemonBluffAuctionGame, {
      room: room(game(), { role: 'PLAYER', canRaise: true, canPass: true, canSubmitPokemon: false }), selfId: 'p1', onAction: async () => undefined,
    }));
    expect(html).toContain('Tipo Agua + Velocidad &gt; 80'); expect(html).toContain('Puja actual'); expect(html).toContain('5');
    expect(html).toContain('Ana'); expect(html).toContain('ESTÁ PUJANDO'); expect(html).toContain('PASÓ'); expect(html).toContain('Pasar esta ronda');
    expect(html).not.toContain('validPokemon'); expect(html).not.toContain('respuestas válidas');
  });

  it('requires explicit confirmation before passing', () => {
    let message = '';
    expect(confirmBluffAuctionPass((value) => { message = value; return false; })).toBe(false);
    expect(message).toContain('Quedarás fuera de esta ronda');
    expect(confirmBluffAuctionPass(() => true)).toBe(true);
  });

  it('shows the shared search only to the bidder and exposes public progress without solution count', () => {
    const publicGame = game('POKEMON_SEARCH'); publicGame.attempts = [
      { pokemon: { id: 'dragonite', name: 'Dragonite', sprite: '/dragonite.png' }, result: 'CORRECT', submittedAt: 2_000 },
      { pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }, result: 'INCORRECT', submittedAt: 3_000 },
    ]; publicGame.correctCount = 1; publicGame.incorrectCount = 1; publicGame.remainingCount = 4;
    const bidder = renderToStaticMarkup(createElement(PokemonBluffAuctionGame, {
      room: room(publicGame, { role: 'PLAYER', canRaise: false, canPass: false, canSubmitPokemon: true }), selfId: 'p3', onAction: async () => undefined,
    }));
    expect(bidder).toContain('Nombra Pokémon'); expect(bidder).toContain('Acierto: +5 segundos · Fallo: −3 segundos.'); expect(bidder).toContain('Dragonite'); expect(bidder).toContain('Pikachu'); expect(bidder).toContain('Correctos'); expect(bidder).toContain('1/5');
    const watcher = renderToStaticMarkup(createElement(PokemonBluffAuctionGame, {
      room: room(publicGame, { role: 'PLAYER', canRaise: false, canPass: false, canSubmitPokemon: false }), selfId: 'p1', onAction: async () => undefined,
    }));
    expect(watcher).not.toContain('Buscar Pokémon para demostrar la apuesta'); expect(watcher).toContain('Todos veis los intentos');
    expect(watcher).not.toContain('Solo existían');
  });

  it('explains duplicates publicly without presenting them as valid credit', () => {
    const publicGame = game('POKEMON_SEARCH'); publicGame.attempts = [{ pokemon: { id: 'garchomp', name: 'Garchomp', sprite: '/garchomp.png' }, result: 'DUPLICATE', submittedAt: 4_000 }];
    const html = renderToStaticMarkup(createElement(PokemonBluffAuctionGame, {
      room: room(publicGame, { role: 'SPECTATOR', canRaise: false, canPass: false, canSubmitPokemon: false }), selfId: 'spectator', onAction: async () => undefined,
    }));
    expect(html).toContain('Garchomp'); expect(html).toContain('Ya utilizado · no cambia el tiempo');
  });
});
