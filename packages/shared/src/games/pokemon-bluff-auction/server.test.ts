import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { pokemonMatchesBluffAuctionCondition } from './conditions.js';
import { defaultPokemonBluffAuctionConfig } from './config.js';
import { BLUFF_BIDDER_SUCCESS_POINTS, BLUFF_OTHERS_SUCCESS_POINTS } from './rules.js';
import { BLUFF_RESULT_REVEAL_MS, BLUFF_SECONDS_PER_CORRECT_ATTEMPT, BLUFF_SECONDS_PER_INCORRECT_ATTEMPT, pokemonBluffAuctionGame } from './server.js';
import type { PokemonBluffAuctionState } from './types.js';

const pokemon: Pokemon[] = [
  mon('charizard', 6, 1, ['fire', 'flying'], 534, 100, 84, 'blaze'),
  mon('arcanine', 59, 1, ['fire'], 555, 95, 110, 'intimidate'),
  mon('magmar', 126, 1, ['fire'], 495, 93, 95, 'flame-body'),
  mon('entei', 244, 2, ['fire'], 580, 100, 115, 'pressure', 'LEGENDARY'),
  mon('blastoise', 9, 1, ['water'], 530, 78, 83, 'torrent'),
  mon('lapras', 131, 1, ['water', 'ice'], 535, 60, 85, 'water-absorb'),
  mon('gyarados', 130, 1, ['water', 'flying'], 540, 81, 125, 'intimidate'),
  mon('suicune', 245, 2, ['water'], 580, 85, 75, 'pressure', 'LEGENDARY'),
  mon('venusaur', 3, 1, ['grass', 'poison'], 525, 80, 82, 'overgrow'),
  mon('meganium', 154, 2, ['grass'], 525, 80, 82, 'overgrow'),
  mon('sceptile', 254, 3, ['grass'], 530, 120, 85, 'overgrow'),
  mon('celebi', 251, 2, ['psychic', 'grass'], 600, 100, 100, 'natural-cure', 'MYTHICAL'),
  { ...mon('raichu-alola', 26, 1, ['electric', 'psychic'], 485, 110, 85, 'surge-surfer'), isDefault: false },
];

function mon(id: string, dex: number, generation: number, types: Pokemon['types'], bst: number, speed: number, attack: number, ability: string, legendaryStatus: Pokemon['legendaryStatus'] = 'NORMAL'): Pokemon {
  return {
    id, name: id.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' '), nationalDexNumber: dex,
    generation, isDefault: true, sprite: `/${id}.png`, hp: 80, attack, defense: 80, specialAttack: 90,
    specialDefense: 80, speed, baseStatTotal: bst, heightDecimeters: 18, weightHectograms: 900,
    evolutionStage: 3, evolutionStageCount: 3, legendaryStatus, abilities: [ability], types,
  };
}

const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number && entry.isDefault !== false),
  forGenerations: (generations, options) => pokemon.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)),
};

function setup(overrides: Partial<typeof defaultPokemonBluffAuctionConfig> = {}) {
  const context: GameContext = {
    players: ['p1', 'p2', 'p3'].map((id) => ({ id, displayName: id.toUpperCase(), connected: true, active: true })),
    pokemon: catalog, now: 1_000, random: () => 0,
  };
  const config = { ...defaultPokemonBluffAuctionConfig, generations: [1, 2, 3], rounds: 5, ...overrides };
  let state = pokemonBluffAuctionGame.createInitialState(config, context);
  state = pokemonBluffAuctionGame.start(state, context);
  return { state, context, setNow(now: number) { context.now = now; } };
}

function forceCondition(state: PokemonBluffAuctionState, ids: string[], description = 'BST > 500'): PokemonBluffAuctionState {
  return { ...state, condition: { key: 'forced', conditions: [{ kind: 'STAT', stat: 'baseStatTotal', operator: 'GT', value: 500 }], description, clauses: [description] }, validPokemonIds: ids };
}

function act(state: PokemonBluffAuctionState, playerId: string, action: Parameters<typeof pokemonBluffAuctionGame.handleAction>[2], context: GameContext) {
  return pokemonBluffAuctionGame.handleAction(state, playerId, action, context);
}

