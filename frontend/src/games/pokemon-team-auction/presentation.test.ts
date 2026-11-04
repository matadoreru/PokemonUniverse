import type { PokemonTeamAuctionPublicState, TeamAuctionPokemon } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { teamAnnouncement, teamAward, teamBlockInput, teamHeading, teamStatsLine, teamStatus } from './presentation';

const mon = (id: string, bst = 300): TeamAuctionPokemon => ({ id, name: id, sprite: `/${id}.png`, baseStatTotal: bst, legendaryStatus: 'NORMAL' });
const names: Record<string, string> = { p1: 'Eru', p2: 'Ana', p3: 'Leo' };
const nameOf = (id: string) => names[id] ?? 'Entrenador';

function game(over: Partial<PokemonTeamAuctionPublicState> = {}): PokemonTeamAuctionPublicState {
  return {
    gameId: 'pokemon-team-auction', phase: 'ROUND_ACTIVE', lotNumber: 2, totalLots: 6, currentPokemon: mon('pikachu'), currentBid: null, minimumBid: 1,
    currentBidderId: null, currentTurnPlayerId: 'p1', turnOrder: ['p1', 'p2', 'p3'], passedPlayerIds: [], bidHistory: [{ lotNumber: 1, playerId: 'p2', type: 'BID', amount: 2 }],
    lotHistory: [{ lotNumber: 1, pokemon: mon('charizard', 534), winnerId: 'p2', bid: 2 }],
    participants: { p1: { playerId: 'p1', coins: 2, team: [] }, p2: { playerId: 'p2', coins: 0, team: [mon('charizard', 534)] }, p3: { playerId: 'p3', coins: 2, team: [] } },
    scores: {}, results: null, ...over,
  };
}

describe('Team Auction: textos', () => {
  it('lote nuevo: la adjudicación del anterior, el lote y el turno (los pases automáticos no la tapan)', () => {
    const fresh = game({ passedPlayerIds: ['p2'], bidHistory: [...game().bidHistory, { lotNumber: 2, playerId: 'p2', type: 'PASS' }] });
    expect(teamAnnouncement(fresh, 'p1', nameOf)).toBe('Lote 1: charizard para Ana por 2 monedas. Lote 2 de 6: pikachu. Es tu turno.');
    expect(teamAward(fresh, nameOf)).toMatchObject({ tone: 'won', kicker: 'Lote 1 adjudicado', title: 'charizard para Ana', detail: 'por 2 monedas', fresh: true });
  });

  it('con pujas: el último evento; sin dueño: la banda lo dice', () => {
    const bidding = game({ currentBid: 1, currentBidderId: 'p1', minimumBid: 2, currentTurnPlayerId: 'p3', bidHistory: [{ lotNumber: 2, playerId: 'p1', type: 'BID', amount: 1 }] });
    expect(teamAnnouncement(bidding, 'p1', nameOf)).toBe('Tú pujas 1 moneda por pikachu. Turno de Leo.');
    expect(teamAnnouncement(bidding, 'p3', nameOf)).toBe('Eru puja 1 moneda por pikachu. Es tu turno.');
    expect(teamAward({ ...bidding, lotHistory: [{ lotNumber: 1, pokemon: mon('mewtwo'), winnerId: null, bid: 0 }] }, nameOf)).toMatchObject({ tone: 'unsold', kicker: 'Lote 1 sin dueño', fresh: false });
    expect(teamAward(game({ lotHistory: [] }), nameOf)).toBeNull();
  });

  it('estado de cada jugador y el bloqueo propio', () => {
    const bidding = game({ currentBid: 1, currentBidderId: 'p1', minimumBid: 2, currentTurnPlayerId: 'p3' });
    expect(teamStatus(bidding, 'p1')).toBe('leading');
    expect(teamStatus(bidding, 'p2')).toBe('noBudget');
    expect(teamStatus(bidding, 'p3')).toBe('turn');
    expect(teamStatus(game({ phase: 'GAME_RESULTS', currentPokemon: null }), 'p1')).toBe('closed');
    expect(teamHeading(bidding, 'p3', nameOf)).toBe('Tu turno');
    expect(teamHeading(bidding, 'p1', nameOf)).toBe('Turno de Leo');
    const input = teamBlockInput(bidding, { role: 'PLAYER', canRaise: false, canPass: false, minimumBid: 2, coins: 1, team: [] }, 'p1', nameOf);
    expect(input).toMatchObject({ participating: true, leading: true, min: 2, max: 1, turnName: 'Leo' });
    expect(teamBlockInput(bidding, null, 'x', nameOf)).toMatchObject({ participating: false, max: 0 });
  });

  it('línea de métricas de los resultados', () => {
    expect(teamStatsLine({ bstTotal: 534, pokemonWon: 1, legendaryCount: 1, mythicalCount: 0, coinsRemaining: 1, lotsWon: 1 })).toBe('BST 534 · 1 Pokémon · 1 legendario · 0 míticos · 1 moneda · 1 lote ganado');
    expect(teamStatsLine({})).toBe('BST 0 · 0 Pokémon · 0 legendarios · 0 míticos · 0 monedas · 0 lotes ganados');
  });
});
