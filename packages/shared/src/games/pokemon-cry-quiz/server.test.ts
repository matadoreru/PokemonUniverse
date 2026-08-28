import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonAudioCatalog, PokemonCatalog } from '../../index.js';
import { defaultPokemonCryQuizConfig } from './config.js';
import { pokemonCryScore } from './rules.js';
import { POKEMON_CRY_COOLDOWN_MS, pokemonCryPool, pokemonCryQuizGame } from './server.js';
import type { PokemonCryQuizState } from './types.js';

const pokemon: Pokemon[] = [
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png', hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90, baseStatTotal: 320, types: ['electric'] },
  { id: 'raichu', nationalDexNumber: 26, name: 'Raichu', generation: 1, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/26.png', hp: 60, attack: 90, defense: 55, specialAttack: 90, specialDefense: 80, speed: 110, baseStatTotal: 485, types: ['electric'] },
  { id: 'lucario', nationalDexNumber: 448, name: 'Lucario', generation: 4, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/448.png', hp: 70, attack: 110, defense: 70, specialAttack: 115, specialDefense: 70, speed: 90, baseStatTotal: 525, types: ['fighting', 'steel'] },
];
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number), forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)) };
const audio: PokemonAudioCatalog = {
  cryFor: (id, version) => id === 'lucario' && version === 'LEGACY' ? null : `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/${version.toLowerCase()}/${id}.ogg`,
  pokemonIds: () => pokemon.map(({ id }) => id),
};

function setup(config: Partial<typeof defaultPokemonCryQuizConfig> = {}, playerCount = 2) {
  const context: GameContext = { players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })), pokemon: catalog, pokemonAudio: audio, now: 1_000, random: () => 0, roomCode: 'ABC234' };
  let state = pokemonCryQuizGame.createInitialState({ ...defaultPokemonCryQuizConfig, generations: [1, 4], rounds: 2, ...config }, context); state = pokemonCryQuizGame.start(state, context);
  return { context, state, now(value: number) { context.now = value; } };
}

const guess = (state: PokemonCryQuizState, playerId: string, pokemonId: string, context: GameContext) => pokemonCryQuizGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context);

describe('Adivina el Grito', () => {
  it('validates configuration and uses only PostgreSQL-backed available cries', () => {
    expect(defaultPokemonCryQuizConfig).toMatchObject({ roundSeconds: 20, rounds: 10, cryVersion: 'LATEST' });
    expect(() => pokemonCryQuizGame.configSchema.parse({ ...defaultPokemonCryQuizConfig, generations: [] })).toThrow();
    expect(() => pokemonCryQuizGame.configSchema.parse({ ...defaultPokemonCryQuizConfig, roundSeconds: 9 })).toThrow();
    const context = setup().context;
    expect(pokemonCryPool({ ...defaultPokemonCryQuizConfig, generations: [4], cryVersion: 'LEGACY' }, context)).toEqual([]);
    const withoutAudio: GameContext = { ...context }; delete withoutAudio.pokemonAudio;
    expect(() => pokemonCryQuizGame.createInitialState(defaultPokemonCryQuizConfig, withoutAudio)).toThrow(/catálogo local/);
  });

  it('keeps target identity and raw cry URL out of active and reconnect projections', () => {
    const fixture = setup({ generations: [1] });
    const projection = { game: pokemonCryQuizGame.getPublicState(fixture.state, fixture.context), player: pokemonCryQuizGame.getPlayerState(fixture.state, 'p1', fixture.context) };
    expect(projection.game.cryUrl).toMatch(/\/options\/cry\/audio$/);
    expect(JSON.stringify(projection)).not.toMatch(/pikachu|raw\.githubusercontent|targetPokemon|latest\/pikachu/i);
    expect(pokemonCryQuizGame.resolveAsset!(fixture.state, { assetToken: fixture.state.assetToken, roundNumber: 1, assetId: 'cry' }, fixture.context)).toMatch(/raw\.githubusercontent/);
    expect(pokemonCryQuizGame.resolveAsset!(fixture.state, { assetToken: 'wrong', roundNumber: 1, assetId: 'cry' }, fixture.context)).toBeNull();
  });

  it('accepts multiple attempts, enforces cooldown and scores correct guesses by speed and order', () => {
    const fixture = setup({ generations: [1] }); let state = guess(fixture.state, 'p1', 'raichu', fixture.context).state;
    expect(state.attempts).toHaveLength(1); expect(guess(state, 'p1', 'pikachu', fixture.context).accepted).toBe(false);
    fixture.now(1_000 + POKEMON_CRY_COOLDOWN_MS); state = guess(state, 'p1', 'pikachu', fixture.context).state;
    expect(state.solves.p1).toMatchObject({ solveOrder: 1, attempts: 2, points: 13 });
    fixture.now(3_000); state = guess(state, 'p2', 'pikachu', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.solves.p2).toMatchObject({ solveOrder: 2 });
    expect(pokemonCryScore(1_000, 20, 11_000, 3)).toEqual({ speedPoints: 5, placementBonus: 1, totalPoints: 6 });
  });

  it('rejects spectators, disconnected players, duplicates and out-of-pool guesses', () => {
    const fixture = setup({ generations: [1] });
    expect(guess(fixture.state, 'watcher', 'pikachu', fixture.context).accepted).toBe(false);
    expect(guess(fixture.state, 'p1', 'lucario', fixture.context).accepted).toBe(false);
    fixture.context.players[0]!.connected = false; expect(guess(fixture.state, 'p1', 'pikachu', fixture.context).accepted).toBe(false);
    fixture.context.players[0]!.connected = true; const solved = guess(fixture.state, 'p1', 'pikachu', fixture.context).state;
    expect(guess(solved, 'p1', 'pikachu', fixture.context).accepted).toBe(false);
  });

  it('does not wait for disconnected players and restores authoritative solved state', () => {
    const fixture = setup({ generations: [1] }); fixture.context.players[1]!.connected = false;
    const state = guess(fixture.state, 'p1', 'pikachu', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(pokemonCryQuizGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ solved: true, canGuess: false, solveOrder: 1 });
  });

  it('reveals the answer, advances rounds, avoids repetition and returns final rankings', () => {
    const fixture = setup({ generations: [1], rounds: 2 }); fixture.now(fixture.state.roundEndsAt!);
    let state = pokemonCryQuizGame.handleTimeout(fixture.state, fixture.context); let view = pokemonCryQuizGame.getPublicState(state, fixture.context);
    expect(view.lastRound?.pokemon.name).toBe('Pikachu'); expect(view.lastRound?.cryUrl).toMatch(/\/audio$/);
    fixture.now(state.nextTransitionAt!); state = pokemonCryQuizGame.handleTimeout(state, fixture.context); expect(state.targetPokemonId).toBe('raichu');
    fixture.now(state.roundEndsAt!); state = pokemonCryQuizGame.handleTimeout(state, fixture.context); fixture.now(state.nextTransitionAt!); state = pokemonCryQuizGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS'); view = pokemonCryQuizGame.getPublicState(state, fixture.context); expect(view.results?.standings).toHaveLength(2);
  });

  it('uses only an actually available lane in random cry mode', () => {
    const fixture = setup({ generations: [4], cryVersion: 'RANDOM' });
    expect(fixture.state.targetPokemonId).toBe('lucario'); expect(fixture.state.currentCryVersion).toBe('LATEST');
  });
});
