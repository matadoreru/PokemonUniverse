import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultGuessFromStatsConfig, guessFromStatsConfigSchema, type GuessFromStatsConfig } from './config.js';
import { buildGuessFromStatsHints, buildGuessFromStatsSignature, buildGuessFromStatsVisibleStats, equivalentGuessFromStatsPokemon, pokemonBaseStatTotal } from './rules.js';
import { GUESS_FROM_STATS_COOLDOWN_MS, GUESS_FROM_STATS_REVEAL_MS, guessFromStatsGame, guessFromStatsPool } from './server.js';
import type { GuessFromStatsState } from './types.js';

function mon(id: string, generation: number, stats: Partial<Pick<Pokemon, 'hp' | 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed'>>, types: Pokemon['types'] = ['normal'], extra: Partial<Pokemon> = {}): Pokemon {
  const values = { hp: 60, attack: 85, defense: 70, specialAttack: 75, specialDefense: 80, speed: 100, ...stats };
  return { id, nationalDexNumber: Number(id.replace(/\D/g, '')) || 1, name: id.toUpperCase(), generation, isDefault: true, sprite: `/sprites/${id}.png`, ...values, baseStatTotal: Object.values(values).reduce((sum, value) => sum + value, 0), types, heightDecimeters: 16, weightHectograms: 484, evolutionStage: 3, evolutionStageCount: 3, legendaryStatus: 'NORMAL', ...extra };
}

const pokemon = [
  mon('alpha-1', 1, {}, ['psychic', 'fairy']),
  mon('beta-2', 1, { defense: 20, specialAttack: 30, specialDefense: 40, speed: 50 }, ['fairy', 'psychic']),
  mon('gamma-3', 1, { hp: 61 }, ['psychic', 'fairy']),
  mon('delta-4', 1, {}, ['water']),
  mon('alpha-mega-5', 1, {}, ['psychic', 'fairy'], { isDefault: false }),
  mon('future-6', 2, {}, ['psychic', 'fairy']),
];
const catalog: PokemonCatalog = {
  all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (dex) => pokemon.find((entry) => entry.nationalDexNumber === dex),
  forGenerations: (generations, options) => pokemon.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)),
};
const twoStats: GuessFromStatsConfig['stats'] = { hp: true, attack: true, defense: false, specialAttack: false, specialDefense: false, speed: false, bst: false };

function setup(overrides: Partial<GuessFromStatsConfig> = {}, playerCount = 2) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now: 1_000, random: () => 0, roomCode: 'ABC234' };
  const config: GuessFromStatsConfig = { ...defaultGuessFromStatsConfig, generations: [1], rounds: 2, stats: twoStats, ...overrides };
  let state = guessFromStatsGame.createInitialState(config, context); state = guessFromStatsGame.start(state, context); return { state, context, setNow(now: number) { context.now = now; } };
}
function guess(state: GuessFromStatsState, playerId: string, pokemonId: string, context: GameContext) { return guessFromStatsGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context); }

