import { describe, expect, it } from 'vitest';
import type { GameContext, GamePlayer, Pokemon, PokemonCatalog, ShinyVoteState } from '../../index.js';
import { shinyVoteGame } from '../../index.js';

const pokemon: Pokemon[] = Array.from({ length: 8 }, (_, index) => ({
  id: `pokemon-${index + 1}`,
  nationalDexNumber: index + 1,
  name: `Pokémon ${index + 1}`,
  generation: 1,
  sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${index + 1}.png`,
}));
const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
};
const players: GamePlayer[] = [
  { id: 'pedro', displayName: 'Pedro' },
  { id: 'ana', displayName: 'Ana' },
  { id: 'marta', displayName: 'Marta' },
];

function setup(rounds = 2) {
  let now = 1_000;
  const context: GameContext = { players, pokemon: catalog, get now() { return now; }, random: () => 0, roomCode: 'PIKA42' };
  let state = shinyVoteGame.createInitialState({ generations: [1], roundSeconds: 20, rounds }, context);
  state = shinyVoteGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; } };
}

function vote(state: ShinyVoteState, playerId: string, optionId: 'A' | 'B' | 'C' | 'D', context: GameContext) {
  return shinyVoteGame.handleAction(state, playerId, { type: 'VOTE', optionId }, context);
}

describe('public shiny voting', () => {
  it('keeps only the correct answer secret while votes and pending players are public', () => {
    const fixture = setup();
    expect(fixture.state.correctOptionId).toBe('A');
    let publicState = shinyVoteGame.getPublicState(fixture.state, fixture.context);
    expect(publicState.correctOptionId).toBeNull();
    expect(publicState.lastRound).toBeNull();
    expect(publicState.options[0]?.sprite).toMatch(/^\/api\/rooms\/PIKA42\/games\//);
    expect(publicState.options[0]?.sprite).not.toContain('shiny');

    const result = vote(fixture.state, 'pedro', 'C', fixture.context);
    expect(result.accepted).toBe(true);
    publicState = shinyVoteGame.getPublicState(result.state, fixture.context);
    expect(publicState.votes.pedro?.optionId).toBe('C');
    expect(publicState.pendingPlayerIds).toEqual(['ana', 'marta']);
    expect(publicState.correctOptionId).toBeNull();
  });

  it('authoritatively rejects a changed vote and non-participants', () => {
    const fixture = setup();
    const first = vote(fixture.state, 'pedro', 'B', fixture.context);
    const changed = vote(first.state, 'pedro', 'C', fixture.context);
    expect(changed.accepted).toBe(false);
    expect(changed.error).toMatch(/bloqueado/);
    expect(changed.state.votes.pedro?.optionId).toBe('B');

    const spectator = vote(first.state, 'spectator', 'A', fixture.context);
    expect(spectator.accepted).toBe(false);
    expect(spectator.error).toMatch(/participas/);
  });

  it('ends voting immediately after every participant votes and scores the reveal', () => {
    const fixture = setup();
    let state = vote(fixture.state, 'pedro', 'A', fixture.context).state;
    state = vote(state, 'ana', 'C', fixture.context).state;
    state = vote(state, 'marta', 'A', fixture.context).state;

    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.nextTransitionAt).toBe(fixture.context.now + 3_000);
    expect(state.scores).toEqual({ pedro: 1, ana: 0, marta: 1 });
    expect(state.lastRound?.correctPlayerIds).toEqual(['pedro', 'marta']);
    const publicState = shinyVoteGame.getPublicState(state, fixture.context);
    expect(publicState.correctOptionId).toBe('A');
    expect(publicState.votes).toEqual(state.votes);
  });

  it('reveals on timeout and automatically starts the next round after three seconds', () => {
    const fixture = setup();
    let state = vote(fixture.state, 'pedro', 'A', fixture.context).state;
    fixture.setNow(state.roundEndsAt!);
    state = shinyVoteGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound?.missedPlayerIds).toEqual(['ana', 'marta']);

    fixture.setNow(state.nextTransitionAt!);
    state = shinyVoteGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_ACTIVE');
    expect(state.roundNumber).toBe(2);
    expect(state.votes).toEqual({});
    expect(shinyVoteGame.getPublicState(state, fixture.context).correctOptionId).toBeNull();
  });

  it('finishes after the configured rounds with cumulative standings', () => {
    const fixture = setup(1);
    let state = vote(fixture.state, 'pedro', 'A', fixture.context).state;
    state = vote(state, 'ana', 'B', fixture.context).state;
    state = vote(state, 'marta', 'A', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!);
    state = shinyVoteGame.handleTimeout(state, fixture.context);

    expect(state.phase).toBe('GAME_RESULTS');
    const results = shinyVoteGame.getResults(state);
    expect(results.standings.map((standing) => [standing.playerId, standing.position, standing.points])).toEqual([
      ['marta', 1, 1],
      ['pedro', 1, 1],
      ['ana', 3, 0],
    ]);
    expect(results.winnerId).toBeNull();
  });
});
