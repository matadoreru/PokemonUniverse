import type { PokemonTeamAuctionPublicState, TeamAuctionPokemon } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { bidBlock } from '../../room/auction-kit';
import { teamAnnouncement, teamBlockInput, teamHeading, teamPrevious, teamStatsLine, teamStatus, teamTimerLabel, teamTurnOrder } from './presentation';

const mon = (id: string, bst = 300): TeamAuctionPokemon => ({ id, name: id, sprite: `/${id}.png`, baseStatTotal: bst, legendaryStatus: 'NORMAL' });
const names: Record<string, string> = { p1: 'Eru', p2: 'Ana', p3: 'Leo' };
const nameOf = (id: string) => names[id] ?? 'Entrenador';

function game(over: Partial<PokemonTeamAuctionPublicState> = {}): PokemonTeamAuctionPublicState {
  return {
    gameId: 'pokemon-team-auction', phase: 'ROUND_ACTIVE', lotNumber: 2, totalLots: 6, currentPokemon: { id: 'pikachu', name: 'pikachu', sprite: '/pikachu.png', legendaryStatus: 'NORMAL' }, currentBid: null, minimumBid: 1,
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
    expect(teamPrevious(fresh, nameOf)).toEqual({ kicker: 'Lote 1', item: 'charizard', winner: 'Ana', detail: '2 monedas', sprite: '/charizard.png' });
  });

  it('con pujas: el último evento; sin dueño: la línea del lote anterior lo dice', () => {
    const bidding = game({ currentBid: 1, currentBidderId: 'p1', minimumBid: 2, currentTurnPlayerId: 'p3', bidHistory: [{ lotNumber: 2, playerId: 'p1', type: 'BID', amount: 1 }] });
    expect(teamAnnouncement(bidding, 'p1', nameOf)).toBe('Tú pujas 1 moneda por pikachu. Turno de Leo.');
    expect(teamAnnouncement(bidding, 'p3', nameOf)).toBe('Eru puja 1 moneda por pikachu. Es tu turno.');
    expect(teamPrevious({ ...bidding, lotHistory: [{ lotNumber: 1, pokemon: mon('mewtwo'), winnerId: null, bid: 0 }] }, nameOf)).toEqual({ kicker: 'Lote 1', item: 'mewtwo', winner: null, detail: 'sin dueño', sprite: '/mewtwo.png' });
    expect(teamPrevious(game({ lotHistory: [] }), nameOf)).toBeNull();
  });

  it('estado de cada jugador y el bloqueo propio', () => {
    const bidding = game({ currentBid: 1, currentBidderId: 'p1', minimumBid: 2, currentTurnPlayerId: 'p3' });
    expect(teamStatus(bidding, 'p1')).toBe('leading');
    expect(teamStatus(bidding, 'p2')).toBe('noBudget');
    // El turno no se repite en la franja lateral: vive en el reloj y en el orden de turno.
    expect(teamStatus(bidding, 'p3')).toBe('bidding');
    expect(teamStatus(game({ phase: 'GAME_RESULTS', currentPokemon: null }), 'p1')).toBe('closed');
    const input = teamBlockInput(bidding, { role: 'PLAYER', canRaise: false, canPass: false, minimumBid: 2, coins: 1, team: [] }, 'p1', nameOf);
    expect(input).toMatchObject({ participating: true, leading: true, min: 2, max: 1, turnName: 'Leo' });
    expect(teamBlockInput(bidding, null, 'x', nameOf)).toMatchObject({ participating: false, max: 0 });
  });

  it('el título es el lote; el turno va en la etiqueta del reloj', () => {
    expect(teamHeading(game())).toBe('Lote 2 de 6 · pikachu');
    expect(teamHeading(game({ phase: 'GAME_RESULTS', currentPokemon: null }))).toBe('Subasta cerrada');
    expect(teamTimerLabel(game(), 'p1', nameOf)).toBe('Tu turno');
    expect(teamTimerLabel(game(), 'p2', nameOf)).toBe('Turno de Eru');
    expect(teamTimerLabel(game({ currentTurnPlayerId: null }), 'p2', nameOf)).toBe('Turno de puja');
  });

  it('orden de turno del lote: el turno, quien va ganando y quien pasó', () => {
    const bidding = game({ currentBid: 1, currentBidderId: 'p1', minimumBid: 2, currentTurnPlayerId: 'p3', passedPlayerIds: ['p2'] });
    expect(teamTurnOrder(bidding, 'p1', nameOf).map(({ name, state, self }) => [name, state, self])).toEqual([['Eru', 'leading', true], ['Ana', 'passed', false], ['Leo', 'turn', false]]);
  });

  it('cuando no es tu turno, un mensaje claro: a quién le toca y cómo va la puja', () => {
    const player = { role: 'PLAYER' as const, canRaise: false, canPass: false, minimumBid: 4, coins: 10, team: [] };
    const leading = game({ currentBid: 3, currentBidderId: 'p1', minimumBid: 4, currentTurnPlayerId: 'p3' });
    expect(bidBlock(teamBlockInput(leading, player, 'p1', nameOf))).toMatchObject({ reason: 'leading', title: 'Le toca a Leo', text: 'Tú vas ganando con 3 monedas.' });
    const other = game({ currentBid: 3, currentBidderId: 'p2', minimumBid: 4, currentTurnPlayerId: 'p3' });
    expect(bidBlock(teamBlockInput(other, player, 'p1', nameOf))).toMatchObject({ reason: 'waiting', title: 'Le toca a Leo', text: 'Puja actual: 3 de Ana.' });
    expect(bidBlock(teamBlockInput(game({ currentTurnPlayerId: 'p3' }), player, 'p1', nameOf))).toMatchObject({ reason: 'waiting', title: 'Le toca a Leo', text: 'Aún no hay pujas en este lote.' });
    expect(bidBlock(teamBlockInput({ ...other, passedPlayerIds: ['p1'] }, player, 'p1', nameOf))).toMatchObject({ reason: 'passed', title: 'Has pasado', text: 'Le toca a Leo. Vuelves a pujar en el siguiente lote.' });
    // En tu turno, el texto de siempre.
    expect(bidBlock(teamBlockInput(other, { ...player, canRaise: true, canPass: true }, 'p3', nameOf))).toMatchObject({ reason: 'open', title: 'Tu turno' });
  });

  it('línea de métricas de los resultados', () => {
    expect(teamStatsLine({ bstTotal: 534, pokemonWon: 1, legendaryCount: 1, mythicalCount: 0, coinsRemaining: 1, lotsWon: 1 })).toBe('BST 534 · 1 Pokémon · 1 legendario · 0 míticos · 1 moneda · 1 lote ganado');
    expect(teamStatsLine({})).toBe('BST 0 · 0 Pokémon · 0 legendarios · 0 míticos · 0 monedas · 0 lotes ganados');
  });
});
