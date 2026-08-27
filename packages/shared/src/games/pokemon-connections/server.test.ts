import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { generateConnectionsPuzzle } from './catalog.js';
import { defaultPokemonConnectionsConfig, pokemonConnectionsConfigSchema } from './config.js';
import { completionBonus } from './rules.js';
import { POKEMON_CONNECTIONS_REVEAL_MS, pokemonConnectionsGame } from './server.js';
import type { PokemonConnectionsState } from './types.js';

const classicIds = [
  'vaporeon', 'jolteon', 'flareon', 'espeon',
  'omanyte', 'kabuto', 'aerodactyl', 'lileep',
  'growlithe', 'houndour', 'electrike', 'lillipup',
  'vanillite', 'slurpuff', 'appletun', 'alcremie',
];

const companionIds = [
  'meowth', 'skitty', 'glameow', 'purrloin',
  'teddiursa', 'cubchoo', 'stufful', 'kubfu',
  'pichu', 'togepi', 'riolu', 'toxel',
  'dragonite', 'tyranitar', 'metagross', 'garchomp',
];

function mon(id: string, index: number, extra: Partial<Pokemon> = {}): Pokemon {
  return {
    id, nationalDexNumber: index + 1, name: id, generation: 1, isDefault: true, sprite: `/${id}.png`,
    hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50,
    baseStatTotal: 300, types: ['normal'], color: 'brown', evolutionStage: 1, evolutionStageCount: 1,
    legendaryStatus: 'NORMAL', ...extra,
  };
}

function catalog(entries: Pokemon[]): PokemonCatalog {
  return {
    all: () => entries,
    byId: (id) => entries.find((pokemon) => pokemon.id === id),
    byDexNumber: (number) => entries.find((pokemon) => pokemon.nationalDexNumber === number),
    forGenerations: (generations) => entries.filter((pokemon) => generations.includes(pokemon.generation)),
  };
}

function setup(overrides: Partial<typeof defaultPokemonConnectionsConfig> = {}, count = 2) {
  const entries = classicIds.map((id, index) => mon(id, index));
  const players = Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog(entries), now: 1_000, random: () => 0, hostId: 'p1' };
  const config = { ...defaultPokemonConnectionsConfig, generations: [1], rounds: 1, ...overrides };
  let state = pokemonConnectionsGame.createInitialState(config, context);
  state = pokemonConnectionsGame.start(state, context);
  return { context, state };
}

function submit(state: PokemonConnectionsState, playerId: string, pokemonIds: string[], context: GameContext) {
  return pokemonConnectionsGame.handleAction(state, playerId, { type: 'SUBMIT_GROUP', pokemonIds }, context);
}

describe('Pokémon Connections puzzle construction and config', () => {
  it('accepts 3-5 groups of 3-5 Pokémon and rejects incomplete boards', () => {
    expect(pokemonConnectionsConfigSchema.safeParse({ ...defaultPokemonConnectionsConfig, groupSize: 3, pokemonCount: 9 }).success).toBe(true);
    expect(pokemonConnectionsConfigSchema.safeParse({ ...defaultPokemonConnectionsConfig, groupSize: 5, pokemonCount: 25 }).success).toBe(true);
    expect(pokemonConnectionsConfigSchema.safeParse({ ...defaultPokemonConnectionsConfig, groupSize: 3, pokemonCount: 16 }).success).toBe(false);
  });

  it('prefers a curated standard puzzle and dynamically builds other valid sizes without duplicates', () => {
    const fixture = setup();
    expect(fixture.state.puzzleSource).toBe('CURATED');
    expect(fixture.state.answerGroups).toHaveLength(4);
    expect(new Set(fixture.state.board.map((pokemon) => pokemon.id))).toHaveLength(16);

    const entries = Array.from({ length: 12 }, (_, index) => mon(`synthetic-${index}`, index));
    const context: GameContext = { ...fixture.context, pokemon: catalog(entries) };
    const generated = generateConnectionsPuzzle(context, { generations: [1], groupSize: 3, pokemonCount: 9 });
    expect(generated.source).toBe('DYNAMIC');
    expect(generated.groups).toHaveLength(3);
    expect(new Set(generated.groups.flatMap((group) => group.pokemon.map((pokemon) => pokemon.id)))).toHaveLength(9);
  });

  it('avoids recently used categories when another curated puzzle is available', () => {
    const entries = [...classicIds, ...companionIds].map((id, index) => mon(id, index));
    const context: GameContext = { players: [], pokemon: catalog(entries), now: 1_000, random: () => 0 };
    const first = generateConnectionsPuzzle(context, { generations: [1], groupSize: 4, pokemonCount: 16 });
    const firstCategories = first.groups.map((group) => group.categoryId);
    const second = generateConnectionsPuzzle(context, {
      generations: [1], groupSize: 4, pokemonCount: 16,
      usedPuzzleKeys: [first.key], excludedCategoryIds: firstCategories,
    });
    expect(second.key).not.toBe(first.key);
    expect(second.groups.every((group) => !firstCategories.includes(group.categoryId))).toBe(true);
  });

  it('awards the agreed completion podium bonuses', () => {
    expect([1, 2, 3, 4].map(completionBonus)).toEqual([3, 2, 1, 0]);
  });
});

