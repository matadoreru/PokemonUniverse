import { defaultPokemonTeamAuctionConfig, type PokemonTeamAuctionPlayerState, type PokemonTeamAuctionPublicState, type RoomView, type TeamAuctionPokemon } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonTeamAuctionConfigPanel } from '../games/pokemon-team-auction/ConfigPanel';
import { PokemonTeamAuctionGame } from './PokemonTeamAuctionGame';
import { PokemonTeamAuctionResults } from './PokemonTeamAuctionResults';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala); el `ConfigPanel` usa el selector de generaciones.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

const pokemon = (id: string, bst: number): TeamAuctionPokemon => ({ id, name: id, sprite: `/${id}.png`, baseStatTotal: bst, legendaryStatus: 'NORMAL' });
const current = pokemon('pikachu', 320); const won = pokemon('charizard', 534); const unowned = pokemon('mewtwo', 680);

function publicGame(phase: 'ROUND_ACTIVE' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): PokemonTeamAuctionPublicState {
  const participants = { p1: { playerId: 'p1', coins: 14, team: [won] }, p2: { playerId: 'p2', coins: 20, team: [] } };
  const lotHistory = [{ lotNumber: 1, pokemon: won, winnerId: 'p1', bid: 6 }, { lotNumber: 2, pokemon: unowned, winnerId: null, bid: 0 }];
  return { gameId: 'pokemon-team-auction', phase, lotNumber: phase === 'ROUND_ACTIVE' ? 3 : 2, totalLots: 12, currentPokemon: phase === 'ROUND_ACTIVE' ? current : null, currentBid: phase === 'ROUND_ACTIVE' ? 4 : null, minimumBid: phase === 'ROUND_ACTIVE' ? 5 : 1, currentBidderId: phase === 'ROUND_ACTIVE' ? 'p2' : null, currentTurnPlayerId: phase === 'ROUND_ACTIVE' ? 'p1' : null, turnOrder: ['p1', 'p2'], passedPlayerIds: [], bidHistory: [{ lotNumber: 3, playerId: 'p2', type: 'BID', amount: 4 }], lotHistory, participants, scores: { p1: 534, p2: 0 }, results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 534, won: true, stats: { lotsWon: 1, pokemonWon: 1, bstTotal: 534, coinsRemaining: 14, legendaryCount: 0, mythicalCount: 0, unownedLots: 1 } }, { playerId: 'p2', position: 2, points: 0, won: false, stats: { lotsWon: 0, pokemonWon: 0, bstTotal: 0, coinsRemaining: 20, legendaryCount: 0, mythicalCount: 0, unownedLots: 1 } }] } : null };
}

function room(game: PokemonTeamAuctionPublicState, player: PokemonTeamAuctionPlayerState): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'pokemon-team-auction', name: 'Pokémon Team Auction', icon: '💰', description: 'Subasta', minPlayers: 2, profileStats: { metrics: [] } }], selectedGameId: 'pokemon-team-auction', selectedGameConfig: defaultPokemonTeamAuctionConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-team-auction'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members: [{ id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 534 }, { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 }] };
}

const player: PokemonTeamAuctionPlayerState = { role: 'PLAYER', canRaise: true, canPass: true, minimumBid: 5, coins: 20, team: [won] };

const spectator: PokemonTeamAuctionPlayerState = { role: 'SPECTATOR', canRaise: false, canPass: false, minimumBid: 1, coins: 0, team: [] };
const play = (game: PokemonTeamAuctionPublicState, state: PokemonTeamAuctionPlayerState, selfId = 'p1') => renderToStaticMarkup(createElement(PokemonTeamAuctionGame, { room: room(game, state), selfId, onAction: async () => undefined }));
/** Texto visible más `alt`, `title` y `aria-label` (lo que un lector o la vista pueden sacar del DOM). */
const visible = (html: string) => [html.replace(/<[^>]+>/g, ' '), ...[...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1])].join(' ');

