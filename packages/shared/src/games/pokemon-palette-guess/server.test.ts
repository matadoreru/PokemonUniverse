import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultPokemonPaletteGuessConfig } from './config.js';
import { pokemonPaletteScore } from './rules.js';
import { POKEMON_PALETTE_COOLDOWN_MS, pokemonPaletteGuessGame, pokemonPalettePool } from './server.js';
import type { PokemonPaletteGuessPlayerState, PokemonPaletteGuessState } from './types.js';

const palette = ['#183048', '#d86048', '#f0c030', '#4878c0', '#78a848', '#d8d8d8'];
const pokemon: Pokemon[] = [
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: '/25.png', palette, hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90, baseStatTotal: 320, types: ['electric'] },
  { id: 'raichu', nationalDexNumber: 26, name: 'Raichu', generation: 1, sprite: '/26.png', palette: [...palette].reverse(), hp: 60, attack: 90, defense: 55, specialAttack: 90, specialDefense: 80, speed: 110, baseStatTotal: 485, types: ['electric'] },
  { id: 'mew', nationalDexNumber: 151, name: 'Mew', generation: 1, sprite: '/151.png', palette: palette.slice(0, 3), hp: 100, attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100, baseStatTotal: 600, types: ['psychic'] },
];
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number), forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)) };
function setup(paletteSize = 5, players = 2) { const context: GameContext = { players: Array.from({ length: players }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })), pokemon: catalog, now: 1_000, random: () => 0 }; let state = pokemonPaletteGuessGame.createInitialState({ ...defaultPokemonPaletteGuessConfig, generations: [1], rounds: 2, paletteSize }, context); state = pokemonPaletteGuessGame.start(state, context); return { context, state, setNow(now: number) { context.now = now; } }; }
const guess = (state: PokemonPaletteGuessState, playerId: string, pokemonId: string, context: GameContext) => pokemonPaletteGuessGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context);

describe('Adivina por la Paleta', () => {
  it('validates configuration and excludes Pokémon without enough persisted colours', () => {
    expect(() => pokemonPaletteGuessGame.configSchema.parse({ ...defaultPokemonPaletteGuessConfig, paletteSize: 2 })).toThrow();
    expect(pokemonPalettePool({ ...defaultPokemonPaletteGuessConfig, generations: [1], paletteSize: 5 }, setup().context).map(({ id }) => id)).toEqual(['pikachu', 'raichu']);
    expect(pokemonPalettePool({ ...defaultPokemonPaletteGuessConfig, generations: [1], paletteSize: 3 }, setup().context)).toHaveLength(3);
  });

  it('publishes only palette clues and keeps target identity private through reconnect', () => {
    const fixture = setup(); const projection = { game: pokemonPaletteGuessGame.getPublicState(fixture.state, fixture.context), player: pokemonPaletteGuessGame.getPlayerState(fixture.state, 'p1', fixture.context) };
    expect(projection.game.colors).toEqual(palette.slice(0, 5)); expect(JSON.stringify(projection)).not.toMatch(/pikachu|targetPokemonId|\/25\.png/i);
  });

  it('supports attempts, cooldown and server-time scoring', () => {
    const fixture = setup(); let state = guess(fixture.state, 'p1', 'raichu', fixture.context).state; expect(state.attempts).toHaveLength(1); expect(guess(state, 'p1', 'pikachu', fixture.context).accepted).toBe(false);
    fixture.setNow(1_000 + POKEMON_PALETTE_COOLDOWN_MS); state = guess(state, 'p1', 'pikachu', fixture.context).state; expect(state.solves.p1).toMatchObject({ solveOrder: 1, attempts: 2, points: 13 });
    expect(pokemonPaletteScore(1_000, 25, 13_500, 2)).toEqual({ speedPoints: 5, placementBonus: 2, totalPoints: 7 });
  });

  it('rejects spectators, disconnected players and duplicate solves', () => {
    const fixture = setup(); expect(guess(fixture.state, 'watcher', 'pikachu', fixture.context).accepted).toBe(false); fixture.context.players[0]!.connected = false; expect(guess(fixture.state, 'p1', 'pikachu', fixture.context).accepted).toBe(false);
    fixture.context.players[0]!.connected = true; const state = guess(fixture.state, 'p1', 'pikachu', fixture.context).state; expect(guess(state, 'p1', 'pikachu', fixture.context).accepted).toBe(false);
  });

  it('does not wait for disconnected players and restores the accepted solve', () => {
    const fixture = setup(); fixture.context.players[1]!.connected = false; const state = guess(fixture.state, 'p1', 'pikachu', fixture.context).state; expect(state.phase).toBe('ROUND_RESULTS'); expect((pokemonPaletteGuessGame.getPlayerState(state, 'p1', fixture.context) as PokemonPaletteGuessPlayerState)).toMatchObject({ solved: true, solveOrder: 1 });
  });

  it('reveals, avoids immediate repetition and reaches final ranking', () => {
    const fixture = setup(); fixture.setNow(fixture.state.roundEndsAt!); let state = pokemonPaletteGuessGame.handleTimeout(fixture.state, fixture.context); expect(pokemonPaletteGuessGame.getPublicState(state, fixture.context).lastRound?.pokemon.name).toBe('Pikachu');
    fixture.setNow(state.nextTransitionAt!); state = pokemonPaletteGuessGame.handleTimeout(state, fixture.context); expect(state.targetPokemonId).toBe('raichu'); fixture.setNow(state.roundEndsAt!); state = pokemonPaletteGuessGame.handleTimeout(state, fixture.context); fixture.setNow(state.nextTransitionAt!); state = pokemonPaletteGuessGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('GAME_RESULTS'); expect(pokemonPaletteGuessGame.getResults(state).standings).toHaveLength(2);
  });
});