describe('Pokémon Connections authoritative private play', () => {
  it('keeps answer categories and individual mistakes out of the public active projection', () => {
    const fixture = setup();
    const answer = fixture.state.answerGroups[0]!;
    let state = submit(fixture.state, 'p1', answer.pokemon.map((pokemon) => pokemon.id), fixture.context).state;
    const wrong = [state.answerGroups[1]!.pokemon[0]!, state.answerGroups[1]!.pokemon[1]!, state.answerGroups[1]!.pokemon[2]!, state.answerGroups[2]!.pokemon[0]!].map((pokemon) => pokemon.id);
    state = submit(state, 'p2', wrong, fixture.context).state;

    const publicJson = JSON.stringify(pokemonConnectionsGame.getPublicState(state, fixture.context));
    expect(publicJson).not.toContain(answer.label);
    expect(publicJson).not.toMatch(/mistakesUsed|nearMiss|categoryId/);
    expect(pokemonConnectionsGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ role: 'PLAYER', foundGroups: [{ label: answer.label }] });
    expect(pokemonConnectionsGame.getPlayerState(state, 'p2', fixture.context)).toMatchObject({ role: 'PLAYER', mistakesUsed: 1, lastAttempt: { kind: 'INCORRECT', nearMiss: true } });
  });

  it('validates exact selections and never consumes an invalid transport action as a mistake', () => {
    const fixture = setup();
    const duplicate = submit(fixture.state, 'p1', ['vaporeon', 'vaporeon', 'jolteon', 'flareon'], fixture.context);
    const outsider = submit(fixture.state, 'p1', ['vaporeon', 'jolteon', 'flareon', 'missing'], fixture.context);
    expect(duplicate.accepted).toBe(false);
    expect(outsider.accepted).toBe(false);
    expect(duplicate.state.progress.p1?.mistakesUsed).toBe(0);
  });

  it('scores every group, adds the solve-order bonus and locks a completed board', () => {
    const fixture = setup();
    let state = fixture.state;
    for (const group of state.answerGroups) {
      fixture.context.now += 1_000;
      state = submit(state, 'p1', group.pokemon.map((pokemon) => pokemon.id), fixture.context).state;
    }
    expect(state.progress.p1).toMatchObject({ status: 'SOLVED', completionRank: 1, roundPoints: 7 });
    expect(state.scores.p1).toBe(7);
    expect(submit(state, 'p1', state.answerGroups[0]!.pokemon.map((pokemon) => pokemon.id), fixture.context).accepted).toBe(false);
  });

  it('eliminates at the configured error limit, reveals only after everyone finishes and records statistics', () => {
    const fixture = setup({ mistakesAllowed: 1 });
    const groups = fixture.state.answerGroups;
    const wrong = [groups[0]!.pokemon[0]!, groups[0]!.pokemon[1]!, groups[1]!.pokemon[0]!, groups[1]!.pokemon[1]!].map((pokemon) => pokemon.id);
    let state = submit(fixture.state, 'p1', wrong, fixture.context).state;
    expect(state.phase).toBe('ROUND_ACTIVE');
    expect(state.progress.p1?.status).toBe('ELIMINATED');
    state = submit(state, 'p2', wrong, fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound?.groups).toHaveLength(4);
    expect(state.playerStats.p1).toMatchObject({ roundsPlayed: 1, mistakes: 1, nearMisses: 0 });
  });

  it('does not wait for a disconnected player and restores private progress on reconnect', () => {
    const fixture = setup({ mistakesAllowed: 1 });
    const first = fixture.state.answerGroups[0]!;
    let state = submit(fixture.state, 'p1', first.pokemon.map((pokemon) => pokemon.id), fixture.context).state;
    fixture.context.players[1]!.connected = false;
    const restored = pokemonConnectionsGame.getPlayerState(state, 'p1', fixture.context);
    expect(restored).toMatchObject({ role: 'PLAYER', foundGroups: [{ id: first.id }] });
    const groups = state.answerGroups;
    const wrong = [groups[1]!.pokemon[0]!, groups[1]!.pokemon[1]!, groups[2]!.pokemon[0]!, groups[2]!.pokemon[1]!].map((pokemon) => pokemon.id);
    state = submit(state, 'p1', wrong, fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
  });

  it('times out, reveals for the synchronized duration and produces ranked game results', () => {
    const fixture = setup();
    fixture.context.now = fixture.state.roundEndsAt!;
    let state = pokemonConnectionsGame.handleTimeout(fixture.state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.nextTransitionAt).toBe(fixture.context.now + POKEMON_CONNECTIONS_REVEAL_MS);
    expect(state.progress.p1?.status).toBe('TIMED_OUT');
    fixture.context.now = state.nextTransitionAt!;
    state = pokemonConnectionsGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS');
    expect(pokemonConnectionsGame.getResults(state).standings).toHaveLength(2);
  });

  it('lets only the host advance during the 30-second reveal', () => {
    const fixture = setup({ rounds: 2 });
    fixture.context.now = fixture.state.roundEndsAt!;
    const revealed = pokemonConnectionsGame.handleTimeout(fixture.state, fixture.context);
    const guest = pokemonConnectionsGame.handleAction(revealed, 'p2', { type: 'ADVANCE_ROUND' }, fixture.context);
    expect(guest).toMatchObject({ accepted: false, error: expect.stringMatching(/Solo el Host/) });
    const host = pokemonConnectionsGame.handleAction(revealed, 'p1', { type: 'ADVANCE_ROUND' }, fixture.context);
    expect(host.accepted).toBe(true);
    expect(host.state).toMatchObject({ phase: 'ROUND_ACTIVE', roundNumber: 2 });
  });
});