describe('Pokémon Team Auction client', () => {
  it('renders visible current bids, all team balances and ascending controls', () => {
    const markup = play(publicGame(), player);
    expect(markup).toContain('Subasta ascendente visible'); expect(markup).toContain('Puja actual'); expect(markup).toContain('pikachu');
    expect(markup).toContain('14'); expect(markup).toContain('20'); expect(markup).toContain('Equipo 1/6'); expect(markup).toContain('Pujar'); expect(markup).toContain('Pasar este Pokémon');
  });

  it('pinta con el kit de subasta: lote en carta, líder, presupuestos, historial, adjudicación y una sola región viva', () => {
    const markup = play(publicGame(), player);
    expect(markup).toContain('data-testid="auction-screen"');
    expect(markup.match(/aria-live/g)).toHaveLength(1);
    expect(markup).toContain('Lote 3 de 12');
    expect(markup).toContain('data-testid="auction-pokemon"');
    expect(markup).toContain('BST 320');
    // La puja actual (4) de Ana y la siguiente mínima (5).
    expect(markup).toMatch(/data-testid="auction-current-bid"><span[^>]*><strong>4<\/strong>/);
    expect(markup).toMatch(/data-testid="auction-leader">.*Ana/);
    expect(markup).toContain('5 monedas');
    // Turno propio: el título, los incrementos y «Pujar 5».
    expect(markup).toContain('>Tu turno</h1>');
    expect(markup).toContain('Pujar 5');
    expect(markup.match(/data-testid="budget-row"/g)).toHaveLength(2);
    expect(markup).toContain('Va ganando');
    expect(markup).toContain('Ver equipo de Ana');
    expect(markup).toContain('Ver tu equipo');
    // Historial: la puja de Ana en este lote y los lotes cerrados (2/12).
    expect(markup).toContain('Pujó 4 monedas');
    expect(markup).toContain('2/12');
    // La banda del último lote (sin dueño) y el anuncio.
    expect(markup).toContain('data-testid="auction-award"');
    expect(markup).toContain('Lote 2 sin dueño');
    expect(markup).toContain('Ana puja 4 monedas por pikachu. Es tu turno.');
  });

  it('bloquea con texto claro: va ganando, sin presupuesto y esperando', () => {
    const leading = play(publicGame(), { ...player, canRaise: false, canPass: false }, 'p2');
    expect(leading).toContain('Ya vas ganando');
    const poor = play(publicGame(), { ...player, coins: 3, canRaise: false, canPass: true });
    expect(poor).toContain('Sin presupuesto');
    expect(poor).not.toContain('NaN');
    const game = publicGame(); game.currentTurnPlayerId = 'p2'; game.currentBidderId = null; game.currentBid = null;
    const waiting = play(game, { ...player, canRaise: false, canPass: false });
    expect(waiting).toContain('Esperando tu turno');
    expect(waiting).toContain('Turno de Ana');
  });

  it('privacidad: la subasta es pública; quien observa ve lo mismo que los jugadores, sin controles', () => {
    const watching = visible(play(publicGame(), spectator, 'watcher'));
    for (const text of ['pikachu', 'Equipo 1/6', 'Pujó 4 monedas', 'Lote 2 sin dueño', 'Ver equipo de Eru', 'Ver equipo de Ana']) expect(watching).toContain(text);
    expect(watching).not.toContain('Pasar este Pokémon');
  });

  it('shows unowned lots in the public history and results', () => {
    const game = publicGame('GAME_RESULTS'); const markup = renderToStaticMarkup(createElement(PokemonTeamAuctionResults, { room: room(game, spectator), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Pokémon sin dueño'); expect(markup).toContain('mewtwo'); expect(markup).toContain('BST 534'); expect(markup).toContain('Continuar sesión');
    expect(markup).toContain('534 BST'); expect(markup).toContain('La mesa final');
    expect(markup).not.toMatch(/🏆|🥇|🥈|🥉/u);
  });

  it('shows every team before offering the final session ranking in mixed mode', () => {
    const finalRoom = room(publicGame('GAME_RESULTS'), spectator);
    finalRoom.sessionMode = { type: 'GAME_COUNT', target: 1 };
    finalRoom.gameSelectionMode = { type: 'RANDOM', gameIds: ['pokemon-team-auction', 'higher-lower'] };
    finalRoom.gamesPlayed = 1;
    finalRoom.sessionStandings = [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, sessionPoints: 534 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, sessionPoints: 0 },
    ];
    const markup = renderToStaticMarkup(createElement(PokemonTeamAuctionResults, { room: finalRoom, selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Eru'); expect(markup).toContain('Ana'); expect(markup).toContain('charizard'); expect(markup).toContain('0 Pokémon'); expect(markup).toContain('Ver clasificación final');
  });

  it('supports spectators and exposes the configured budget, generations and forms toggle', () => {
    const watching = play(publicGame(), spectator, 'watcher');
    expect(watching).toContain('Estás observando'); expect(watching).not.toContain('Pasar este Pokémon');
    const config = renderToStaticMarkup(createElement(PokemonTeamAuctionConfigPanel, { config: defaultPokemonTeamAuctionConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Presupuesto inicial por jugador'); expect(config).toContain('Incluir formas alternativas'); expect(config).toContain('Generaciones disponibles'); expect(config).toContain('20');
    expect(config).toContain('role="radiogroup"'); expect(config).toContain('role="switch"'); expect(config).toContain('Presupuesto personalizado'); expect(config).toContain('Tiempo por turno');
  });
});
