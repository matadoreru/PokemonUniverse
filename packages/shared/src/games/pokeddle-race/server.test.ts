import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultPokeddleRaceConfig } from './config.js';
import { buildPokeddleFeedback, comparePokeddleNumber, comparePokeddleTypes } from './rules.js';
import { POKEDDLE_REVEAL_MS, pokeddleRaceGame } from './server.js';
import type { PokeddleRaceState } from './types.js';

function mon(id: string, dex: number, generation: number, types: Pokemon['types'], values: Partial<Pokemon> = {}): Pokemon {
  return { id, nationalDexNumber: dex, name: id[0]!.toUpperCase() + id.slice(1), generation, sprite: `/${id}.png`, hp: dex, attack: dex + 1, defense: dex + 2, specialAttack: dex + 3, specialDefense: dex + 4, speed: dex + 5, baseStatTotal: dex * 6 + 15, types, heightDecimeters: dex + 5, weightHectograms: dex + 10, evolutionStage: 1, evolutionStageCount: 3, legendaryStatus: 'NORMAL', color: 'red', abilities: ['blaze'], ...values };
}
const pokemon = [
  mon('alpha', 10, 1, ['fire']),
  mon('beta', 20, 1, ['fire', 'flying'], { evolutionStage: 2, color: 'blue', abilities: ['blaze', 'flight'] }),
  mon('gamma', 30, 2, ['water', 'ground'], { evolutionStage: 3, legendaryStatus: 'LEGENDARY', color: 'green', abilities: ['torrent'] }),
];
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number), forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)) };

function setup(playerCount = 2, overrides: Partial<typeof defaultPokeddleRaceConfig> = {}, random = () => 0.99) {
  let now = 1_000; const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now, random };
  const config = { ...defaultPokeddleRaceConfig, generations: [1, 2], maxRounds: 3, clues: { ...defaultPokeddleRaceConfig.clues }, ...overrides };
  let state = pokeddleRaceGame.createInitialState(config, context); state = pokeddleRaceGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; context.now = value; } };
}
function guess(state: PokeddleRaceState, playerId: string, pokemonId: string, context: GameContext) { return pokeddleRaceGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context); }

describe('Pokédle Race configuration and secret assignment', () => {
  it('validates generations, timer, rounds and requires a clue when starting', () => {
    expect(() => pokeddleRaceGame.configSchema.parse({ ...defaultPokeddleRaceConfig, generations: [] })).toThrow();
    expect(() => pokeddleRaceGame.configSchema.parse({ ...defaultPokeddleRaceConfig, roundSeconds: 9 })).toThrow();
    expect(() => pokeddleRaceGame.configSchema.parse({ ...defaultPokeddleRaceConfig, maxRounds: 31 })).toThrow();
    const fixture = setup(); const noClues = { ...defaultPokeddleRaceConfig, clues: Object.fromEntries(Object.keys(defaultPokeddleRaceConfig.clues).map((key) => [key, false])) };
    expect(() => pokeddleRaceGame.createInitialState(noClues as typeof defaultPokeddleRaceConfig, fixture.context)).toThrow(/al menos una pista/);
  });

  it('assigns unique in-pool secrets and only reuses after exhausting a restrictive pool', () => {
    const unique = setup(3); expect(new Set(Object.values(unique.state.secretPokemonIds)).size).toBe(3);
    const reused = setup(3, { generations: [1] }); const secrets = Object.values(reused.state.secretPokemonIds);
    expect(new Set(secrets).size).toBe(2); expect(secrets[2]).toBe(secrets[0]);
  });

  it('never exposes unresolved secrets in public or reconnection state', () => {
    const fixture = setup(); const publicState = pokeddleRaceGame.getPublicState(fixture.state, fixture.context); const privateState = pokeddleRaceGame.getPlayerState(fixture.state, 'p1', fixture.context);
    for (const secret of Object.values(fixture.state.secretPokemonIds)) { expect(JSON.stringify(publicState)).not.toContain(secret); expect(JSON.stringify(privateState)).not.toContain(secret); }
    expect(JSON.stringify(publicState)).not.toContain('secretPokemon');
  });
});

describe('Pokédle Race feedback', () => {
  it('compares every numeric direction toward the secret', () => { expect(comparePokeddleNumber(10, 20)).toBe('HIGHER'); expect(comparePokeddleNumber(20, 10)).toBe('LOWER'); expect(comparePokeddleNumber(10, 10)).toBe('MATCH'); });
  it('handles exact, partial, absent and mono-versus-dual type sets without order dependence', () => {
    expect(comparePokeddleTypes(['fire', 'flying'], ['flying', 'fire'])).toBe('EXACT');
    expect(comparePokeddleTypes(['fire'], ['fire'])).toBe('EXACT'); expect(comparePokeddleTypes(['fire'], ['fire', 'flying'])).toBe('PARTIAL'); expect(comparePokeddleTypes(['fire'], ['water'])).toBe('NONE');
  });
  it('builds stats, physical, total, evolution, category, color and ability feedback on the server', () => {
    const config = { ...defaultPokeddleRaceConfig, clues: Object.fromEntries(Object.keys(defaultPokeddleRaceConfig.clues).map((key) => [key, true])) } as typeof defaultPokeddleRaceConfig;
    const feedback = buildPokeddleFeedback(pokemon[0]!, pokemon[1]!, config);
    for (const key of ['generation', 'dexNumber', 'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal', 'height', 'weight', 'typeCount']) expect(feedback[key as keyof typeof feedback]).toMatchObject({ result: expect.any(String) });
    expect(feedback.types).toMatchObject({ result: 'PARTIAL' }); expect(feedback.evolutionStage).toMatchObject({ result: 'HIGHER' }); expect(feedback.legendaryStatus).toMatchObject({ result: 'MATCH' }); expect(feedback.color).toMatchObject({ result: 'NONE' }); expect(feedback.abilities).toMatchObject({ result: 'PARTIAL', matches: 1 });
  });
});

