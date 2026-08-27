import { describe, expect, it } from 'vitest';
import type { GameContext, PokemonCatalog } from '../../index.js';
import { defaultWouldYouRatherConfig } from './config.js';
import { wouldYouRatherGame } from './server.js';
import type { WouldYouRatherOption, WouldYouRatherState } from './types.js';

const catalog: PokemonCatalog = {
  all: () => [], byId: () => undefined, byDexNumber: () => undefined, forGenerations: () => [],
};

function setup(overrides: Partial<typeof defaultWouldYouRatherConfig> = {}, playerCount = 3) {
  let now = 1_000;
  const context: GameContext = {
    players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })),
    pokemon: catalog,
    get now() { return now; },
    random: () => 0,
    hostWouldYouRatherPrompts: [{ id: 'custom-1', optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' }],
  };
  const config = { ...defaultWouldYouRatherConfig, rounds: 1, ...overrides };
  let state = wouldYouRatherGame.createInitialState(config, context);
  state = wouldYouRatherGame.start(state, context);
  return { context, state, setNow(value: number) { now = value; } };
}

function ballot(state: WouldYouRatherState, playerId: string, preference: WouldYouRatherOption, prediction: WouldYouRatherOption, context: GameContext) {
  return wouldYouRatherGame.handleAction(state, playerId, { type: 'SUBMIT_BALLOT', preference, prediction }, context);
}

describe('Would You Rather Pokémon rules', () => {
  it('requires three players, defaults to five rounds and supports custom pairs', () => {
    expect(defaultWouldYouRatherConfig).toEqual({ rounds: 5, roundSeconds: 45, promptSource: 'OFFICIAL' });
    expect(() => setup({}, 2)).toThrow(/al menos 3/);
    const custom = setup({ promptSource: 'CUSTOM' });
    expect(custom.state.promptPool).toEqual([{ id: 'would-you-rather-custom-custom-1', optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' }]);
    expect(() => setup({ promptSource: 'CUSTOM' }, 3)).not.toThrow();
  });

  it('keeps every ballot secret, exposes only completion and restores only its owner', () => {
    const fixture = setup();
    const result = ballot(fixture.state, 'p1', 'A', 'B', fixture.context);
    expect(result.accepted).toBe(true);
    const publicState = wouldYouRatherGame.getPublicState(result.state, fixture.context);
    expect(publicState.submittedPlayerIds).toEqual(['p1']);
    expect(publicState.lastRound).toBeNull();
    expect(JSON.stringify(publicState)).not.toContain('"preference"');
    expect(wouldYouRatherGame.getPlayerState(result.state, 'p1', fixture.context)).toMatchObject({ ownBallot: { preference: 'A', prediction: 'B' }, canSubmit: false });
    expect(wouldYouRatherGame.getPlayerState(result.state, 'p2', fixture.context)).toMatchObject({ ownBallot: null });
    expect(ballot(result.state, 'p1', 'B', 'A', fixture.context)).toMatchObject({ accepted: false, error: 'Tu papeleta ya está bloqueada.' });
  });

  it('counts the player own preference and awards one plus two points independently', () => {
    const fixture = setup(); let state = fixture.state;
    state = ballot(state, 'p1', 'A', 'A', fixture.context).state;
    state = ballot(state, 'p2', 'A', 'B', fixture.context).state;
    state = ballot(state, 'p3', 'B', 'A', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound).toMatchObject({ totals: { A: 2, B: 1 }, majority: 'A' });
    expect(state.scores).toEqual({ p1: 3, p2: 1, p3: 2 });
    expect(state.playerStats.p1).toMatchObject({ majorityChoices: 1, correctPredictions: 1, perfectRounds: 1 });
    expect(state.lastRound?.players.find((player) => player.playerId === 'p2')).toMatchObject({ majorityPoint: 1, predictionPoints: 0 });
  });

  it('awards no majority or prediction points when submitted preferences tie', () => {
    const fixture = setup({}, 4); let state = fixture.state;
    state = ballot(state, 'p1', 'A', 'A', fixture.context).state;
    state = ballot(state, 'p2', 'A', 'B', fixture.context).state;
    state = ballot(state, 'p3', 'B', 'A', fixture.context).state;
    state = ballot(state, 'p4', 'B', 'B', fixture.context).state;
    expect(state.lastRound?.majority).toBeNull();
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(state.lastRound?.players.every((player) => player.totalPoints === 0)).toBe(true);
  });

  it('excludes missing ballots on timeout and records missed rounds', () => {
    const fixture = setup(); let state = fixture.state;
    state = ballot(state, 'p1', 'B', 'B', fixture.context).state;
    state = ballot(state, 'p2', 'A', 'B', fixture.context).state;
    fixture.setNow(46_000); state = wouldYouRatherGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound).toMatchObject({ majority: null, missingPlayerIds: ['p3'] });
    expect(state.playerStats.p3).toMatchObject({ ballotsSubmitted: 0, roundsMissed: 1 });
  });

  it('restores a private ballot after reconnecting and does not let disconnected players block the round', () => {
    const fixture = setup(); let state = fixture.state;
    state = ballot(state, 'p1', 'A', 'B', fixture.context).state;
    fixture.context.players[0]!.connected = false;
    expect(wouldYouRatherGame.getPlayerState(state, 'p1', fixture.context)).toEqual({ role: 'SPECTATOR', canSubmit: false, ownBallot: null });
    fixture.context.players[0]!.connected = true;
    expect(wouldYouRatherGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ role: 'PLAYER', ownBallot: { preference: 'A', prediction: 'B' } });
    fixture.context.players[2]!.connected = false;
    state = ballot(state, 'p2', 'A', 'A', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound).toMatchObject({ totals: { A: 2, B: 0 }, missingPlayerIds: ['p3'] });
    expect(state.lastRound?.players.find((player) => player.playerId === 'p1')).toMatchObject({ preference: 'A', prediction: 'B' });
  });

  it('finishes after the reveal with standings and persistent statistics', () => {
    const fixture = setup(); let state = fixture.state;
    state = ballot(state, 'p1', 'A', 'A', fixture.context).state;
    state = ballot(state, 'p2', 'A', 'A', fixture.context).state;
    state = ballot(state, 'p3', 'B', 'A', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = wouldYouRatherGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS');
    const results = wouldYouRatherGame.getResults(state);
    expect(results.winnerId).toBeNull();
    expect(results.standings.filter((entry) => entry.won).map((entry) => entry.playerId)).toEqual(['p1', 'p2']);
    expect(results.standings[0]).toMatchObject({ points: 3, stats: { correctPredictions: 1 } });
  });
});