function reachDemonstration(state: PokemonBluffAuctionState, context: GameContext, bid = 2): PokemonBluffAuctionState {
  const first = state.bidOrder[0]!; const second = state.bidOrder[1]!; const third = state.bidOrder[2]!;
  let next = act(state, first, { type: 'RAISE_BID', amount: bid }, context).state;
  next = act(next, second, { type: 'PASS_BID' }, context).state;
  next = act(next, third, { type: 'PASS_BID' }, context).state;
  return next;
}

describe('Pokémon Bluff Auction', () => {
  it('starts bidding at one and only accepts strictly higher in-pool bids', () => {
    const fixture = setup(); let state = fixture.state; const first = state.bidOrder[0]!;
    expect(pokemonBluffAuctionGame.getPublicState(state, fixture.context)).toMatchObject({ currentBid: null, minimumBid: 1, maxBid: 12 });
    const result = act(state, first, { type: 'RAISE_BID', amount: 1 }, fixture.context); expect(result.accepted).toBe(true); state = result.state;
    const second = state.bidOrder[state.turnIndex]!;
    expect(act(state, second, { type: 'RAISE_BID', amount: 1 }, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/mínima es 2/) });
    expect(act(state, second, { type: 'RAISE_BID', amount: 13 }, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/máxima/) });
    expect(act(state, second, { type: 'RAISE_BID', amount: 2 }, fixture.context).accepted).toBe(true);
  });

  it('removes a player after passing and starts demonstration automatically when one remains', () => {
    const fixture = setup(); const state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine']), fixture.context, 2);
    expect(state.phase).toBe('POKEMON_SEARCH'); expect(state.bidderId).toBe(fixture.state.bidOrder[0]); expect(state.targetBid).toBe(2);
    expect(state.passedPlayerIds).toEqual(expect.arrayContaining([fixture.state.bidOrder[1], fixture.state.bidOrder[2]]));
    expect(state.playerStats[state.bidderId!]).toMatchObject({ bidderRounds: 1, highestAttemptedBid: 2 });
    expect(() => pokemonBluffAuctionGame.actionSchema.parse({ type: 'CHALLENGE' })).toThrow();
  });

  it('assigns the minimum bid of one when everyone else passes before any bid', () => {
    const fixture = setup(); let state = fixture.state;
    state = act(state, state.bidOrder[0]!, { type: 'PASS_BID' }, fixture.context).state;
    state = act(state, state.bidOrder[state.turnIndex]!, { type: 'PASS_BID' }, fixture.context).state;
    expect(state.phase).toBe('POKEMON_SEARCH'); expect(state.targetBid).toBe(1);
  });

  it('adds five seconds for a correct answer and removes three for an incorrect answer', () => {
    const fixture = setup({ demonstrationSeconds: 30 }); let state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine']), fixture.context, 2);
    expect(state.roundEndsAt).toBe(31_000);
    state = act(state, state.bidderId!, { type: 'SUBMIT_POKEMON', pokemonId: 'charizard' }, fixture.context).state;
    expect(state.roundEndsAt).toBe(31_000 + BLUFF_SECONDS_PER_CORRECT_ATTEMPT * 1_000); expect(state.correctCount).toBe(1);
    state = act(state, state.bidderId!, { type: 'SUBMIT_POKEMON', pokemonId: 'venusaur' }, fixture.context).state;
    expect(state.phase).toBe('POKEMON_SEARCH'); expect(state.roundEndsAt).toBe(36_000 - BLUFF_SECONDS_PER_INCORRECT_ATTEMPT * 1_000); expect(state.incorrectCount).toBe(1);
  });

  it('ends the round immediately when an incorrect answer consumes the remaining time', () => {
    const fixture = setup({ demonstrationSeconds: 20 }); let state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine']), fixture.context, 2);
    fixture.setNow(state.roundEndsAt! - 2_000);
    state = act(state, state.bidderId!, { type: 'SUBMIT_POKEMON', pokemonId: 'venusaur' }, fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound).toMatchObject({ success: false, reason: 'TIMEOUT', incorrectCount: 1 });
  });

  it('publishes incorrect attempts without eliminating the bidder and rejects duplicate credit without extending time', () => {
    const fixture = setup(); let state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine']), fixture.context, 2);
    state = act(state, state.bidderId!, { type: 'SUBMIT_POKEMON', pokemonId: 'venusaur' }, fixture.context).state;
    expect(state.phase).toBe('POKEMON_SEARCH'); expect(state.attempts[0]).toMatchObject({ pokemon: { id: 'venusaur' }, result: 'INCORRECT' });
    const deadline = state.roundEndsAt;
    state = act(state, state.bidderId!, { type: 'SUBMIT_POKEMON', pokemonId: 'venusaur' }, fixture.context).state;
    expect(state.attempts[1]?.result).toBe('DUPLICATE'); expect(state.incorrectCount).toBe(1); expect(state.correctCount).toBe(0); expect(state.roundEndsAt).toBe(deadline);
  });

  it('awards only the bidder on success and records the completed wager', () => {
    const fixture = setup(); let state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine']), fixture.context, 2); const bidder = state.bidderId!;
    state = act(state, bidder, { type: 'SUBMIT_POKEMON', pokemonId: 'charizard' }, fixture.context).state;
    state = act(state, bidder, { type: 'SUBMIT_POKEMON', pokemonId: 'arcanine' }, fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound).toMatchObject({ success: true, reason: 'COMPLETED', correctCount: 2, bid: 2, validPokemonCount: null });
    expect(state.scores[bidder]).toBe(BLUFF_BIDDER_SUCCESS_POINTS);
    for (const id of state.playerIds.filter((id) => id !== bidder)) expect(state.scores[id]).toBe(0);
    expect(state.playerStats[bidder]).toMatchObject({ roundsWon: 1, completedBids: 1, failedBids: 0, highestCompletedBid: 2, correctPokemon: 2 });
  });

  it('times out without negative points and awards every other player', () => {
    const fixture = setup(); let state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine']), fixture.context, 2); const bidder = state.bidderId!;
    fixture.setNow(state.roundEndsAt!); state = pokemonBluffAuctionGame.handleTimeout(state, fixture.context);
    expect(state.lastRound).toMatchObject({ success: false, reason: 'TIMEOUT' }); expect(state.scores[bidder]).toBe(0);
    for (const id of state.playerIds.filter((id) => id !== bidder)) expect(state.scores[id]).toBe(BLUFF_OTHERS_SUCCESS_POINTS);
    expect(state.playerStats[bidder]).toMatchObject({ failedBids: 1 });
  });

  it('reveals and loses an impossible bid only after the auction resolves', () => {
    const fixture = setup(); const secretState = forceCondition(fixture.state, ['charizard']);
    const auctionJson = JSON.stringify(pokemonBluffAuctionGame.getPublicState(secretState, fixture.context));
    expect(auctionJson).not.toContain('validPokemon'); expect(auctionJson).not.toContain('charizard');
    const state = reachDemonstration(secretState, fixture.context, 2);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound).toMatchObject({ reason: 'IMPOSSIBLE', bid: 2, validPokemonCount: 1 });
    expect(state.playerStats[state.bidderId!]).toMatchObject({ impossibleBids: 1, failedBids: 1 });
  });

  it('never serializes the valid ids or real solution count during demonstration', () => {
    const fixture = setup(); const state = reachDemonstration(forceCondition(fixture.state, ['charizard', 'arcanine', 'blastoise']), fixture.context, 2);
    const json = JSON.stringify(pokemonBluffAuctionGame.getPublicState(state, fixture.context));
    expect(json).not.toContain('validPokemon'); expect(json).not.toContain('charizard'); expect(json).not.toContain('blastoise');
  });

  it('validates objective simple and combined conditions with shared Bingo rules', () => {
    expect(pokemonMatchesBluffAuctionCondition(pokemon[0]!, { conditions: [{ kind: 'STAT', stat: 'baseStatTotal', operator: 'GT', value: 500 }] })).toBe(true);
    expect(pokemonMatchesBluffAuctionCondition(pokemon[0]!, { conditions: [{ kind: 'TYPE', pokemonType: 'water' }] })).toBe(false);
    expect(pokemonMatchesBluffAuctionCondition(pokemon[6]!, { conditions: [{ kind: 'ABILITY', ability: 'intimidate' }] })).toBe(true);
    const combined = { conditions: [{ kind: 'TYPE', pokemonType: 'water' }, { kind: 'STAT', stat: 'baseStatTotal', operator: 'GT', value: 500 }] } as const;
    expect(pokemonMatchesBluffAuctionCondition(pokemon[4]!, combined)).toBe(true); expect(pokemonMatchesBluffAuctionCondition(pokemon[8]!, combined)).toBe(false);
    const fixture = setup(); expect(fixture.state.conditionTemplates.some((template) => template.conditions.length === 2)).toBe(true);
    expect(fixture.state.conditionTemplates.every((template) => template.candidatePokemonIds.length >= 3 && template.candidatePokemonIds.length <= 5)).toBe(true);
  });

  it('uses only configured generations and excludes every non-default form', () => {
    const fixture = setup({ generations: [1] });
    expect(fixture.state.poolIds).not.toContain('suicune'); expect(fixture.state.poolIds).not.toContain('raichu-alola');
    expect(fixture.state.poolIds).toContain('charizard'); expect(new Set(fixture.state.poolIds).size).toBe(fixture.state.poolIds.length);
  });

  it('passes a disconnected auction turn, preserves temporary bidder state, and fails only after definitive departure', () => {
    const fixture = setup(); const current = fixture.state.bidOrder[0]!; fixture.context.players.find((player) => player.id === current)!.connected = false;
    let state = pokemonBluffAuctionGame.handlePresenceChange!(fixture.state, fixture.context);
    expect(state.passedPlayerIds).toContain(current); expect(state.bidHistory[0]).toEqual({ playerId: current, type: 'PASS' });
    state = reachDemonstration(forceCondition({ ...fixture.state, bidOrder: ['p1', 'p2', 'p3'] }, ['charizard', 'arcanine']), fixture.context, 2);
    const bidder = state.bidderId!; const bidderContext = fixture.context.players.find((player) => player.id === bidder)!;
    bidderContext.connected = false; expect(pokemonBluffAuctionGame.handlePresenceChange!(state, fixture.context)).toBe(state);
    bidderContext.connected = true; expect(pokemonBluffAuctionGame.getPlayerState(state, bidder, fixture.context)).toMatchObject({ canSubmitPokemon: true });
    bidderContext.connected = false; bidderContext.active = false; state = pokemonBluffAuctionGame.handlePresenceChange!(state, fixture.context);
    expect(state.lastRound).toMatchObject({ reason: 'BIDDER_LEFT', success: false });
  });

  it('advances through configured rounds, avoids exact repeats when possible and exposes generic stats', () => {
    const fixture = setup({ rounds: 5 }); let state = fixture.state; const keys: string[] = [];
    for (let round = 0; round < 5; round += 1) {
      keys.push(state.condition!.key); state = reachDemonstration(forceCondition(state, ['charizard']), fixture.context, 2);
      fixture.setNow(state.nextTransitionAt!); state = pokemonBluffAuctionGame.handleTimeout(state, fixture.context);
    }
    expect(new Set(keys).size).toBe(keys.length); expect(state.phase).toBe('GAME_RESULTS'); expect(fixture.context.now).toBeGreaterThanOrEqual(1_000 + BLUFF_RESULT_REVEAL_MS);
    const results = pokemonBluffAuctionGame.getResults(state); expect(results.standings).toHaveLength(3);
    expect(results.standings[0]?.stats).toEqual(expect.objectContaining({
      roundsWon: expect.any(Number), bidderRounds: expect.any(Number), completedBids: expect.any(Number), failedBids: expect.any(Number),
      correctPokemon: expect.any(Number), incorrectPokemon: expect.any(Number), highestCompletedBid: expect.any(Number),
      highestAttemptedBid: expect.any(Number), impossibleBids: expect.any(Number),
    }));
  });
});
