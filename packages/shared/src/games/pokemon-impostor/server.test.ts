import { describe, expect, it } from 'vitest';
import type { GameContext, GamePlayer, Pokemon, PokemonCatalog, PokemonImpostorPlayerState, PokemonImpostorState } from '../../index.js';
import { IMPOSTOR_SKIP_TARGET, impostorWinner, pokemonImpostorGame } from '../../index.js';

const pokemon: Pokemon[] = [
  { id: 'lucario', nationalDexNumber: 448, name: 'Lucario', generation: 4, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/448.png', hp: 70, attack: 110, defense: 70, specialAttack: 115, specialDefense: 70, speed: 90, baseStatTotal: 525, types: ['fighting', 'steel'] },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', generation: 1, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png', hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90, baseStatTotal: 320, types: ['electric'] },
  { id: 'garchomp', nationalDexNumber: 445, name: 'Garchomp', generation: 4, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/445.png', hp: 108, attack: 130, defense: 95, specialAttack: 80, specialDefense: 85, speed: 102, baseStatTotal: 600, types: ['dragon', 'ground'] },
];
const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
};
const players: GamePlayer[] = Array.from({ length: 5 }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}` }));

function setup(impostorCount = 1, clueSeconds = 15) {
  let now = 1_000;
  const contextPlayers = players.map((player) => ({ ...player }));
  const context: GameContext = { players: contextPlayers, pokemon: catalog, get now() { return now; }, random: () => 0 };
  let state = pokemonImpostorGame.createInitialState({ generations: [4], impostorCount, clueSeconds, voteSeconds: 20 }, context);
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
  while (next.phase === 'CLUE_PHASE') {
    const id = next.clueOrder[next.currentClueTurnIndex]!;
    next = clue(next, id, `Pista ${id}`, context).state;
  }
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
    expect(clue(state, 'p1', 'Otra pista', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/turno|bloqueada/) });
    state = fillClues(state, fixture.context);
    expect(state.phase).toBe('VOTING');
    expect(state.roundEndsAt).toBe(fixture.context.now + 20_000);
  });

  it('counts Unicode clues by code points instead of bytes', () => {
    const fixture = setup();
    let state = startClues(fixture);
    const accepted = clue(state, 'p1', '⚡'.repeat(25), fixture.context);
    expect(accepted.accepted).toBe(true);
    state = accepted.state;
    expect(clue(state, 'p2', '⚡'.repeat(26), fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/25/) });
  });

  it('uses an authoritative random order, one configurable timer per turn and advances immediately', () => {
    const fixture = setup(1, 15);
    let state = startClues(fixture);
    expect(state.clueOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(state.currentClueTurnIndex).toBe(0);
    expect(state.roundEndsAt).toBe(fixture.context.now + 15_000);
    expect(clue(state, 'p2', 'Fuera de turno', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/turno/) });
    state = clue(state, 'p1', 'Primera pista', fixture.context).state;
    expect(state.currentClueTurnIndex).toBe(1);
    expect(state.clueOrder[state.currentClueTurnIndex]).toBe('p2');
    expect(state.roundEndsAt).toBe(fixture.context.now + 15_000);
    expect(pokemonImpostorGame.getPublicState(state, fixture.context).clues[1]?.p1?.text).toBe('Primera pista');
  });

  it('skips disconnected turns immediately and preserves clues accepted before disconnect', () => {
    const fixture = setup();
    let state = startClues(fixture);
    state = clue(state, 'p1', 'Pista válida', fixture.context).state;
    fixture.context.players[0]!.connected = false;
    fixture.context.players[1]!.connected = false;
    state = pokemonImpostorGame.handlePresenceChange!(state, fixture.context);
    expect(state.clues[1]?.p1).toMatchObject({ text: 'Pista válida', status: 'SUBMITTED' });
    expect(state.clues[1]?.p2).toMatchObject({ text: null, status: 'DISCONNECTED' });
    expect(state.clueOrder[state.currentClueTurnIndex]).toBe('p3');
  });

  it('does not rewind a missed turn after reconnection and generates a different order next round', () => {
    const fixture = setup();
    let state = startClues(fixture);
    fixture.context.players[0]!.connected = false;
    state = pokemonImpostorGame.handlePresenceChange!(state, fixture.context);
    expect(state.clueOrder[state.currentClueTurnIndex]).toBe('p2');
    fixture.context.players[0]!.connected = true;
    state = pokemonImpostorGame.handlePresenceChange!(state, fixture.context);
    expect(state.clueOrder[state.currentClueTurnIndex]).toBe('p2');

    const previousOrder = [...state.clueOrder];
    state = { ...state, phase: 'ELIMINATION', winnerTeam: null, nextTransitionAt: fixture.context.now };
    state = pokemonImpostorGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.clueOrder).not.toEqual(previousOrder);
  });

  it('lets a living impostor use one guess during any clue turn without leaking the secret', () => {
    const fixture = setup();
    const state = startClues(fixture);
    expect(state.clueOrder[state.currentClueTurnIndex]).toBe('p1');
    const wrong = pokemonImpostorGame.handleAction(state, 'p1', { type: 'GUESS_POKEMON', pokemonId: 'garchomp' }, fixture.context);
    expect(wrong.accepted).toBe(true);
    expect((pokemonImpostorGame.getPlayerState(wrong.state, 'p1', fixture.context) as PokemonImpostorPlayerState)).toMatchObject({ guessUsed: true, guessCorrect: false, secretPokemon: null });
    expect(JSON.stringify(pokemonImpostorGame.getPublicState(wrong.state, fixture.context))).not.toMatch(/lucario|Lucario|448/);
    expect(pokemonImpostorGame.handleAction(wrong.state, 'p1', { type: 'GUESS_POKEMON', pokemonId: 'lucario' }, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/intento/) });

    const fresh = startClues(setup());
    const correct = pokemonImpostorGame.handleAction(fresh, 'p1', { type: 'GUESS_POKEMON', pokemonId: 'lucario' }, fixture.context);
    expect(correct.state).toMatchObject({ phase: 'GAME_RESULTS', winnerTeam: 'IMPOSTORS', finishReason: 'GUESS' });
    expect(pokemonImpostorGame.getPublicState(correct.state, fixture.context).finishReason).toBe('GUESS');
  });

  it('moves to voting on clue timeout without eliminating non-responders', () => {
    const fixture = setup();
    let state = startClues(fixture);
    state = clue(state, 'p1', 'Algo azul', fixture.context).state;
    while (state.phase === 'CLUE_PHASE') state = timeout(fixture, state);
    expect(state.phase).toBe('VOTING');
    expect(state.aliveIds).toEqual(players.map((player) => player.id));
    expect(state.clues[1]?.p2).toMatchObject({ text: null, status: 'TIMEOUT' });
  });

  it('rejects clues and votes received after their authoritative deadlines', () => {
    const fixture = setup();
    let state = startClues(fixture);
    fixture.setNow(state.roundEndsAt!);
    expect(clue(state, 'p1', 'Demasiado tarde', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/terminado/) });
    const lateGuess = pokemonImpostorGame.handleAction(state, 'p1', { type: 'GUESS_POKEMON', pokemonId: 'lucario' }, fixture.context);
    expect(lateGuess).toMatchObject({ accepted: false, error: expect.stringMatching(/terminado/) });
    expect(lateGuess.state.guessAttempts).toEqual({});
    state = pokemonImpostorGame.handleTimeout(state, fixture.context);
    while (state.phase === 'CLUE_PHASE') state = timeout(fixture, state);
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

  it('does not wait for disconnected voters and retains votes cast before disconnect', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    fixture.context.players[0]!.connected = false;
    fixture.context.players[2]!.connected = false;
    state = cast(state, 'p2', 'p1', fixture.context).state;
    state = cast(state, 'p4', 'p1', fixture.context).state;
    state = cast(state, 'p5', 'p1', fixture.context).state;
    expect(state.phase).toBe('VOTE_RESULTS');
    expect(state.lastVoteResult?.votes.p1?.targetId).toBe('p2');
    expect(state.lastVoteResult?.votes.p3).toBeUndefined();
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

    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    for (const id of ['p2', 'p3', 'p4', 'p5']) state = cast(state, id, 'p1', fixture.context).state;
    state = timeout(fixture, state);
    expect(state).toMatchObject({ phase: 'ELIMINATION', winnerTeam: 'INNOCENTS', finishReason: 'IMPOSTORS_ELIMINATED' });
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
      lastVoteResult: { kind: 'ELIMINATION', votes: {}, tallies: { p3: 2 }, skipVotes: 0, tiedIds: [], eliminatedId: 'p3' },
    };
    const eliminated = pokemonImpostorGame.handleTimeout(state, fixture.context);
    expect(eliminated.phase).toBe('ELIMINATION');
    expect(eliminated.aliveIds).toEqual(['p1', 'p2']);
    expect(eliminated.winnerTeam).toBe('IMPOSTORS');
    expect(eliminated.finishReason).toBe('PARITY');
    const finished = timeout(fixture, eliminated);
    expect(pokemonImpostorGame.getPublicState(finished, fixture.context)).toMatchObject({ phase: 'GAME_RESULTS', finishReason: 'PARITY' });
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

  it('accepts SKIP as a vote, never as a candidate, and counts it in votesCast', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    expect(state.voteCandidateIds).not.toContain(IMPOSTOR_SKIP_TARGET);
    const skipped = cast(state, 'p1', IMPOSTOR_SKIP_TARGET, fixture.context);
    expect(skipped.accepted).toBe(true);
    state = skipped.state;
    expect(state.voteCandidateIds).not.toContain(IMPOSTOR_SKIP_TARGET);
    expect(state.playerStats.p1?.votesCast).toBe(1);
    state = timeout(fixture, state);
    expect(state.lastVoteResult).toMatchObject({ kind: 'SKIPPED', skipVotes: 1 });
    expect(Object.keys(state.lastVoteResult!.tallies)).not.toContain(IMPOSTOR_SKIP_TARGET);
  });

  it('nobody voting skips to the next clue round without eliminating', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = timeout(fixture, state);
    expect(state.phase).toBe('VOTE_RESULTS');
    expect(state.lastVoteResult).toMatchObject({ kind: 'SKIPPED', skipVotes: 0, tiedIds: [], eliminatedId: null });
    state = timeout(fixture, state);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.roundNumber).toBe(2);
    expect(state.eliminatedIds).toEqual([]);
    expect(state.roundsWithoutElimination).toBe(1);
  });

  it('SKIP tying the maximum eliminates nobody', () => {
    // Cuatro vivos conectados (p5 desconectado): votos A, A, SKIP, SKIP.
    const fixture = setup();
    fixture.context.players[4]!.connected = false;
    let state = fillClues(startClues(fixture), fixture.context);
    state = cast(state, 'p1', 'p2', fixture.context).state;
    state = cast(state, 'p3', 'p2', fixture.context).state;
    state = cast(state, 'p2', IMPOSTOR_SKIP_TARGET, fixture.context).state;
    state = cast(state, 'p4', IMPOSTOR_SKIP_TARGET, fixture.context).state;
    expect(state.phase).toBe('VOTE_RESULTS');
    expect(state.lastVoteResult).toMatchObject({ kind: 'SKIPPED', skipVotes: 2, tallies: { p2: 2 }, tiedIds: [], eliminatedId: null });
    state = timeout(fixture, state);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.eliminatedIds).toEqual([]);
  });

  it('a repeated tie ends in DEADLOCK without elimination', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    const tie = (current: PokemonImpostorState) => {
      let next = cast(current, 'p1', 'p2', fixture.context).state;
      next = cast(next, 'p2', 'p1', fixture.context).state;
      next = cast(next, 'p3', 'p1', fixture.context).state;
      return cast(next, 'p4', 'p2', fixture.context).state;
    };
    state = timeout(fixture, tie(state));
    expect(state.lastVoteResult).toMatchObject({ kind: 'TIE', tiedIds: ['p1', 'p2'] });
    state = timeout(fixture, state);
    expect(state.votingRound).toBe(2);
    state = timeout(fixture, tie(state));
    expect(state.lastVoteResult?.kind).toBe('DEADLOCK');
    expect(state.lastVoteResult?.tiedIds).toHaveLength(2);
    expect(state.lastVoteResult?.eliminatedId).toBeNull();
    state = timeout(fixture, state);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.eliminatedIds).toEqual([]);
    expect(state.votingRound).toBe(0);
  });

  it('a disconnect during the revote resolves it without a third voting round', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    const tie = (current: PokemonImpostorState) => {
      let next = cast(current, 'p1', 'p2', fixture.context).state;
      next = cast(next, 'p2', 'p1', fixture.context).state;
      next = cast(next, 'p3', 'p1', fixture.context).state;
      return cast(next, 'p4', 'p2', fixture.context).state;
    };
    state = timeout(fixture, tie(state));
    state = timeout(fixture, state);
    expect(state.phase).toBe('VOTING');
    state = tie(state);
    expect(state.phase).toBe('VOTING');
    fixture.context.players[4]!.connected = false;
    state = pokemonImpostorGame.handlePresenceChange!(state, fixture.context);
    expect(state.phase).toBe('VOTE_RESULTS');
    expect(state.lastVoteResult?.kind).toBe('DEADLOCK');
    state = timeout(fixture, state);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.eliminatedIds).toEqual([]);
  });

  it('ends with STALEMATE after three rounds without elimination', () => {
    const fixture = setup();
    let state = startClues(fixture);
    for (let round = 1; round <= 3; round += 1) {
      expect(state.phase).toBe('CLUE_PHASE');
      expect(state.roundNumber).toBe(round);
      while (state.phase === 'CLUE_PHASE') state = timeout(fixture, state);
      expect(state.phase).toBe('VOTING');
      state = timeout(fixture, state);
      expect(state.lastVoteResult).toMatchObject({ kind: 'SKIPPED', skipVotes: 0 });
      state = timeout(fixture, state);
    }
    expect(state.phase).toBe('GAME_RESULTS');
    expect(state.winnerTeam).toBe('IMPOSTORS');
    expect(state.roundsWithoutElimination).toBe(3);
    expect(state.eliminatedIds).toEqual([]);
    expect(pokemonImpostorGame.getPublicState(state, fixture.context)).toMatchObject({ phase: 'GAME_RESULTS', winnerTeam: 'IMPOSTORS', finishReason: 'STALEMATE' });
  });

  it('an elimination resets the rounds-without-elimination counter', () => {
    const fixture = setup();
    let state = fillClues(startClues(fixture), fixture.context);
    state = timeout(fixture, timeout(fixture, state));
    expect(state.roundsWithoutElimination).toBe(1);
    state = fillClues(state, fixture.context);
    for (const id of state.aliveIds) state = cast(state, id, id === 'p5' ? 'p4' : 'p5', fixture.context).state;
    state = timeout(fixture, state);
    expect(state.phase).toBe('ELIMINATION');
    expect(state.roundsWithoutElimination).toBe(0);
    expect(state.finishReason).toBeNull();
  });

  it('an empty clue order still has a deadline and reaches voting', () => {
    let now = 1_000;
    const contextPlayers = players.slice(0, 4).map((player) => ({ ...player }));
    const context: GameContext = { players: contextPlayers, pokemon: catalog, get now() { return now; }, random: () => 0 };
    const fixture = { context, setNow(value: number) { now = value; } } as ReturnType<typeof setup>;
    let state = pokemonImpostorGame.createInitialState({ generations: [4], impostorCount: 1, clueSeconds: 15, voteSeconds: 20 }, context);
    state = pokemonImpostorGame.start(state, context);
    expect(state.phase).toBe('ROLE_REVEAL');
    for (const player of contextPlayers) player.connected = false;
    state = pokemonImpostorGame.handlePresenceChange!(state, context);

    state = timeout(fixture, state);
    expect(state.phase).toBe('CLUE_PHASE');
    expect(state.clueOrder).toEqual([]);
    expect(state.roundEndsAt).toBe(now + 15 * 1_000);
    expect(pokemonImpostorGame.getPublicState(state, context)).toMatchObject({ currentCluePlayerId: null, cluePendingIds: [] });

    state = timeout(fixture, state);
    expect(state.phase).toBe('VOTING');

    // Sin nadie conectado, cada ronda acaba en «Saltar» y la tercera termina en STALEMATE.
    for (let round = 1; round <= 3; round += 1) {
      if (round > 1) {
        expect(state).toMatchObject({ phase: 'CLUE_PHASE', roundNumber: round, clueOrder: [] });
        state = timeout(fixture, state);
      }
      expect(state.phase).toBe('VOTING');
      state = timeout(fixture, state);
      expect(state.lastVoteResult).toMatchObject({ kind: 'SKIPPED', skipVotes: 0 });
      state = timeout(fixture, state);
    }
    expect(state).toMatchObject({ phase: 'GAME_RESULTS', winnerTeam: 'IMPOSTORS', finishReason: 'STALEMATE', eliminatedIds: [] });
  });

  it('skip, elimination, skip, skip does not end with STALEMATE because the elimination resets the counter', () => {
    const fixture = setup();
    const skipRound = (current: PokemonImpostorState) => timeout(fixture, timeout(fixture, fillClues(current, fixture.context)));
    let state = skipRound(startClues(fixture));
    expect(state.roundsWithoutElimination).toBe(1);
    state = fillClues(state, fixture.context);
    for (const id of state.aliveIds) state = cast(state, id, id === 'p5' ? 'p4' : 'p5', fixture.context).state;
    state = timeout(fixture, timeout(fixture, state));
    expect(state).toMatchObject({ phase: 'CLUE_PHASE', roundNumber: 3, roundsWithoutElimination: 0, winnerTeam: null });
    state = skipRound(state);
    state = skipRound(state);
    expect(state).toMatchObject({ phase: 'CLUE_PHASE', roundNumber: 5, roundsWithoutElimination: 2, winnerTeam: null, finishReason: null });
  });
});
