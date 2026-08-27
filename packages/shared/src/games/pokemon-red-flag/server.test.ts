import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultPokemonRedFlagConfig } from './config.js';
import { POKEMON_RED_FLAG_WIN_POINTS } from './rules.js';
import { pokemonRedFlagGame } from './server.js';
import type { PokemonRedFlagState } from './types.js';

function mon(id: string, number: number): Pokemon {
  return { id, nationalDexNumber: number, name: id, generation: 1, isDefault: true, sprite: `/${id}.png`, hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50, baseStatTotal: 300, types: ['normal'], legendaryStatus: 'NORMAL' };
}
const entries = Array.from({ length: 8 }, (_, index) => mon(`pokemon-${index + 1}`, index + 1));
const catalog: PokemonCatalog = {
  all: () => entries, byId: (id) => entries.find((pokemon) => pokemon.id === id), byDexNumber: (number) => entries.find((pokemon) => pokemon.nationalDexNumber === number),
  forGenerations: (generations) => entries.filter((pokemon) => generations.includes(pokemon.generation)),
};

function setup(overrides: Partial<typeof defaultPokemonRedFlagConfig> = {}, playerCount = 3) {
  let now = 1_000;
  const context: GameContext = {
    players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })),
    pokemon: catalog, get now() { return now; }, random: () => 0,
  };
  const config = { ...defaultPokemonRedFlagConfig, generations: [1], rounds: 1, ...overrides };
  let state = pokemonRedFlagGame.createInitialState(config, context); state = pokemonRedFlagGame.start(state, context);
  return { context, state, setNow(value: number) { now = value; } };
}

function answer(state: PokemonRedFlagState, playerId: string, text: string, context: GameContext) {
  return pokemonRedFlagGame.handleAction(state, playerId, { type: 'SUBMIT_RED_FLAG', text }, context);
}
function vote(state: PokemonRedFlagState, playerId: string, authorId: string, context: GameContext) {
  return pokemonRedFlagGame.handleAction(state, playerId, { type: 'VOTE_RED_FLAG', answerId: state.answerSlots[authorId]! }, context);
}

