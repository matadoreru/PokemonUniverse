import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog, PokemonType } from '../../index.js';
import { defaultPokemonBingoConfig, type PokemonBingoConfig } from './config.js';
import { buildBingoConditionTemplates, findPerfectBingoMatching, generateBingoBoard } from './generator.js';
import { bingoCellKey, pokemonMatchesBingoCell, pokemonMatchesBingoCondition } from './rules.js';
import { BINGO_INCORRECT_COOLDOWN_MS, BINGO_REVEAL_MS, pokemonBingoGame } from './server.js';
import type { BingoCell, BingoCondition, PokemonBingoState } from './types.js';

const typeCycle: PokemonType[][] = [['fire'], ['water'], ['grass'], ['electric'], ['rock'], ['psychic'], ['fire', 'flying'], ['water', 'ground'], ['grass', 'poison'], ['dragon', 'ground']];
function makePokemon(index: number): Pokemon {
  const types = typeCycle[index % typeCycle.length]!; const generation = index % 3 + 1; const stageCount = index % 4 === 0 ? 1 : 3; const stage = stageCount === 1 ? 1 : index % 3 + 1;
  return { id: `pokemon-${index + 1}`, nationalDexNumber: index + 1, name: `Pokémon ${index + 1}`, generation, sprite: `/pokemon-${index + 1}.png`, types,
    hp: 35 + index % 100, attack: 40 + index * 2 % 130, defense: 30 + index * 3 % 140, specialAttack: 45 + index * 5 % 125, specialDefense: 40 + index * 7 % 120, speed: 25 + index * 11 % 150, baseStatTotal: 300 + index * 13 % 400,
    heightDecimeters: 3 + index % 40, weightHectograms: 20 + index * 37 % 3_000, evolutionStage: stage, evolutionStageCount: stageCount,
    legendaryStatus: index % 31 === 0 ? 'MYTHICAL' : index % 17 === 0 ? 'LEGENDARY' : 'NORMAL', color: ['red', 'blue', 'green', 'brown', 'yellow'][index % 5]!, abilities: [`ability-${index % 8}`, `shared-${index % 3}`] };
}
const pokemon = Array.from({ length: 90 }, (_, index) => makePokemon(index));
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number), forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)) };
function randomSource() { let value = 123_456_789; return () => { value = value * 1_103_515_245 + 12_345 & 0x7fffffff; return value / 0x80000000; }; }
function config(overrides: Partial<PokemonBingoConfig> = {}): PokemonBingoConfig { return { ...defaultPokemonBingoConfig, width: 2, height: 2, generations: [1, 2, 3], families: { ...defaultPokemonBingoConfig.families }, ...overrides }; }
function setup(playerCount = 2, overrides: Partial<PokemonBingoConfig> = {}) {
  let now = 1_000; const context: GameContext = { players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}`, connected: true, active: true })), pokemon: catalog, now, random: randomSource() };
  let state = pokemonBingoGame.createInitialState(config(overrides), context); state = pokemonBingoGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; context.now = value; } };
}
function action(state: PokemonBingoState, playerId: string, payload: Parameters<typeof pokemonBingoGame.handleAction>[2], context: GameContext) { return pokemonBingoGame.handleAction(state, playerId, payload, context); }

describe('Pokémon Bingo configuration and conditions', () => {
  it('supports independent custom dimensions and validates sensible limits', () => {
    expect(pokemonBingoGame.configSchema.parse({ ...defaultPokemonBingoConfig, width: 4, height: 3 })).toMatchObject({ width: 4, height: 3 });
    expect(() => pokemonBingoGame.configSchema.parse({ ...defaultPokemonBingoConfig, width: 1 })).toThrow(); expect(() => pokemonBingoGame.configSchema.parse({ ...defaultPokemonBingoConfig, height: 7 })).toThrow();
  });
  it('rejects zero active families before starting', () => { const fixture = setup(); const families = Object.fromEntries(Object.keys(defaultPokemonBingoConfig.families).map((key) => [key, false])) as PokemonBingoConfig['families']; expect(() => pokemonBingoGame.createInitialState(config({ families }), fixture.context)).toThrow(/al menos una familia/); });

  const cases: Array<[string, BingoCondition, Pokemon, boolean]> = [
    ['generation', { kind: 'GENERATION', generation: 1 }, pokemon[0]!, true],
    ['dex greater', { kind: 'DEX', operator: 'GT', value: 20 }, pokemon[30]!, true],
    ['dex lower', { kind: 'DEX', operator: 'LT', value: 20 }, pokemon[5]!, true],
    ['dex range', { kind: 'DEX', operator: 'RANGE', value: 10, max: 20 }, pokemon[14]!, true],
    ['simple type', { kind: 'TYPE', pokemonType: 'fire' }, pokemon[0]!, true],
    ['exact combination', { kind: 'TYPE_COMBINATION', pokemonTypes: ['flying', 'fire'] }, pokemon[6]!, true],
    ['monotype', { kind: 'TYPE_COUNT', count: 1 }, pokemon[0]!, true],
    ['dual type', { kind: 'TYPE_COUNT', count: 2 }, pokemon[6]!, true],
    ['HP', { kind: 'STAT', stat: 'hp', operator: 'GT', value: 30 }, pokemon[0]!, true],
    ['Attack', { kind: 'STAT', stat: 'attack', operator: 'GT', value: 30 }, pokemon[0]!, true],
    ['Defense', { kind: 'STAT', stat: 'defense', operator: 'GT', value: 20 }, pokemon[0]!, true],
    ['Special Attack', { kind: 'STAT', stat: 'specialAttack', operator: 'GT', value: 30 }, pokemon[0]!, true],
    ['Special Defense', { kind: 'STAT', stat: 'specialDefense', operator: 'GT', value: 30 }, pokemon[0]!, true],
    ['Speed', { kind: 'STAT', stat: 'speed', operator: 'GT', value: 20 }, pokemon[0]!, true],
    ['BST', { kind: 'STAT', stat: 'baseStatTotal', operator: 'GT', value: 250 }, pokemon[0]!, true],
    ['height', { kind: 'PHYSICAL', metric: 'heightDecimeters', operator: 'GT', value: 2 }, pokemon[0]!, true],
    ['weight', { kind: 'PHYSICAL', metric: 'weightHectograms', operator: 'GT', value: 10 }, pokemon[0]!, true],
    ['evolution', { kind: 'EVOLUTION', status: 'NONE' }, pokemon[0]!, true],
    ['legendary', { kind: 'LEGENDARY', status: 'MYTHICAL' }, pokemon[0]!, true],
    ['color', { kind: 'COLOR', color: 'red' }, pokemon[0]!, true],
    ['ability', { kind: 'ABILITY', ability: 'ability-0' }, pokemon[0]!, true],
  ];
  it.each(cases)('evaluates %s conditions', (_label, condition, candidate, expected) => { expect(pokemonMatchesBingoCondition(candidate, condition)).toBe(expected); });
  it('requires every member of a combined cell', () => { expect(pokemonMatchesBingoCell(pokemon[6]!, { conditions: [{ kind: 'TYPE', pokemonType: 'fire' }, { kind: 'GENERATION', generation: 1 }] })).toBe(true); expect(pokemonMatchesBingoCell(pokemon[7]!, { conditions: [{ kind: 'TYPE', pokemonType: 'fire' }, { kind: 'GENERATION', generation: 1 }] })).toBe(false); });
});

describe('Pokémon Bingo globally solvable generation', () => {
  it('respects enabled families, generations and maximum conditions', () => {
    const onlyGeneration = config({ generations: [1, 2], maxConditionsPerCell: 1, families: { ...Object.fromEntries(Object.keys(defaultPokemonBingoConfig.families).map((key) => [key, false])), generation: true } as PokemonBingoConfig['families'] });
    const templates = buildBingoConditionTemplates(pokemon.filter((entry) => entry.generation <= 2), onlyGeneration, randomSource());
    expect(templates.every((template) => template.conditions.length === 1 && template.conditions[0]?.kind === 'GENERATION' && [1, 2].includes(template.conditions[0].generation))).toBe(true);
  });
  it('generates different balanced boards with unique, compatible conditions and a perfect matching', () => {
    const value = config({ width: 3, height: 3, maxConditionsPerCell: 2 }); const templates = buildBingoConditionTemplates(pokemon, value, randomSource()); const signatures = new Set<string>();
    const first = generateBingoBoard(templates, pokemon, 3, 3, randomSource(), signatures, 0); signatures.add(first.signature); const second = generateBingoBoard(templates, pokemon, 3, 3, randomSource(), signatures, 97);
    expect(first.cells).toHaveLength(9); expect(second.signature).not.toBe(first.signature); expect(new Set(first.cells.map(bingoCellKey)).size).toBe(9);
    expect(first.cells.every((cell) => cell.conditions.length >= 1 && cell.conditions.length <= 2 && pokemon.some((entry) => pokemonMatchesBingoCell(entry, cell)))).toBe(true);
    expect(new Set(Object.values(first.solutionPokemonIds)).size).toBe(9);
  });
  it('finds augmenting-path matchings and rejects boards that compete for one Pokémon', () => {
    const small = [makePokemon(0), makePokemon(1)]; const flexible: BingoCell = { id: 'a', conditions: [{ kind: 'TYPE_COUNT', count: 1 }] }; const fire: BingoCell = { id: 'b', conditions: [{ kind: 'TYPE', pokemonType: 'fire' }] };
    const matching = findPerfectBingoMatching([flexible, fire], small); expect(matching).not.toBeNull(); expect(new Set(Object.values(matching!)).size).toBe(2);
    expect(findPerfectBingoMatching([{ id: 'a', conditions: fire.conditions }, { id: 'b', conditions: fire.conditions }], [small[0]!])).toBeNull();
  });
  it('creates a distinct validated board for every player before the timer starts', () => { const fixture = setup(4); const boards = Object.values(fixture.state.boards); expect(new Set(boards.map((board) => board.cells.map(bingoCellKey).join('|'))).size).toBe(4); expect(boards.every((board) => new Set(Object.values(board.solutionPokemonIds)).size === 4)).toBe(true); expect(fixture.state.roundEndsAt).toBe(121_000); });
});

describe('Pokémon Bingo authoritative assignments and race', () => {
  it('accepts a valid Pokémon, rejects an invalid one privately and enforces cooldown', () => {
    const fixture = setup(); const board = fixture.state.boards.p1!; const cell = board.cells[0]!; const valid = board.solutionPokemonIds[cell.id]!;
    let state = action(fixture.state, 'p1', { type: 'ASSIGN_POKEMON', cellId: cell.id, pokemonId: valid }, fixture.context).state; expect(state.boards.p1?.assignments[cell.id]).toBe(valid);
    const target = board.cells[1]!; const invalid = pokemon.find((entry) => fixture.state.poolIds.includes(entry.id) && !pokemonMatchesBingoCell(entry, target))!; const wrong = action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: target.id, pokemonId: invalid.id }, fixture.context); expect(wrong.accepted).toBe(true); state = wrong.state;
    expect(pokemonBingoGame.getPublicState(state, fixture.context)).not.toHaveProperty('lastAttempts'); expect((pokemonBingoGame.getPlayerState(state, 'p1', fixture.context) as { lastAttempt: unknown }).lastAttempt).toMatchObject({ correct: false, pokemonId: invalid.id });
    expect(action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: target.id, pokemonId: board.solutionPokemonIds[target.id]! }, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Espera/) });
    fixture.setNow(fixture.context.now + BINGO_INCORRECT_COOLDOWN_MS); expect(action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: target.id, pokemonId: board.solutionPokemonIds[target.id]! }, fixture.context).accepted).toBe(true);
  });

  it('moves, replaces and removes assignments atomically while another board may reuse the same Pokémon', () => {
    const fixture = setup(); const broadCells: BingoCell[] = fixture.state.boards.p1!.cells.map((cell) => ({ ...cell, conditions: [{ kind: 'TYPE_COUNT', count: 1 }] }));
    const otherBroadCells: BingoCell[] = fixture.state.boards.p2!.cells.map((cell) => ({ ...cell, conditions: [{ kind: 'TYPE_COUNT', count: 1 }] }));
    let state: PokemonBingoState = { ...fixture.state, boards: { ...fixture.state.boards, p1: { ...fixture.state.boards.p1!, cells: broadCells }, p2: { ...fixture.state.boards.p2!, cells: otherBroadCells } } }; const [a, b] = broadCells; const first = pokemon[0]!.id; const replacement = pokemon[1]!.id;
    state = action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: a!.id, pokemonId: first }, fixture.context).state;
    expect(action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: b!.id, pokemonId: first }, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/ya está usado/) });
    state = action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: b!.id, pokemonId: first, moveExisting: true }, fixture.context).state; expect(state.boards.p1?.assignments).toMatchObject({ [b!.id]: first }); expect(state.boards.p1?.assignments[a!.id]).toBeUndefined();
    state = action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: b!.id, pokemonId: replacement }, fixture.context).state; expect(state.boards.p1?.assignments[b!.id]).toBe(replacement);
    state = action(state, 'p2', { type: 'ASSIGN_POKEMON', cellId: otherBroadCells[0]!.id, pokemonId: replacement }, fixture.context).state; expect(state.boards.p2!.assignments[otherBroadCells[0]!.id]).toBe(replacement); expect(state.boards.p1!.assignments[b!.id]).toBe(replacement);
    state = action(state, 'p1', { type: 'REMOVE_POKEMON', cellId: b!.id }, fixture.context).state; expect(state.boards.p1?.assignments[b!.id]).toBeUndefined();
  });

  it('supports explicit atomic moves and leaves both cells untouched when the destination is invalid', () => {
    const fixture = setup(); const board = fixture.state.boards.p1!; const [from, to] = board.cells; const sourceId = board.solutionPokemonIds[from!.id]!;
    const state = action(fixture.state, 'p1', { type: 'ASSIGN_POKEMON', cellId: from!.id, pokemonId: sourceId }, fixture.context).state;
    const source = catalog.byId(sourceId)!; const targetMatches = pokemonMatchesBingoCell(source, to!); const before = { ...state.boards.p1!.assignments };
    const moved = action(state, 'p1', { type: 'MOVE_POKEMON', fromCellId: from!.id, toCellId: to!.id }, fixture.context);
    if (targetMatches) { expect(moved.state.boards.p1?.assignments[from!.id]).toBeUndefined(); expect(moved.state.boards.p1?.assignments[to!.id]).toBe(sourceId); } else { expect(moved.accepted).toBe(true); expect(moved.state.boards.p1?.assignments).toEqual(before); expect(moved.state.cooldownUntil.p1).toBe(fixture.context.now + BINGO_INCORRECT_COOLDOWN_MS); }
  });

  it('ends exactly once on the first complete board and ranks the winner first', () => {
    const fixture = setup(); let state = fixture.state; const board = state.boards.p1!;
    for (const cell of board.cells) { fixture.context.now += 10; state = action(state, 'p1', { type: 'ASSIGN_POKEMON', cellId: cell.id, pokemonId: board.solutionPokemonIds[cell.id]! }, fixture.context).state; }
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.winnerId).toBe('p1'); expect(action(state, 'p2', { type: 'ASSIGN_POKEMON', cellId: state.boards.p2!.cells[0]!.id, pokemonId: state.boards.p2!.solutionPokemonIds[state.boards.p2!.cells[0]!.id]! }, fixture.context).accepted).toBe(false);
    const results = pokemonBingoGame.getResults(state); expect(results.standings[0]).toMatchObject({ playerId: 'p1', won: true, points: 4 });
    fixture.setNow(state.nextTransitionAt!); state = pokemonBingoGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('GAME_RESULTS'); expect(state.nextTransitionAt).toBeNull();
  });

  it('uses one global timer, orders remaining progress deterministically and awards dynamic points', () => {
    const fixture = setup(3, { durationSeconds: 60 }); const [p1Cell, p2Cell] = [fixture.state.boards.p1!.cells[0]!, fixture.state.boards.p2!.cells[0]!]; let state = action(fixture.state, 'p1', { type: 'ASSIGN_POKEMON', cellId: p1Cell.id, pokemonId: fixture.state.boards.p1!.solutionPokemonIds[p1Cell.id]! }, fixture.context).state;
    fixture.context.now += 5; state = action(state, 'p2', { type: 'ASSIGN_POKEMON', cellId: p2Cell.id, pokemonId: state.boards.p2!.solutionPokemonIds[p2Cell.id]! }, fixture.context).state;
    fixture.setNow(61_000); state = pokemonBingoGame.handleTimeout(state, fixture.context); const results = pokemonBingoGame.getResults(state); expect(state.phase).toBe('GAME_RESULTS'); expect(results.standings.map((entry) => entry.playerId)).toEqual(['p1', 'p2', 'p3']); expect(results.standings.map((entry) => entry.points)).toEqual([6, 3, 2]);
  });

  it('publishes all boards and progress but no incorrect attempts, preserves disconnected state, and reveals at most three examples', () => {
    const fixture = setup(); const before = JSON.stringify(pokemonBingoGame.getPublicState(fixture.state, fixture.context)); fixture.context.players[0]!.connected = false; const after = pokemonBingoGame.handlePresenceChange?.(fixture.state, fixture.context) ?? fixture.state; expect(JSON.stringify(pokemonBingoGame.getPublicState(after, fixture.context))).toBe(before);
    fixture.setNow(fixture.state.roundEndsAt!); const finished = pokemonBingoGame.handleTimeout(fixture.state, fixture.context); const view = pokemonBingoGame.getPublicState(finished, fixture.context); expect(Object.keys(view.boards)).toEqual(['p1', 'p2']); expect(Object.values(view.boards).every((board) => board.cells.every((cell) => cell.possibleSolutions.length <= 3))).toBe(true); expect(JSON.stringify(view)).not.toContain('lastAttempts'); expect(JSON.stringify(view)).not.toContain('solutionPokemonIds');
  });

  it('records extensible profile statistics including completion, errors and best Bingo time', () => {
    const fixture = setup(); const state = { ...fixture.state, phase: 'GAME_RESULTS' as const, winnerId: 'p1', bingoAt: 6_000, boards: { ...fixture.state.boards, p1: { ...fixture.state.boards.p1!, assignments: { ...fixture.state.boards.p1!.solutionPokemonIds } } }, playerStats: { ...fixture.state.playerStats, p1: { correctAssignments: 4, incorrectAttempts: 2 } } };
    expect(pokemonBingoGame.getResults(state).standings[0]?.stats).toEqual({ games: 1, bingos: 1, cellsCompleted: 4, cellsTotal: 4, correctAssignments: 4, incorrectAttempts: 2, bestBingoTimeMs: 5_000 });
    expect(pokemonBingoGame.manifest.profileStats.derivedMetrics?.map((metric) => metric.key)).toEqual(['completionRate', 'bingoRate']);
  });

  it('uses the short authoritative Bingo transition', () => { const fixture = setup(); const state = { ...fixture.state, phase: 'ROUND_RESULTS' as const, winnerId: 'p1', bingoAt: fixture.context.now, roundEndsAt: null, nextTransitionAt: fixture.context.now + BINGO_REVEAL_MS }; fixture.setNow(state.nextTransitionAt); expect(pokemonBingoGame.handleTimeout(state, fixture.context).phase).toBe('GAME_RESULTS'); });
});
