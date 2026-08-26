import { defaultPokemonTeamAuctionConfig, type PokemonTeamAuctionPlayerState, type PokemonTeamAuctionPublicState, type RoomView, type TeamAuctionPokemon } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonTeamAuctionConfigPanel } from '../games/pokemon-team-auction/ConfigPanel';
import { PokemonTeamAuctionGame } from './PokemonTeamAuctionGame';
import { PokemonTeamAuctionResults } from './PokemonTeamAuctionResults';

const pokemon = (id: string, bst: number): TeamAuctionPokemon => ({ id, name: id, sprite: `/${id}.png`, baseStatTotal: bst, legendaryStatus: 'NORMAL' });
const current = pokemon('pikachu', 320); const won = pokemon('charizard', 534); const unowned = pokemon('mewtwo', 680);

function publicGame(phase: 'ROUND_ACTIVE' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): PokemonTeamAuctionPublicState {
  const participants = { p1: { playerId: 'p1', coins: 14, team: [won] }, p2: { playerId: 'p2', coins: 20, team: [] } };
  const lotHistory = [{ lotNumber: 1, pokemon: won, winnerId: 'p1', bid: 6 }, { lotNumber: 2, pokemon: unowned, winnerId: null, bid: 0 }];
  return { gameId: 'pokemon-team-auction', phase, lotNumber: phase === 'ROUND_ACTIVE' ? 3 : 2, totalLots: 12, currentPokemon: phase === 'ROUND_ACTIVE' ? current : null, currentBid: phase === 'ROUND_ACTIVE' ? 4 : null, minimumBid: phase === 'ROUND_ACTIVE' ? 5 : 1, currentBidderId: phase === 'ROUND_ACTIVE' ? 'p2' : null, currentTurnPlayerId: phase === 'ROUND_ACTIVE' ? 'p1' : null, turnOrder: ['p1', 'p2'], passedPlayerIds: [], bidHistory: [{ lotNumber: 3, playerId: 'p2', type: 'BID', amount: 4 }], lotHistory, participants, scores: { p1: 534, p2: 0 }, results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 534, won: true, stats: { lotsWon: 1, pokemonWon: 1, bstTotal: 534, coinsRemaining: 14, legendaryCount: 0, mythicalCount: 0, unownedLots: 1 } }, { playerId: 'p2', position: 2, points: 0, won: false, stats: { lotsWon: 0, pokemonWon: 0, bstTotal: 0, coinsRemaining: 20, legendaryCount: 0, mythicalCount: 0, unownedLots: 1 } }] } : null };
}

function room(game: PokemonTeamAuctionPublicState, player: PokemonTeamAuctionPlayerState): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'pokemon-team-auction', name: 'Pokémon Team Auction', icon: '💰', description: 'Subasta', minPlayers: 2, profileStats: { metrics: [] } }], selectedGameId: 'pokemon-team-auction', selectedGameConfig: defaultPokemonTeamAuctionConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members: [{ id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 534 }, { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 }] };
}

const player: PokemonTeamAuctionPlayerState = { role: 'PLAYER', canRaise: true, canPass: true, minimumBid: 5, coins: 20, team: [won] };

describe('Pokémon Team Auction client', () => {
  it('renders visible current bids, all team balances and ascending controls', () => {
    const markup = renderToStaticMarkup(createElement(PokemonTeamAuctionGame, { room: room(publicGame(), player), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('Subasta ascendente visible'); expect(markup).toContain('Puja actual'); expect(markup).toContain('pikachu');
    expect(markup).toContain('14'); expect(markup).toContain('20'); expect(markup).toContain('Equipo 1/6'); expect(markup).toContain('Pujar'); expect(markup).toContain('Pasar este Pokémon');
  });

  it('shows unowned lots in the public history and results', () => {
    const game = publicGame('GAME_RESULTS'); const markup = renderToStaticMarkup(createElement(PokemonTeamAuctionResults, { room: room(game, { role: 'SPECTATOR', canRaise: false, canPass: false, minimumBid: 1, coins: 0, team: [] }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Pokémon sin dueño'); expect(markup).toContain('mewtwo'); expect(markup).toContain('BST 534'); expect(markup).toContain('Continuar sesión');
  });

  it('supports spectators and exposes the configured budget, generations and forms toggle', () => {
    const spectator = renderToStaticMarkup(createElement(PokemonTeamAuctionGame, { room: room(publicGame(), { role: 'SPECTATOR', canRaise: false, canPass: false, minimumBid: 1, coins: 0, team: [] }), selfId: 'watcher', onAction: async () => undefined }));
    expect(spectator).toContain('Estás observando'); expect(spectator).not.toContain('Pasar este Pokémon');
    const config = renderToStaticMarkup(createElement(PokemonTeamAuctionConfigPanel, { config: defaultPokemonTeamAuctionConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Presupuesto inicial por jugador'); expect(config).toContain('Incluir formas alternativas'); expect(config).toContain('Generaciones disponibles'); expect(config).toContain('20');
  });
});