describe('Pokémon Red Flag rules', () => {
  it('requires three players and defaults to five configurable 30-second rounds', () => {
    expect(defaultPokemonRedFlagConfig).toMatchObject({ rounds: 5, phaseSeconds: 30 });
    expect(() => setup({}, 2)).toThrow(/al menos 3/);
    expect(setup().state.pokemonDeckIds).toHaveLength(entries.length);
  });

  it('locks answers and keeps their text private until anonymous voting', () => {
    const fixture = setup();
    const result = answer(fixture.state, 'p1', 'Te pide la contraseña del wifi antes de saludarte.', fixture.context);
    expect(result.accepted).toBe(true);
    const publicState = pokemonRedFlagGame.getPublicState(result.state, fixture.context);
    expect(publicState.submittedPlayerIds).toEqual(['p1']); expect(publicState.revealedAnswers).toEqual([]);
    expect(JSON.stringify(publicState)).not.toContain('contraseña');
    expect(pokemonRedFlagGame.getPlayerState(result.state, 'p1', fixture.context)).toMatchObject({ ownAnswer: { text: expect.stringContaining('contraseña') }, canSubmit: false });
    expect(pokemonRedFlagGame.getPlayerState(result.state, 'p2', fixture.context)).toMatchObject({ ownAnswer: null });
    expect(answer(result.state, 'p1', 'Intenta cambiarla.', fixture.context)).toMatchObject({ accepted: false, error: 'Tu red flag ya está bloqueada.' });
  });

  it('reveals anonymous entries, rejects self-votes and hides ballot targets', () => {
    const fixture = setup(); let state = fixture.state;
    for (const playerId of state.playerIds) state = answer(state, playerId, `Red flag divertida de ${playerId}.`, fixture.context).state;
    expect(state.phase).toBe('VOTING'); const publicState = pokemonRedFlagGame.getPublicState(state, fixture.context);
    expect(publicState.revealedAnswers).toHaveLength(3); expect(JSON.stringify(publicState.revealedAnswers)).not.toContain('authorId');
    expect(vote(state, 'p1', 'p1', fixture.context)).toMatchObject({ accepted: false, error: 'No puedes votar tu propia red flag.' });
    const accepted = vote(state, 'p1', 'p2', fixture.context); expect(accepted.accepted).toBe(true);
    const hiddenVote = pokemonRedFlagGame.getPublicState(accepted.state, fixture.context);
    expect(hiddenVote.votedPlayerIds).toEqual(['p1']); expect(JSON.stringify(hiddenVote)).not.toContain(`"p1":"${state.answerSlots.p2}"`);
    expect(pokemonRedFlagGame.getPlayerState(accepted.state, 'p1', fixture.context)).toMatchObject({ ownVoteAnswerId: state.answerSlots.p2, canVote: false });
  });

  it('awards exactly three points and reveals every author after voting', () => {
    const fixture = setup(); let state = fixture.state;
    for (const playerId of state.playerIds) state = answer(state, playerId, `Red flag divertida de ${playerId}.`, fixture.context).state;
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state; state = vote(state, 'p3', 'p2', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(POKEMON_RED_FLAG_WIN_POINTS).toBe(3);
    expect(state.lastRound?.winnerIds).toEqual(['p2']); expect(state.scores).toEqual({ p1: 0, p2: 3, p3: 0 });
    expect(state.lastRound?.answers.find((entry) => entry.authorId === 'p2')).toMatchObject({ votesReceived: 2, won: true, text: 'Red flag divertida de p2.' });
  });

  it('revotes once between tied anonymous answers and then shares the victory', () => {
    const fixture = setup({}, 4); let state = fixture.state;
    for (const playerId of state.playerIds) state = answer(state, playerId, `Red flag divertida de ${playerId}.`, fixture.context).state;
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state;
    state = vote(state, 'p3', 'p2', fixture.context).state; state = vote(state, 'p4', 'p1', fixture.context).state;
    expect(state.phase).toBe('REVOTE'); expect(state.voteCandidates).toEqual([state.answerSlots.p1, state.answerSlots.p2]);
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state;
    state = vote(state, 'p3', 'p2', fixture.context).state; state = vote(state, 'p4', 'p1', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound?.winnerIds).toEqual(['p1', 'p2']);
    expect(state.scores).toEqual({ p1: 3, p2: 3, p3: 0, p4: 0 }); expect(state.playerStats.p1).toMatchObject({ sharedWins: 1, soloWins: 0 });
  });

  it('excludes missing responses on timeout and treats missing votes as abstentions', () => {
    const fixture = setup(); let state = fixture.state;
    state = answer(state, 'p1', 'Nunca paga su parte.', fixture.context).state; state = answer(state, 'p2', 'Habla de su ex a diario.', fixture.context).state;
    fixture.setNow(31_000); state = pokemonRedFlagGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('VOTING');
    state = vote(state, 'p1', 'p2', fixture.context).state;
    fixture.setNow(61_000); state = pokemonRedFlagGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound?.winnerIds).toEqual(['p2']); expect(state.lastRound?.missingPlayerIds).toEqual(['p3']);
    expect(state.playerStats.p3).toMatchObject({ answersSubmitted: 0, roundsMissed: 1 });
  });

  it('restores a private answer after reconnecting and preserves it when another player disconnects', () => {
    const fixture = setup(); let state = fixture.state;
    state = answer(state, 'p1', 'Nunca devuelve lo que pide prestado.', fixture.context).state;
    fixture.context.players[0]!.connected = false;
    expect(pokemonRedFlagGame.getPlayerState(state, 'p1', fixture.context)).toEqual({ role: 'SPECTATOR', canSubmit: false, ownAnswer: null, canVote: false, ownVoteAnswerId: null, ownAnswerId: null });
    fixture.context.players[0]!.connected = true;
    expect(pokemonRedFlagGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ role: 'PLAYER', ownAnswer: { text: 'Nunca devuelve lo que pide prestado.' } });
    fixture.context.players[2]!.connected = false;
    state = answer(state, 'p2', 'Solo habla de sus medallas.', fixture.context).state;
    expect(state.phase).toBe('VOTING');
    expect(state.answers[state.answerSlots.p1!]?.text).toBe('Nunca devuelve lo que pide prestado.');
    expect(state.lastRound).toBeNull();
  });

  it('finishes with integrated standings and statistics after the reveal', () => {
    const fixture = setup(); let state = fixture.state;
    for (const playerId of state.playerIds) state = answer(state, playerId, `Red flag divertida de ${playerId}.`, fixture.context).state;
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state; state = vote(state, 'p3', 'p2', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = pokemonRedFlagGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS'); const results = pokemonRedFlagGame.getResults(state);
    expect(results.winnerId).toBe('p2'); expect(results.standings[0]).toMatchObject({ playerId: 'p2', points: 3, stats: { roundWins: 1 } });
  });
});
