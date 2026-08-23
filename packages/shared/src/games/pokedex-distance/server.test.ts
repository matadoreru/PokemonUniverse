import { describe, expect, it } from 'vitest';
import type { GameContext, GamePlayer, Pokemon, PokemonCatalog, PokedexDistanceState } from '../../index.js';
import { defaultPokedexDistanceConfig, distanceBetween, farthestPlayerIds, pointsForPosition, pokedexDistanceGame } from '../../index.js';

const battleData = { hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50, baseStatTotal: 300, types: ['normal'] as Pokemon['types'] };

const pokemon: Pokemon[] = [
  { ...battleData, id: 'bulbasaur', nationalDexNumber: 1, name: 'Bulbasaur', generation: 1, sprite: '/1.png' },
  { ...battleData, id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: '/25.png' },
  { ...battleData, id: 'mew', nationalDexNumber: 151, name: 'Mew', generation: 1, sprite: '/151.png' },
  { ...battleData, id: 'chikorita', nationalDexNumber: 152, name: 'Chikorita', generation: 2, sprite: '/152.png' },
  { ...battleData, id: 'celebi', nationalDexNumber: 251, name: 'Celebi', generation: 2, sprite: '/251.png' },
  { ...battleData, id: 'treecko', nationalDexNumber: 252, name: 'Treecko', generation: 3, sprite: '/252.png' },
];

const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
};

