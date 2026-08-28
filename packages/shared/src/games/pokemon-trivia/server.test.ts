import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultPokemonTriviaConfig } from './config.js';
import { pokemonTriviaPoints } from './rules.js';
import { pokemonTriviaGame } from './server.js';
import type { PokemonTriviaPlayerState, PokemonTriviaState } from './types.js';

const pokemon: Pokemon[] = [
  { id: 'bulbasaur', nationalDexNumber: 1, name: 'Bulbasaur', generation: 1, sprite: '/1.png', hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45, baseStatTotal: 318, heightDecimeters: 7, weightHectograms: 69, types: ['grass', 'poison'] },
  { id: 'charmander', nationalDexNumber: 4, name: 'Charmander', generation: 1, sprite: '/4.png', hp: 39, attack: 52, defense: 43, specialAttack: 60, specialDefense: 50, speed: 65, baseStatTotal: 309, heightDecimeters: 6, weightHectograms: 85, types: ['fire'] },
  { id: 'squirtle', nationalDexNumber: 7, name: 'Squirtle', generation: 1, sprite: '/7.png', hp: 44, attack: 48, defense: 65, specialAttack: 50, specialDefense: 64, speed: 43, baseStatTotal: 314, heightDecimeters: 5, weightHectograms: 90, types: ['water'] },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: '/25.png', hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90, baseStatTotal: 320, heightDecimeters: 4, weightHectograms: 60, types: ['electric'] },
  { id: 'chikorita', nationalDexNumber: 152, name: 'Chikorita', generation: 2, sprite: '/152.png', hp: 45, attack: 49, defense: 65, specialAttack: 49, specialDefense: 65, speed: 45, baseStatTotal: 318, heightDecimeters: 9, weightHectograms: 64, types: ['grass'] },
  { id: 'cyndaquil', nationalDexNumber: 155, name: 'Cyndaquil', generation: 2, sprite: '/155.png', hp: 39, attack: 52, defense: 43, specialAttack: 60, specialDefense: 50, speed: 65, baseStatTotal: 309, heightDecimeters: 5, weightHectograms: 79, types: ['fire'] },
  { id: 'totodile', nationalDexNumber: 158, name: 'Totodile', generation: 2, sprite: '/158.png', hp: 50, attack: 65, defense: 64, specialAttack: 44, specialDefense: 48, speed: 43, baseStatTotal: 314, heightDecimeters: 6, weightHectograms: 95, types: ['water'] },
  { id: 'lugia', nationalDexNumber: 249, name: 'Lugia', generation: 2, sprite: '/249.png', hp: 106, attack: 90, defense: 130, specialAttack: 90, specialDefense: 154, speed: 110, baseStatTotal: 680, heightDecimeters: 52, weightHectograms: 2160, types: ['psychic', 'flying'] },
];
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number), forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)) };

function setup(questionTypes: typeof defaultPokemonTriviaConfig.questionTypes = ['TYPE'], playerCount = 2) {
  const context: GameContext = { players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })), pokemon: catalog, now: 1_000, random: () => 0 };
  let state = pokemonTriviaGame.createInitialState({ ...defaultPokemonTriviaConfig, generations: [1, 2], rounds: 2, questionTypes }, context);
  state = pokemonTriviaGame.start(state, context);
  return { context, state, setNow(now: number) { context.now = now; } };
}

function answer(state: PokemonTriviaState, playerId: string, optionId: 'A' | 'B' | 'C' | 'D', context: GameContext) {
  return pokemonTriviaGame.handleAction(state, playerId, { type: 'ANSWER', optionId }, context);
}

