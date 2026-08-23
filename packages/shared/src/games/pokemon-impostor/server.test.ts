import { describe, expect, it } from 'vitest';
import type { GameContext, GamePlayer, Pokemon, PokemonCatalog, PokemonImpostorPlayerState, PokemonImpostorState } from '../../index.js';
import { impostorWinner, pokemonImpostorGame } from '../../index.js';

const pokemon: Pokemon[] = [
  { id: 'lucario', nationalDexNumber: 448, name: 'Lucario', generation: 4, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/448.png' },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' },
];
const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
};
const players: GamePlayer[] = Array.from({ length: 5 }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}` }));

function setup(impostorCount = 1) {
  let now = 1_000;
  const context: GameContext = { players, pokemon: catalog, get now() { return now; }, random: () => 0 };
  let state = pokemonImpostorGame.createInitialState({ generations: [4], impostorCount, clueSeconds: 30, voteSeconds: 20 }, context);
  state = pokemonImpostorGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; } };
}

function timeout(fixture: ReturnType<typeof setup>, state: PokemonImpostorState): PokemonImpostorState {
  fixture.setNow((state.roundEndsAt ?? state.nextTransitionAt)!);
  return pokemonImpostorGame.handleTimeout(state, fixture.context);
}

function startClues(fixture: ReturnType<typeof setup>): PokemonImpostorState {
  return timeout(fixture, fixture.state);
}

function clue(state: PokemonImpostorState, playerId: string, text: string, context: GameContext) {
  return pokemonImpostorGame.handleAction(state, playerId, { type: 'SUBMIT_CLUE', text }, context);
}

function fillClues(state: PokemonImpostorState, context: GameContext): PokemonImpostorState {
  let next = state;
  for (const id of state.aliveIds) next = clue(next, id, `Pista ${id}`, context).state;
  return next;
}

function cast(state: PokemonImpostorState, playerId: string, targetId: string, context: GameContext) {
  return pokemonImpostorGame.handleAction(state, playerId, { type: 'VOTE', targetId }, context);
}

describe('Pokémon Impostor', () => {
  it('selects a Pokémon from configured generations and assigns the configured impostors', () => {
    const fixture = setup();
    expect(fixture.state.secretPokemonId).toBe('lucario');
    expect(Object.values(fixture.state.roles).filter((role) => role === 'IMPOSTOR')).toHaveLength(1);
    expect(fixture.state.roles.p1).toBe('IMPOSTOR');
    expect(Object.values(setup(2).state.roles).filter((role) => role === 'IMPOSTOR')).toHaveLength(2);
  });

  it('rejects an impossible impostor count for the player count', () => {
    const fixture = setup();
    expect(() => pokemonImpostorGame.createInitialState({ generations: [4], impostorCount: 3, clueSeconds: 30, voteSeconds: 20 }, fixture.context)).toThrow(/más inocentes/);
  });

  it('gives the Pokémon only to innocents and never leaks it through public or impostor state', () => {
    const fixture = setup();
    const publicState = pokemonImpostorGame.getPublicState(fixture.state, fixture.context);
    const impostorState = pokemonImpostorGame.getPlayerState(fixture.state, 'p1', fixture.context) as PokemonImpostorPlayerState;
    const innocentState = pokemonImpostorGame.getPlayerState(fixture.state, 'p2', fixture.context) as PokemonImpostorPlayerState;
    expect(impostorState).toMatchObject({ role: 'IMPOSTOR', secretPokemon: null, revealedRoles: null });
    expect(innocentState).toMatchObject({ role: 'INNOCENT', secretPokemon: { name: 'Lucario' } });
    expect(JSON.stringify({ publicState, impostorState })).not.toMatch(/Lucario|lucario|448\.png/);
  });

  it('restores the correct private state without leaking on reconnection', () => {
    const fixture = setup();
    const firstImpostorView = pokemonImpostorGame.getPlayerState(fixture.state, 'p1', fixture.context) as PokemonImpostorPlayerState;
    const restoredImpostorView = pokemonImpostorGame.getPlayerState(fixture.state, 'p1', fixture.context) as PokemonImpostorPlayerState;
    const restoredInnocentView = pokemonImpostorGame.getPlayerState(fixture.state, 'p2', fixture.context) as PokemonImpostorPlayerState;
    expect(restoredImpostorView).toEqual(firstImpostorView);
    expect(restoredImpostorView.secretPokemon).toBeNull();
    expect(restoredInnocentView.secretPokemon?.name).toBe('Lucario');
  });

  it('accepts one public clue per round, enforces 25 characters and advances early', () => {
    const fixture = setup();
    let state = startClues(fixture);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(clue(state, 'p1', 'x'.repeat(26), fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/25/) });
    const first = clue(state, 'p1', '  Sale en Smash  ', fixture.context);
    expect(first.accepted).toBe(true);
    state = first.state;
    expect(pokemonImpostorGame.getPublicState(state, fixture.context).clues[1]?.p1?.text).toBe('Sale en Smash');
    expect(clue(state, 'p1', 'Otra pista', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/bloqueada/) });
    state = fillClues(state, fixture.context);
    expect(state.phase).toBe('VOTING');
    expect(state.roundEndsAt).toBe(fixture.context.now + 20_000);
  });

  it('counts Unicode clues by code points instead of bytes', () => {
    const fixture = setup();
    const state = startClues(fixture);
    expect(clue(state, 'p1', '⚡'.repeat(25), fixture.context).accepted).toBe(true);
    expect(clue(state, 'p2', '⚡'.repeat(26), fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/25/) });
  });

  it('moves to voting on clue timeout without eliminating non-responders', () => {
    const fixture = setup();
    let state = startClues(fixture);
    state = clue(state, 'p1', 'Algo azul', fixture.context).state;
    state = timeout(fixture, state);
    expect(state.phase).toBe('VOTING');
    expect(state.aliveIds).toEqual(players.map((player) => player.id));
    expect(state.clues[1]?.p2).toBeUndefined();
  });

  it('rejects clues and votes received after their authoritative deadlines', () => {
    const fixture = setup();
    let state = startClues(fixture);
    fixture.setNow(state.roundEndsAt!);
    expect(clue(state, 'p1', 'Demasiado tarde', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/terminado/) });
    state = pokemonImpostorGame.handleTimeout(state, fixture.context);
    fixture.setNow(state.roundEndsAt!);
    expect(cast(state, 'p1', 'p2', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/terminado/) });
  });

  it('locks votes, prevents self-voting and hides targets while voting', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    expect(cast(state, 'p1', 'p1', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/ti mismo/) });
    const first = cast(state, 'p1', 'p2', fixture.context);
    expect(first.accepted).toBe(true);
    state = first.state;
    expect(cast(state, 'p1', 'p3', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/bloqueado/) });
    const publicState = pokemonImpostorGame.getPublicState(state, fixture.context);
    expect(publicState.voteCompletedIds).toEqual(['p1']);
    expect(JSON.stringify(publicState)).not.toContain('"targetId":"p2"');
  });

  it('reveals votes after everyone votes and eliminates the unique maximum', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    for (const id of ['p2', 'p3', 'p4', 'p5']) state = cast(state, id, 'p1', fixture.context).state;
    expect(state.phase).toBe('VOTE_RESULTS');
    expect(state.lastVoteResult).toMatchObject({ kind: 'ELIMINATION', eliminatedId: 'p1', tallies: { p1: 4, p2: 1 } });
    state = timeout(fixture, state);
    expect(state.phase).toBe('ELIMINATION');
    expect(state.eliminationReveal).toEqual({ playerId: 'p1', role: 'IMPOSTOR' });
    expect(state.spectatorIds).toEqual(['p1']);
    expect(state.winnerTeam).toBe('INNOCENTS');
  });

  it('uses only tied candidates in repeated voting and never eliminates randomly', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    state = cast(state, 'p2', 'p1', fixture.context).state;
    state = cast(state, 'p3', 'p1', fixture.context).state;
    state = cast(state, 'p4', 'p2', fixture.context).state;
    state = timeout(fixture, state);
    expect(state.lastVoteResult).toMatchObject({ kind: 'TIE', tiedIds: ['p1', 'p2'] });
    state = timeout(fixture, state);
    expect(state.phase).toBe('VOTING');
    expect(state.voteCandidateIds).toEqual(['p1', 'p2']);
    expect(state.votingRound).toBe(2);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    state = cast(state, 'p2', 'p1', fixture.context).state;
    state = cast(state, 'p3', 'p1', fixture.context).state;
    state = cast(state, 'p4', 'p1', fixture.context).state;
    state = cast(state, 'p5', 'p2', fixture.context).state;
    expect(state.lastVoteResult?.eliminatedId).toBe('p1');
  });

  it('starts a new clue round with the same Pokémon after eliminating an innocent', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    for (const id of state.aliveIds) state = cast(state, id, id === 'p5' ? 'p4' : 'p5', fixture.context).state;
    expect(state.lastVoteResult?.eliminatedId).toBe('p5');
    state = timeout(fixture, state);
    expect(state.winnerTeam).toBeNull();
    const secret = state.secretPokemonId;
    state = timeout(fixture, state);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.roundNumber).toBe(2);
    expect(state.secretPokemonId).toBe(secret);
    expect(state.aliveIds).not.toContain('p5');
    expect((pokemonImpostorGame.getPlayerState(state, 'p5', fixture.context) as PokemonImpostorPlayerState).revealedRoles).toEqual(state.roles);
  });

  it('centralizes innocent victory and impostor parity victory', () => {
    const roles = { p1: 'IMPOSTOR', p2: 'INNOCENT', p3: 'INNOCENT', p4: 'IMPOSTOR' } as const;
    expect(impostorWinner(['p2', 'p3'], roles)).toBe('INNOCENTS');
    expect(impostorWinner(['p1', 'p2'], roles)).toBe('IMPOSTORS');
    expect(impostorWinner(['p1', 'p2', 'p3'], roles)).toBeNull();
    expect(impostorWinner(['p1', 'p2', 'p3', 'p4'], roles)).toBe('IMPOSTORS');
  });

  it('applies impostor parity after an innocent elimination', () => {
    const fixture = setup();
    const state: PokemonImpostorState = {
      ...fixture.state,
      phase: 'VOTE_RESULTS',
      aliveIds: ['p1', 'p2', 'p3'],
      eliminatedIds: ['p4', 'p5'],
      spectatorIds: ['p4', 'p5'],
      nextTransitionAt: fixture.context.now,
      lastVoteResult: { kind: 'ELIMINATION', votes: {}, tallies: { p3: 2 }, tiedIds: [], eliminatedId: 'p3' },
    };
    const eliminated = pokemonImpostorGame.handleTimeout(state, fixture.context);
    expect(eliminated.phase).toBe('ELIMINATION');
    expect(eliminated.aliveIds).toEqual(['p1', 'p2']);
    expect(eliminated.winnerTeam).toBe('IMPOSTORS');
  });

  it('finishes after the elimination reveal with team standings', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    for (const id of ['p2', 'p3', 'p4', 'p5']) state = cast(state, id, 'p1', fixture.context).state;
    state = timeout(fixture, state);
    state = timeout(fixture, state);
    expect(state.phase).toBe('GAME_RESULTS');
    expect(pokemonImpostorGame.getResults(state).standings.filter((entry) => entry.position === 1).map((entry) => entry.playerId)).toEqual(['p2', 'p3', 'p4', 'p5']);
  });
});
