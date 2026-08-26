import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultPokemonTeamAuctionConfig, pokemonTeamAuctionConfigSchema } from './config.js';
import { buildTeamAuctionResults } from './rules.js';
import { pokemonTeamAuctionGame } from './server.js';
import type { PokemonTeamAuctionState, TeamAuctionPokemon } from './types.js';

function mon(id: string, dex: number, bst: number, legendaryStatus: Pokemon['legendaryStatus'] = 'NORMAL', isDefault = true): Pokemon {
  return { id, nationalDexNumber: dex, name: id, generation: 1, isDefault, sprite: `/${id}.png`, hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50, baseStatTotal: bst, types: ['normal'], legendaryStatus };
}

const entries = [
  ...Array.from({ length: 12 }, (_, index) => mon(`pokemon-${index + 1}`, index + 1, 300 + index * 10)),
  mon('pokemon-form', 1, 999, 'LEGENDARY', false),
];
const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((pokemon) => pokemon.id === id),
  byDexNumber: (number) => entries.find((pokemon) => pokemon.nationalDexNumber === number),
  forGenerations: (generations, options) => entries.filter((pokemon) => generations.includes(pokemon.generation) && (options?.includeForms || pokemon.isDefault !== false)),
};

function setup(overrides: Partial<typeof defaultPokemonTeamAuctionConfig> = {}, count = 2) {
  const players = Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now: 1_000, random: () => 0 };
  const config = { ...defaultPokemonTeamAuctionConfig, generations: [1], ...overrides };
  let state = pokemonTeamAuctionGame.createInitialState(config, context);
  state = pokemonTeamAuctionGame.start(state, context);
  return { context, state };
}

function action(state: PokemonTeamAuctionState, playerId: string, payload: Parameters<typeof pokemonTeamAuctionGame.handleAction>[2], context: GameContext) {
  return pokemonTeamAuctionGame.handleAction(state, playerId, payload, context);
}