describe('Pokémon Trivia', () => {
  it('validates lobby limits and can build every objective question type', () => {
    expect(() => pokemonTriviaGame.configSchema.parse({ ...defaultPokemonTriviaConfig, questionTypes: [] })).toThrow();
    expect(() => pokemonTriviaGame.configSchema.parse({ ...defaultPokemonTriviaConfig, roundSeconds: 5 })).toThrow();
    expect(() => pokemonTriviaGame.configSchema.parse({ ...defaultPokemonTriviaConfig, generations: [1], questionTypes: ['GENERATION'] })).toThrow(/dos generaciones/);
    for (const type of defaultPokemonTriviaConfig.questionTypes) expect(setup([type]).state.question?.type).toBe(type);
  });

  it('does not expose the answer through public or reconnect projections', () => {
    const fixture = setup();
    const projection = { game: pokemonTriviaGame.getPublicState(fixture.state, fixture.context), player: pokemonTriviaGame.getPlayerState(fixture.state, 'p1', fixture.context) };
    expect(projection.game.lastRound).toBeNull();
    expect(JSON.stringify(projection)).not.toMatch(/correctOptionId|fact|respuesta correcta/i);
    expect(fixture.state.question?.correctOptionId).toBeTruthy();
  });

  it('locks one server-authoritative answer and rejects spectators, duplicates and late submissions', () => {
    const fixture = setup(); const correct = fixture.state.question!.correctOptionId;
    let result = answer(fixture.state, 'watcher', correct, fixture.context); expect(result.accepted).toBe(false);
    result = answer(fixture.state, 'p1', correct, fixture.context); expect(result.accepted).toBe(true);
    expect(answer(result.state, 'p1', correct, fixture.context).accepted).toBe(false);
    expect((pokemonTriviaGame.getPlayerState(result.state, 'p1', fixture.context) as PokemonTriviaPlayerState).answer?.optionId).toBe(correct);
    fixture.setNow(result.state.roundEndsAt!); expect(answer(result.state, 'p2', correct, fixture.context).accepted).toBe(false);
  });

  it('scores correct answers by real server time and gives no points to wrong answers', () => {
    const fixture = setup(); const correct = fixture.state.question!.correctOptionId; const wrong = fixture.state.question!.options.find((option) => option.id !== correct)!.id;
    fixture.setNow(6_000); let state = answer(fixture.state, 'p1', correct, fixture.context).state;
    fixture.setNow(7_000); state = answer(state, 'p2', wrong, fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound?.points.p1).toBe(pokemonTriviaPoints(1_000, 20, 6_000)); expect(state.lastRound?.points.p2).toBe(0);
    expect(state.playerStats.p1).toMatchObject({ answers: 1, correct: 1 }); expect(state.playerStats.p2).toMatchObject({ answers: 1, incorrect: 1 });
  });

  it('stops waiting for disconnected players and preserves accepted answers across reconnect', () => {
    const fixture = setup(); fixture.context.players[1]!.connected = false;
    const state = answer(fixture.state, 'p1', fixture.state.question!.correctOptionId, fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    fixture.context.players[1]!.connected = true;
    expect((pokemonTriviaGame.getPlayerState(state, 'p1', fixture.context) as PokemonTriviaPlayerState).answer).not.toBeNull();
  });

  it('handles timeout, reveal, next round and final competition ranking', () => {
    const fixture = setup(); fixture.setNow(fixture.state.roundEndsAt!);
    let state = pokemonTriviaGame.handleTimeout(fixture.state, fixture.context); expect(state.phase).toBe('ROUND_RESULTS'); expect(state.playerStats.p1?.unanswered).toBe(1);
    expect(pokemonTriviaGame.getPublicState(state, fixture.context).lastRound?.correctOptionId).toBeTruthy();
    fixture.setNow(state.nextTransitionAt!); state = pokemonTriviaGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundNumber).toBe(2);
    fixture.setNow(state.roundEndsAt!); state = pokemonTriviaGame.handleTimeout(state, fixture.context); fixture.setNow(state.nextTransitionAt!); state = pokemonTriviaGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS'); expect(pokemonTriviaGame.getResults(state).standings).toHaveLength(2);
  });
});