describe('Pokédle Race synchronized rounds', () => {
  it('accepts one in-pool guess, locks it, and resolves early when every connected active player answers', () => {
    const fixture = setup(); let state = guess(fixture.state, 'p1', 'alpha', fixture.context).state;
    expect(state.phase).toBe('ROUND_ACTIVE'); expect(guess(state, 'p1', 'beta', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/respondido/) });
    state = guess(state, 'p2', 'beta', fixture.context).state; expect(state.phase).toBe('ROUND_RESULTS'); expect(state.boards.p1).toHaveLength(1); expect(state.boards.p2).toHaveLength(1);
  });

  it('rejects guesses outside configured generations', () => { const fixture = setup(2, { generations: [1] }); expect(guess(fixture.state, 'p1', 'gamma', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/pool/) }); });

  it('records timeout as NO_GUESS without invented feedback or a valid attempt', () => {
    const fixture = setup(); fixture.setNow(fixture.state.roundEndsAt!); const state = pokeddleRaceGame.handleTimeout(fixture.state, fixture.context);
    expect(state.boards.p1?.[0]).toEqual({ round: 1, status: 'NO_GUESS', guessedPokemon: null, feedback: null, correct: false, submittedAt: null });
    expect(state.playerStats.p1).toMatchObject({ roundsParticipated: 1, validGuesses: 0, missedRounds: 1 });
  });

  it('does not wait for a disconnected player and preserves an already accepted guess', () => {
    const fixture = setup(); let state = guess(fixture.state, 'p1', 'alpha', fixture.context).state; fixture.context.players[1]!.connected = false;
    state = pokeddleRaceGame.handlePresenceChange!(state, fixture.context); expect(state.phase).toBe('ROUND_RESULTS'); expect(state.boards.p1?.[0]?.status).toBe('GUESS'); expect(state.boards.p2?.[0]?.status).toBe('NO_GUESS');
  });

  it('reveals solved targets, removes solved players from future waits, and continues for others', () => {
    const fixture = setup(); const secret1 = fixture.state.secretPokemonIds.p1!; let state = guess(fixture.state, 'p1', secret1, fixture.context).state; state = guess(state, 'p2', 'alpha', fixture.context).state;
    const view = pokeddleRaceGame.getPublicState(state, fixture.context); expect(view.boards.p1?.revealedPokemon?.id).toBe(secret1); expect(view.activePlayerIds).toEqual(['p2']);
    fixture.setNow(state.nextTransitionAt!); state = pokeddleRaceGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('ROUND_ACTIVE');
    fixture.context.now += 1; state = guess(state, 'p2', state.secretPokemonIds.p2!, fixture.context).state; expect(state.phase).toBe('ROUND_RESULTS'); expect(state.boards.p1).toHaveLength(1); expect(guess(state, 'p1', secret1, fixture.context).accepted).toBe(false);
  });

  it('finishes after all solve or after max rounds and reveals every remaining target', () => {
    const all = setup(); let state = guess(all.state, 'p1', all.state.secretPokemonIds.p1!, all.context).state; state = guess(state, 'p2', state.secretPokemonIds.p2!, all.context).state; all.setNow(state.nextTransitionAt!); state = pokeddleRaceGame.handleTimeout(state, all.context); expect(state.phase).toBe('GAME_RESULTS');
    const max = setup(2, { maxRounds: 1 }); max.setNow(max.state.roundEndsAt!); const revealState = pokeddleRaceGame.handleTimeout(max.state, max.context); max.setNow(revealState.nextTransitionAt!); const finished = pokeddleRaceGame.handleTimeout(revealState, max.context); const view = pokeddleRaceGame.getPublicState(finished, max.context); expect(finished.phase).toBe('GAME_RESULTS'); expect(Object.values(view.boards).every((board) => board.revealedPokemon)).toBe(true);
  });

  it('orders by solve round, valid guesses and timestamp, awards dynamic points only to solvers', () => {
    const fixture = setup(3); const state = { ...fixture.state, solved: { p1: { round: 2, validGuesses: 1, solvedAt: 5_000 }, p2: { round: 1, validGuesses: 1, solvedAt: 4_000 } }, playerStats: { p1: { roundsParticipated: 2, validGuesses: 1, missedRounds: 1 }, p2: { roundsParticipated: 1, validGuesses: 1, missedRounds: 0 }, p3: { roundsParticipated: 3, validGuesses: 2, missedRounds: 1 } } };
    const results = pokeddleRaceGame.getResults(state); expect(results.standings.map((entry) => entry.playerId)).toEqual(['p2', 'p1', 'p3']); expect(results.winnerId).toBe('p2'); expect(results.standings.map((entry) => entry.points)).toEqual([6, 3, 0]);
  });

  it('uses the configured authoritative timer and reveal transition', () => { const fixture = setup(2, { roundSeconds: 45 }); expect(fixture.state.roundEndsAt).toBe(46_000); fixture.setNow(46_000); const state = pokeddleRaceGame.handleTimeout(fixture.state, fixture.context); expect(state.nextTransitionAt).toBe(46_000 + POKEDDLE_REVEAL_MS); });
});