const players = (count: number): GamePlayer[] => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}` }));

function setup(count = 3, random = 0): { state: PokedexDistanceState; context: GameContext; setNow: (now: number) => void } {
  let now = 1_000;
  const context: GameContext = { players: players(count), pokemon: catalog, get now() { return now; }, random: () => random };
  let state = pokedexDistanceGame.createInitialState({ ...defaultPokedexDistanceConfig, generations: [1, 2, 3] }, context);
  state = pokedexDistanceGame.start(state, context);
  return { state, context, setNow: (value) => { now = value; } };
}

function choose(state: PokedexDistanceState, playerId: string, pokemonId: string, context: GameContext): PokedexDistanceState {
  const result = pokedexDistanceGame.handleAction(state, playerId, { type: 'SELECT_POKEMON', pokemonId }, context);
  expect(result.accepted).toBe(true);
  return result.state;
}

function advanceResults(state: PokedexDistanceState, context: GameContext, setNow: (now: number) => void): PokedexDistanceState {
  setNow(state.nextTransitionAt!);
  return pokedexDistanceGame.handleTimeout(state, context);
}

describe('Pokédex Distance rules', () => {
  it('calculates absolute distance and detects exact hits', () => {
    expect(distanceBetween(445, 448)).toBe(3);
    expect(distanceBetween(448, 448)).toBe(0);
  });

  it('finds one or several farthest players', () => {
    expect(farthestPlayerIds({ a: { pokemonId: 'a', dexNumber: 1, distance: 8, selectedAt: 1 }, b: { pokemonId: 'b', dexNumber: 2, distance: 3, selectedAt: 1 } })).toEqual(['a']);
    expect(farthestPlayerIds({ a: { pokemonId: 'a', dexNumber: 1, distance: 8, selectedAt: 1 }, b: { pokemonId: 'b', dexNumber: 2, distance: 8, selectedAt: 1 } })).toEqual(['a', 'b']);
  });

  it('registers an exact hit', () => {
    const { context, state } = setup(3, 0); // target #1
    const next = choose(state, 'p1', 'bulbasaur', context);
    expect(next.playerStats.p1?.exactHits).toBe(1);
    expect(next.selections.p1?.distance).toBe(0);
  });

  it('continues using the hidden National Dex number for distance calculations', () => {
    const { context, state } = setup(3, 0); // target #1
    const next = choose(state, 'p1', 'pikachu', context);
    expect(next.selections.p1).toMatchObject({ pokemonId: 'pikachu', dexNumber: 25, distance: 24 });
  });

  it('eliminates exactly the farthest player in a normal round', () => {
    const { context, state } = setup(3, 0); // #1
    let next = choose(state, 'p1', 'bulbasaur', context);
    next = choose(next, 'p2', 'pikachu', context);
    next = choose(next, 'p3', 'mew', context);
    expect(next.phase).toBe('ROUND_RESULTS');
    expect(next.lastRound?.eliminatedIds).toEqual(['p3']);
    expect(next.survivorIds).toEqual(['p1', 'p2']);
  });

  it('eliminates every non-responder and not an additional farthest responder', () => {
    const { context, state, setNow } = setup(4, 0);
    let next = choose(state, 'p1', 'mew', context);
    next = choose(next, 'p2', 'pikachu', context);
    setNow(next.roundEndsAt!);
    next = pokedexDistanceGame.handleTimeout(next, context);
    expect(next.lastRound?.reason).toBe('NO_RESPONSE');
    expect(next.lastRound?.eliminatedIds).toEqual(['p3', 'p4']);
    expect(next.survivorIds).toEqual(['p1', 'p2']);
  });

  it('starts a tiebreak for tied farthest players and restores all survivors afterwards', () => {
    const fixture = setup(3, 0); // #1: #151/#152 are farthest-ish, need same distance impossible unique dex; force target state #151.5 concept impossible
    let state: PokedexDistanceState = { ...fixture.state, targetDexNumber: 26 };
    state = choose(state, 'p1', 'bulbasaur', fixture.context); // 25
    state = choose(state, 'p2', 'celebi', fixture.context); // 225
    state = choose(state, 'p3', 'mew', fixture.context); // 125, no tie
    expect(state.lastRound?.reason).toBe('FARTHEST');

    // Construct symmetric choices around #151: #1 and #251 => 150/100 not tie. Around #126: #1/#251 => 125.
    const tied = setup(3, 0);
    let tieState: PokedexDistanceState = { ...tied.state, targetDexNumber: 126 };
    tieState = choose(tieState, 'p1', 'bulbasaur', tied.context);
    tieState = choose(tieState, 'p2', 'celebi', tied.context);
    tieState = choose(tieState, 'p3', 'mew', tied.context);
    expect(tieState.lastRound?.reason).toBe('TIE');
    expect(tieState.pendingEligibleIds).toEqual(['p1', 'p2']);
    tieState = advanceResults(tieState, tied.context, tied.setNow);
    expect(tieState.phase).toBe('TIEBREAKER_ACTIVE');
    expect(tieState.eligibleIds).toEqual(['p1', 'p2']);
    tieState = { ...tieState, targetDexNumber: 1 };
    tieState = choose(tieState, 'p1', 'bulbasaur', tied.context);
    tieState = choose(tieState, 'p2', 'mew', tied.context);
    expect(tieState.lastRound?.eliminatedIds).toEqual(['p2']);
    tieState = advanceResults(tieState, tied.context, tied.setNow);
    expect(tieState.eligibleIds).toEqual(['p1', 'p3']);
    expect(tieState.tiebreakDepth).toBe(0);
  });

  it('supports repeated tiebreaks', () => {
    const fixture = setup(3, 0);
    let state: PokedexDistanceState = { ...fixture.state, targetDexNumber: 126 };
    state = choose(state, 'p1', 'bulbasaur', fixture.context);
    state = choose(state, 'p2', 'celebi', fixture.context);
    state = choose(state, 'p3', 'mew', fixture.context);
    state = advanceResults(state, fixture.context, fixture.setNow);
    state = { ...state, targetDexNumber: 126 };
    state = choose(state, 'p1', 'bulbasaur', fixture.context);
    state = choose(state, 'p2', 'celebi', fixture.context);
    expect(state.lastRound?.reason).toBe('TIE');
    expect(state.pendingTiebreakDepth).toBe(2);
  });

  it('authoritatively rejects duplicate Pokémon and unlocks all at the next round', () => {
    const fixture = setup(4, 0);
    let state = choose(fixture.state, 'p1', 'pikachu', fixture.context);
    const duplicate = pokedexDistanceGame.handleAction(state, 'p2', { type: 'SELECT_POKEMON', pokemonId: 'pikachu' }, fixture.context);
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.error).toMatch(/elegido/);
    state = choose(state, 'p2', 'bulbasaur', fixture.context);
    state = choose(state, 'p3', 'mew', fixture.context);
    state = choose(state, 'p4', 'celebi', fixture.context);
    state = advanceResults(state, fixture.context, fixture.setNow);
    expect(state.lockedPokemonIds).toEqual([]);
  });

  it('finishes with one winner', () => {
    const fixture = setup(2, 0);
    let state = choose(fixture.state, 'p1', 'bulbasaur', fixture.context);
    state = choose(state, 'p2', 'mew', fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.nextTransitionAt).toBe(fixture.context.now + 4_000);
    state = advanceResults(state, fixture.context, fixture.setNow);
    expect(state.phase).toBe('GAME_RESULTS');
    expect(state.winnerId).toBe('p1');
    const results = pokedexDistanceGame.getResults(state);
    expect(results.standings.map((entry) => entry.position)).toEqual([1, 2]);
  });

  it('finishes safely without a winner when every remaining player times out', () => {
    const fixture = setup(2, 0);
    fixture.setNow(fixture.state.roundEndsAt!);
    let state = pokedexDistanceGame.handleTimeout(fixture.state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    state = advanceResults(state, fixture.context, fixture.setNow);
    expect(state.phase).toBe('GAME_RESULTS');
    expect(state.winnerId).toBeNull();
    expect(pokedexDistanceGame.getResults(state).standings.every((entry) => entry.points === 0)).toBe(true);
  });

  it('publishes a rich four-second result with target, choices, distances and exact hits', () => {
    const fixture = setup(3, 0);
    let state = choose(fixture.state, 'p1', 'bulbasaur', fixture.context);
    state = choose(state, 'p2', 'pikachu', fixture.context);
    state = choose(state, 'p3', 'mew', fixture.context);
    const view = pokedexDistanceGame.getPublicState(state, fixture.context);
    expect(view.phase).toBe('ROUND_RESULTS');
    expect(view.nextTransitionAt).toBe(fixture.context.now + 4_000);
    expect(view.lastRound?.targetPokemon).toEqual({ id: 'bulbasaur', name: 'Bulbasaur', nationalDexNumber: 1, sprite: '/1.png' });
    expect(view.lastRound?.selections.p1).toMatchObject({ pokemonName: 'Bulbasaur', dexNumber: 1, distance: 0, sprite: '/1.png' });
    expect(view.lastRound?.selections.p3).toMatchObject({ pokemonName: 'Mew', dexNumber: 151, distance: 150 });
    expect(view.lastRound?.eliminatedIds).toEqual(['p3']);
  });

  it('does not wait for a disconnected player and records them as a non-responder', () => {
    const fixture = setup(3, 0);
    fixture.context.players[2]!.connected = false;
    let state = choose(fixture.state, 'p1', 'bulbasaur', fixture.context);
    state = choose(state, 'p2', 'pikachu', fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound).toMatchObject({ reason: 'NO_RESPONSE', eliminatedIds: ['p3'] });
    expect(state.selections.p1).toBeDefined();
    expect(state.selections.p2).toBeDefined();
  });

  it('uses dynamic scoring for any field size', () => {
    expect(pointsForPosition(8, 1)).toBe(16);
    expect(pointsForPosition(8, 2)).toBe(11);
    expect(pointsForPosition(16, 1)).toBe(32);
    expect(pointsForPosition(16, 16)).toBe(1);
  });

  it('builds a pool from any generation combination', () => {
    expect(catalog.forGenerations([1, 3]).map((entry) => entry.id)).toEqual(['bulbasaur', 'pikachu', 'mew', 'treecko']);
    expect(catalog.forGenerations([2]).map((entry) => entry.id)).toEqual(['chikorita', 'celebi']);
  });
});
