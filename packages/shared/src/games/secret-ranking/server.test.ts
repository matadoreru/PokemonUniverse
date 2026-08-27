import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultSecretRankingConfig } from './config.js';
import { secretRankingDistances } from './rules.js';
import { secretRankingGame } from './server.js';
import type { SecretRankingState } from './types.js';

function pokemon(id: string, number: number): Pokemon {
  return {
    id, nationalDexNumber: number, name: id, generation: 1, isDefault: true, sprite: `/${id}.png`,
    hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50,
    baseStatTotal: 300, types: ['normal'], legendaryStatus: 'NORMAL',
  };
}

const entries = Array.from({ length: 12 }, (_, index) => pokemon(`pokemon-${index + 1}`, index + 1));
const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((entry) => entry.id === id),
  byDexNumber: (number) => entries.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => entries.filter((entry) => generations.includes(entry.generation)),
};

function setup(overrides: Partial<typeof defaultSecretRankingConfig> = {}, playerCount = 3) {
  let now = 1_000;
  const context: GameContext = {
    players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })),
    pokemon: catalog,
    get now() { return now; },
    random: () => 0,
    hostCustomCategories: [{ id: 'custom-1', text: 'De más dormilón a menos dormilón' }],
  };
  const config = { ...defaultSecretRankingConfig, generations: [1], rounds: 1, ...overrides };
  let state = secretRankingGame.createInitialState(config, context);
  state = secretRankingGame.start(state, context);
  return { context, state, setNow(value: number) { now = value; } };
}

function submit(state: SecretRankingState, playerId: string, pokemonIds: string[], context: GameContext) {
  return secretRankingGame.handleAction(state, playerId, { type: 'SUBMIT_RANKING', pokemonIds }, context);
}

describe('Secret Ranking rules', () => {
  it('requires three players and builds a five-Pokémon round from official prompts', () => {
    expect(() => setup({}, 2)).toThrow(/al menos 3/);
    const fixture = setup();
    expect(fixture.state.currentPokemonIds).toHaveLength(5);
    expect(new Set(fixture.state.currentPokemonIds).size).toBe(5);
    expect(fixture.state.currentPromptId).toMatch(/^secret-ranking-official-/);
    expect(fixture.state.roundEndsAt).toBe(46_000);
  });

  it('uses only host prompts when configured and rejects an empty custom catalog', () => {
    const fixture = setup({ promptSource: 'CUSTOM' });
    expect(fixture.state.promptPool).toEqual([{ id: 'secret-ranking-custom-custom-1', text: 'De más dormilón a menos dormilón' }]);
    const emptyContext = { ...fixture.context, hostCustomCategories: [] };
    expect(() => secretRankingGame.createInitialState({ ...defaultSecretRankingConfig, generations: [1], promptSource: 'CUSTOM' }, emptyContext)).toThrow(/No hay preguntas/);
  });

  it('keeps every ranking private until reveal and restores only its owner on reconnect', () => {
    const fixture = setup();
    const order = [...fixture.state.currentPokemonIds];
    const result = submit(fixture.state, 'p1', order, fixture.context);
    expect(result.accepted).toBe(true);
    const publicState = secretRankingGame.getPublicState(result.state, fixture.context);
    expect(publicState.submittedPlayerIds).toEqual(['p1']);
    expect(JSON.stringify(publicState)).not.toContain(JSON.stringify(order));
    expect(secretRankingGame.getPlayerState(result.state, 'p1', fixture.context)).toMatchObject({ role: 'PLAYER', canSubmit: false, ownRanking: order.map((id) => ({ id })) });
    expect(secretRankingGame.getPlayerState(result.state, 'p2', fixture.context)).toMatchObject({ role: 'PLAYER', ownRanking: null });
  });

  it('validates the exact board and makes a submitted ranking immutable', () => {
    const fixture = setup();
    const order = [...fixture.state.currentPokemonIds];
    expect(submit(fixture.state, 'p1', [...order.slice(0, 4), 'not-on-board'], fixture.context).accepted).toBe(false);
    const accepted = submit(fixture.state, 'p1', order, fixture.context);
    expect(accepted.accepted).toBe(true);
    expect(submit(accepted.state, 'p1', [...order].reverse(), fixture.context)).toMatchObject({ accepted: false, error: 'Tu ranking ya está bloqueado.' });
  });

  it('compares each player against the average of the others, never their own ranking', () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'];
    const distances = secretRankingDistances({ p1: [a, b, c, d, e], p2: [a, b, c, d, e], p3: [e, d, c, b, a] });
    expect(distances).toEqual([
      { playerId: 'p1', distance: 6, distanceUnits: 12, position: 1, points: 6 },
      { playerId: 'p2', distance: 6, distanceUnits: 12, position: 1, points: 6 },
      { playerId: 'p3', distance: 12, distanceUnits: 24, position: 3, points: 2 },
    ]);
  });

  it('reveals all submitted rankings, consensus and tied winners once connected players finish', () => {
    const fixture = setup();
    const order = [...fixture.state.currentPokemonIds];
    let state = submit(fixture.state, 'p1', order, fixture.context).state;
    state = submit(state, 'p2', order, fixture.context).state;
    state = submit(state, 'p3', [...order].reverse(), fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound?.players.p1).toMatchObject({ distance: 6, position: 1, pointsAwarded: 6 });
    expect(state.lastRound?.consensus).toHaveLength(5);
    expect(state.scores).toEqual({ p1: 6, p2: 6, p3: 2 });
    expect(secretRankingGame.getPublicState(state, fixture.context).lastRound?.players.p1?.ranking).toHaveLength(5);
  });

  it('excludes missing rankings from the average and awards them no points on timeout', () => {
    const fixture = setup();
    const order = [...fixture.state.currentPokemonIds];
    let state = submit(fixture.state, 'p1', order, fixture.context).state;
    state = submit(state, 'p2', [...order].reverse(), fixture.context).state;
    fixture.setNow(46_000);
    state = secretRankingGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound?.players.p3).toEqual({ ranking: null, distance: null, position: null, pointsAwarded: 0 });
    expect(state.playerStats.p3).toMatchObject({ rankingsSubmitted: 0, roundsMissed: 1, pointsFromRounds: 0 });
    expect(state.lastRound?.consensus).toHaveLength(5);
  });

  it('finishes after the configured reveal and returns integrated standings and stats', () => {
    const fixture = setup();
    const order = [...fixture.state.currentPokemonIds];
    let state = submit(fixture.state, 'p1', order, fixture.context).state;
    state = submit(state, 'p2', order, fixture.context).state;
    state = submit(state, 'p3', order, fixture.context).state;
    fixture.setNow(state.nextTransitionAt!);
    state = secretRankingGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS');
    const results = secretRankingGame.getResults(state);
    expect(results.winnerId).toBeNull();
    expect(results.standings).toHaveLength(3);
    expect(results.standings.every((standing) => standing.stats.rankingsSubmitted === 1)).toBe(true);
  });
});