describe('Pokémon Team Auction rules', () => {
  it('validates budget and forms settings and creates exactly six lots per player', () => {
    expect(pokemonTeamAuctionConfigSchema.safeParse({ ...defaultPokemonTeamAuctionConfig, initialBudget: 40, includeForms: false }).success).toBe(true);
    const fixture = setup({ includeForms: true });
    expect(fixture.state.lots).toHaveLength(12);
    expect(new Set(fixture.state.lots.map((lot) => lot.id)).size).toBe(12);
    expect(fixture.state.lots.some((lot) => lot.id === 'pokemon-form')).toBe(true);
  });

  it('runs a visible ascending auction, permits jumps, and settles to the highest bidder', () => {
    const fixture = setup();
    expect(fixture.state.currentBid).toBeNull();
    const first = fixture.state.turnOrder[fixture.state.turnIndex]!;
    let result = action(fixture.state, first, { type: 'RAISE_BID', amount: 1 }, fixture.context);
    expect(result.accepted).toBe(true); expect(result.state.currentBid).toBe(1); expect(result.state.currentBidderId).toBe(first);
    const second = result.state.turnOrder[result.state.turnIndex]!;
    result = action(result.state, second, { type: 'RAISE_BID', amount: 7 }, fixture.context);
    expect(result.accepted).toBe(true); expect(result.state.currentBid).toBe(7); expect(result.state.currentBidderId).toBe(second);
    result = action(result.state, first, { type: 'PASS_BID' }, fixture.context);
    expect(result.state.lotHistory[0]).toMatchObject({ winnerId: second, bid: 7 });
    expect(result.state.participants[second]!.coins).toBe(13); expect(result.state.participants[second]!.team).toHaveLength(1);
  });

  it('rejects non-turn, non-increasing and unaffordable bids while making passing local to one lot', () => {
    const fixture = setup({ initialBudget: 4 }); const first = fixture.state.turnOrder[0]!; const second = fixture.state.turnOrder[1]!;
    expect(action(fixture.state, second, { type: 'RAISE_BID', amount: 1 }, fixture.context).accepted).toBe(false);
    let result = action(fixture.state, first, { type: 'RAISE_BID', amount: 2 }, fixture.context); expect(result.accepted).toBe(true);
    expect(action(result.state, second, { type: 'RAISE_BID', amount: 2 }, fixture.context).accepted).toBe(false);
    result = action(result.state, second, { type: 'PASS_BID' }, fixture.context); expect(result.state.lotHistory[0]).toMatchObject({ winnerId: first, bid: 2 });
    expect(result.state.turnOrder[result.state.turnIndex]).not.toBeNull();
  });

  it('auto-passes players without enough coins and records unowned lots before ending', () => {
    const fixture = setup({ initialBudget: 1 });
    let state = fixture.state;
    const first = state.turnOrder[state.turnIndex]!;
    state = action(state, first, { type: 'RAISE_BID', amount: 1 }, fixture.context).state;
    expect(state.lotHistory[0]).toMatchObject({ winnerId: first, bid: 1 });
    expect(state.participants[first]!.coins).toBe(0);
    while (state.phase !== 'GAME_RESULTS') {
      const currentPlayer = state.turnOrder[state.turnIndex]!;
      state = action(state, currentPlayer, { type: 'PASS_BID' }, fixture.context).state;
    }
    expect(state.lotHistory.filter((lot) => lot.winnerId === null).length).toBeGreaterThan(0);
    expect(state.participants[first]!.team.length).toBeLessThan(6);
    expect(pokemonTeamAuctionGame.getPublicState(state, fixture.context).lotHistory.some((lot) => lot.winnerId === null)).toBe(true);
  });

  it('keeps teams, money, current bid and bid history public during play', () => {
    const fixture = setup();
    const publicState = pokemonTeamAuctionGame.getPublicState(fixture.state, fixture.context);
    expect(publicState.participants[fixture.state.playerIds[0]!]).toMatchObject({ coins: 20, team: [] });
    expect(publicState.currentPokemon).toBeTruthy(); expect(publicState.minimumBid).toBe(1); expect(publicState.bidHistory).toEqual([]);
    expect(pokemonTeamAuctionGame.getPlayerState(fixture.state, fixture.state.playerIds[0]!, fixture.context)).toMatchObject({ role: 'PLAYER', coins: 20, team: [] });
  });

  it('applies BST, then remaining coins, legendary count and mythical count as tie-breakers', () => {
    const pokemon = (id: string, bst: number, status: TeamAuctionPokemon['legendaryStatus'] = 'NORMAL'): TeamAuctionPokemon => ({ id, name: id, sprite: `/${id}.png`, baseStatTotal: bst, legendaryStatus: status });
    const makeParticipant = (playerId: string, coins: number, team: TeamAuctionPokemon[]) => ({ playerId, coins, team });
    const state = { phase: 'GAME_RESULTS', playerIds: ['p1', 'p2', 'p3'], participants: {
      p1: makeParticipant('p1', 4, [pokemon('a', 500)]), p2: makeParticipant('p2', 8, [pokemon('b', 500)]), p3: makeParticipant('p3', 8, [pokemon('c', 500, 'LEGENDARY')]),
    }, lotHistory: [], playerStats: {}, scores: {}, config: defaultPokemonTeamAuctionConfig, lots: [], currentLotIndex: 0, currentBid: null, currentBidderId: null, turnOrder: [], turnIndex: 0, passedPlayerIds: [], bidHistory: [], results: null,
    } as unknown as PokemonTeamAuctionState;
    const results = buildTeamAuctionResults(state);
    expect(results.standings.map((entry) => entry.playerId)).toEqual(['p3', 'p2', 'p1']);
    expect(results.standings[0]!.won).toBe(true);
    const tied = buildTeamAuctionResults({ ...state, participants: { ...state.participants, p2: makeParticipant('p2', 8, [pokemon('b', 500, 'LEGENDARY')]) } });
    expect(tied.winnerId).toBeNull(); expect(tied.standings.filter((entry) => entry.position === 1)).toHaveLength(2);
  });
});