describe('Guess from Stats public signature and canonical stats', () => {
  it('exposes each enabled canonical Base Stat and calculates BST from all six values', () => {
    const source = pokemon[0]!; const all = buildGuessFromStatsVisibleStats(source, { ...defaultGuessFromStatsConfig, stats: { ...defaultGuessFromStatsConfig.stats, bst: true } });
    expect(all.map((entry) => entry.key)).toEqual(['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'bst']);
    expect(all.map((entry) => entry.value)).toEqual([60, 85, 70, 75, 80, 100, 470]); expect(pokemonBaseStatTotal(source)).toBe(470);
  });

  it('omits disabled stats and rejects configurations with fewer than two enabled stats', () => {
    expect(buildGuessFromStatsVisibleStats(pokemon[0]!, { ...defaultGuessFromStatsConfig, stats: twoStats }).map((entry) => entry.key)).toEqual(['hp', 'attack']);
    expect(() => guessFromStatsConfigSchema.parse({ ...defaultGuessFromStatsConfig, stats: { ...twoStats, attack: false } })).toThrow(/2 estadísticas/);
    expect(defaultGuessFromStatsConfig).toMatchObject({ roundSeconds: 30, rounds: 10, hintsEnabled: false, stats: { bst: false } });
  });

  it('accepts every Pokémon matching visible stats and ignores differences in hidden stats', () => {
    const config = { ...defaultGuessFromStatsConfig, stats: twoStats };
    expect(equivalentGuessFromStatsPokemon(pokemon[0]!, pokemon, config).map((entry) => entry.id)).toEqual(['alpha-1', 'beta-2', 'delta-4', 'alpha-mega-5', 'future-6']);
    expect(buildGuessFromStatsSignature(pokemon[0]!, config)).toBe(buildGuessFromStatsSignature(pokemon[1]!, config));
    expect(buildGuessFromStatsSignature(pokemon[0]!, config)).not.toBe(buildGuessFromStatsSignature(pokemon[2]!, config));
  });

  it('lets BST and only enabled hints participate in equivalence', () => {
    const bst = { ...defaultGuessFromStatsConfig, stats: { ...twoStats, bst: true } };
    expect(buildGuessFromStatsSignature(pokemon[0]!, bst)).not.toBe(buildGuessFromStatsSignature(pokemon[1]!, bst));
    const noHints = { ...defaultGuessFromStatsConfig, stats: twoStats, hintsEnabled: false };
    const withTypes = { ...noHints, hintsEnabled: true, hints: { ...defaultGuessFromStatsConfig.hints, generation: false, types: true, evolution: false } };
    expect(buildGuessFromStatsSignature(pokemon[0]!, noHints)).toBe(buildGuessFromStatsSignature(pokemon[3]!, noHints));
    expect(buildGuessFromStatsSignature(pokemon[0]!, withTypes)).not.toBe(buildGuessFromStatsSignature(pokemon[3]!, withTypes));
  });

  it('normalizes type sets and supports every reliable optional hint from second zero', () => {
    const config: GuessFromStatsConfig = { ...defaultGuessFromStatsConfig, stats: twoStats, hintsEnabled: true, hints: { generation: true, types: true, typeCount: true, evolution: true, height: true, weight: true, category: true } };
    expect(buildGuessFromStatsSignature(pokemon[0]!, config)).toBe(buildGuessFromStatsSignature(pokemon[4]!, config));
    expect(buildGuessFromStatsHints(pokemon[0]!, config).map((hint) => hint.kind)).toEqual(['GENERATION', 'TYPES', 'TYPE_COUNT', 'EVOLUTION', 'HEIGHT', 'WEIGHT', 'CATEGORY']);
  });
});

describe('Guess from Stats authoritative rounds', () => {
  it('respects generations, includes stable forms and precalculates all equivalent accepted ids privately', () => {
    const fixture = setup(); const pool = guessFromStatsPool(fixture.state.config, fixture.context);
    expect(pool.map((entry) => entry.id)).toContain('alpha-mega-5'); expect(pool.map((entry) => entry.id)).not.toContain('future-6');
    const prepared = fixture.state.roundDeck[0]!; const source = catalog.byId(prepared.sourcePokemonId)!;
    expect(prepared.acceptedPokemonIds).toEqual(equivalentGuessFromStatsPokemon(source, pool, fixture.state.config).map((entry) => entry.id));
  });

  it('does not expose source, signature, accepted ids or their count during an active round or reconnection', () => {
    const fixture = setup(); const prepared = fixture.state.roundDeck[0]!;
    const restored = { game: guessFromStatsGame.getPublicState(fixture.state, fixture.context), player: guessFromStatsGame.getPlayerState(fixture.state, 'p1', fixture.context) }; const serialized = JSON.stringify(restored);
    expect(serialized).not.toContain(prepared.sourcePokemonId); expect(serialized).not.toContain('acceptedPokemonIds'); expect(serialized).not.toContain('signature');
    expect(restored.game).toMatchObject({ visibleStats: [{ key: 'hp', value: expect.any(Number) }, { key: 'attack', value: expect.any(Number) }], solvedPlayers: [], roundEndsAt: expect.any(Number) });
    expect(restored.game.hints).toEqual([]);
  });

  it('accepts two equivalent forms as different correct submissions in server processing order', () => {
    const fixture = setup({}, 3); const prepared = fixture.state.roundDeck[0]!; expect(prepared.acceptedPokemonIds.length).toBeGreaterThan(1); fixture.setNow(2_000);
    let state = guess(fixture.state, 'p2', prepared.acceptedPokemonIds[0]!, fixture.context).state;
    state = guess(state, 'p1', prepared.acceptedPokemonIds[1]!, fixture.context).state;
    expect(state.solves.p2).toMatchObject({ solveOrder: 1, submittedPokemonId: prepared.acceptedPokemonIds[0] }); expect(state.solves.p1).toMatchObject({ solveOrder: 2, submittedPokemonId: prepared.acceptedPokemonIds[1] });
    expect(state.solves.p2!.points).toBeGreaterThan(state.solves.p1!.points);
  });

  it('publishes multiple wrong attempts and enforces the one-second cooldown server-side', () => {
    const fixture = setup(); const prepared = fixture.state.roundDeck[0]!; const wrong = fixture.state.poolIds.find((id) => !prepared.acceptedPokemonIds.includes(id))!;
    let result = guess(fixture.state, 'p1', wrong, fixture.context); expect(result.accepted).toBe(true); expect(result.state.attempts[0]).toMatchObject({ playerId: 'p1', guessedPokemon: { id: wrong } });
    expect(guess(result.state, 'p1', wrong, fixture.context).accepted).toBe(false); fixture.setNow(1_000 + GUESS_FROM_STATS_COOLDOWN_MS);
    result = guess(result.state, 'p1', wrong, fixture.context); expect(result.state.attempts).toHaveLength(2);
  });

  it('rejects out-of-pool, solved and spectator guesses without trusting client ordering', () => {
    const fixture = setup(); const answer = fixture.state.roundDeck[0]!.acceptedPokemonIds[0]!; const state = guess(fixture.state, 'p1', answer, fixture.context).state;
    expect(guess(state, 'p1', answer, fixture.context).accepted).toBe(false); expect(guess(state, 'spectator', answer, fixture.context).accepted).toBe(false); expect(guess(state, 'p2', 'future-6', fixture.context).accepted).toBe(false);
    fixture.context.players[1]!.connected = false; expect(guess(state, 'p2', answer, fixture.context).accepted).toBe(false);
  });

  it('ends early when all connected required players solve and disconnected players never block', () => {
    const fixture = setup(); fixture.context.players[1]!.connected = false; const answer = fixture.state.roundDeck[0]!.acceptedPokemonIds[0]!;
    expect(guess(fixture.state, 'p1', answer, fixture.context).state.phase).toBe('ROUND_RESULTS');
  });

  it('reveals every valid answer, each chosen answer, complete stats and advances after four seconds', () => {
    const fixture = setup(); const prepared = fixture.state.roundDeck[0]!; fixture.setNow(2_000); let state = guess(fixture.state, 'p1', prepared.acceptedPokemonIds[0]!, fixture.context).state;
    fixture.setNow(state.roundEndsAt!); state = guessFromStatsGame.handleTimeout(state, fixture.context); const view = guessFromStatsGame.getPublicState(state, fixture.context);
    expect(view.lastRound?.answers.map((entry) => entry.id).sort()).toEqual([...prepared.acceptedPokemonIds].sort()); expect(view.lastRound?.answers[0]).toMatchObject({ hp: expect.any(Number), bst: expect.any(Number) });
    expect(view.lastRound?.solves.p1?.submittedPokemon.id).toBe(prepared.acceptedPokemonIds[0]); expect(state.nextTransitionAt).toBe(fixture.context.now + GUESS_FROM_STATS_REVEAL_MS);
    fixture.setNow(state.nextTransitionAt!); state = guessFromStatsGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundNumber).toBe(2);
  });

  it('records missed rounds and finishes with points, firsts, first try and solve-time statistics', () => {
    const fixture = setup({ rounds: 1 }); const answer = fixture.state.roundDeck[0]!.acceptedPokemonIds[0]!; fixture.setNow(2_500); let state = guess(fixture.state, 'p1', answer, fixture.context).state;
    fixture.setNow(state.roundEndsAt!); state = guessFromStatsGame.handleTimeout(state, fixture.context); fixture.setNow(state.nextTransitionAt!); state = guessFromStatsGame.handleTimeout(state, fixture.context);
    const results = guessFromStatsGame.getResults(state); expect(results.standings[0]).toMatchObject({ playerId: 'p1', position: 1, stats: { correct: 1, firstTry: 1, roundFirsts: 1, bestTimeMs: 1500 } }); expect(results.standings[1]).toMatchObject({ playerId: 'p2', stats: { missed: 1 } });
  });
});
