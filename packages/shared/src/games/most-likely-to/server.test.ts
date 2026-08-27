import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultMostLikelyToConfig } from './config.js';
import { MOST_LIKELY_TO_WIN_POINTS } from './rules.js';
import { mostLikelyToGame } from './server.js';
import type { MostLikelyToState } from './types.js';

function mon(id: string, number: number): Pokemon {
  return { id, nationalDexNumber: number, name: id, generation: 1, isDefault: true, sprite: `/${id}.png`, hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50, baseStatTotal: 300, types: ['normal'], legendaryStatus: 'NORMAL' };
}
const entries = Array.from({ length: 8 }, (_, index) => mon(`pokemon-${index + 1}`, index + 1));
const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((pokemon) => pokemon.id === id),
  byDexNumber: (number) => entries.find((pokemon) => pokemon.nationalDexNumber === number),
  forGenerations: (generations) => entries.filter((pokemon) => generations.includes(pokemon.generation)),
};

function setup(overrides: Partial<typeof defaultMostLikelyToConfig> = {}, playerCount = 3) {
  let now = 1_000;
  const context: GameContext = {
    players: Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true })),
    pokemon: catalog,
    get now() { return now; },
    random: () => 0,
    hostCustomCategories: [{ id: 'custom-1', text: '¿Qué Pokémon sería más probable que montase una banda?' }],
  };
  const config = { ...defaultMostLikelyToConfig, generations: [1], rounds: 1, ...overrides };
  let state = mostLikelyToGame.createInitialState(config, context);
  state = mostLikelyToGame.start(state, context);
  return { context, state, setNow(value: number) { now = value; } };
}

function select(state: MostLikelyToState, playerId: string, pokemonId: string, context: GameContext) {
  return mostLikelyToGame.handleAction(state, playerId, { type: 'SELECT_POKEMON', pokemonId }, context);
}
function vote(state: MostLikelyToState, playerId: string, targetId: string, context: GameContext) {
  return mostLikelyToGame.handleAction(state, playerId, { type: 'VOTE_ANSWER', playerId: targetId }, context);
}

describe('Most Likely To rules', () => {
  it('requires three players, uses five rounds by default and supports host prompts', () => {
    expect(defaultMostLikelyToConfig).toMatchObject({ rounds: 5, selectionSeconds: 45, votingSeconds: 30 });
    expect(() => setup({}, 2)).toThrow(/al menos 3/);
    const custom = setup({ promptSource: 'CUSTOM' });
    expect(custom.state.promptPool).toEqual([{ id: 'most-likely-to-custom-custom-1', text: '¿Qué Pokémon sería más probable que montase una banda?' }]);
  });

  it('keeps choices private until every connected player has answered', () => {
    const fixture = setup();
    const result = select(fixture.state, 'p1', 'pokemon-1', fixture.context);
    expect(result.accepted).toBe(true);
    const publicState = mostLikelyToGame.getPublicState(result.state, fixture.context);
    expect(publicState.selectionCompletedIds).toEqual(['p1']);
    expect(publicState.revealedAnswers).toEqual([]);
    expect(JSON.stringify(publicState)).not.toContain('pokemon-1');
    expect(mostLikelyToGame.getPlayerState(result.state, 'p1', fixture.context)).toMatchObject({ ownChoice: { id: 'pokemon-1' }, canSelect: true });
    expect(mostLikelyToGame.getPlayerState(result.state, 'p2', fixture.context)).toMatchObject({ ownChoice: null });
  });

  it('allows duplicate Pokémon as separate authored answers and reveals both', () => {
    const fixture = setup(); let state = fixture.state;
    state = select(state, 'p1', 'pokemon-1', fixture.context).state;
    state = select(state, 'p2', 'pokemon-1', fixture.context).state;
    state = select(state, 'p3', 'pokemon-2', fixture.context).state;
    expect(state.phase).toBe('VOTING');
    const answers = mostLikelyToGame.getPublicState(state, fixture.context).revealedAnswers;
    expect(answers.filter((answer) => answer.pokemon.id === 'pokemon-1').map((answer) => answer.playerId)).toEqual(['p1', 'p2']);
  });

  it('forbids self-votes, locks accepted votes and keeps their targets private', () => {
    const fixture = setup(); let state = fixture.state;
    for (const [index, playerId] of fixture.state.playerIds.entries()) state = select(state, playerId, `pokemon-${index + 1}`, fixture.context).state;
    expect(vote(state, 'p1', 'p1', fixture.context)).toMatchObject({ accepted: false, error: 'No puedes votar tu propia respuesta.' });
    const accepted = vote(state, 'p1', 'p2', fixture.context); expect(accepted.accepted).toBe(true);
    expect(vote(accepted.state, 'p1', 'p3', fixture.context).accepted).toBe(false);
    const publicState = mostLikelyToGame.getPublicState(accepted.state, fixture.context);
    expect(publicState.votedPlayerIds).toEqual(['p1']); expect(JSON.stringify(publicState)).not.toContain('"p1":"p2"');
    expect(mostLikelyToGame.getPlayerState(accepted.state, 'p1', fixture.context)).toMatchObject({ ownVotePlayerId: 'p2', canVote: false });
  });

  it('awards exactly three points only to the winning author', () => {
    const fixture = setup(); let state = fixture.state;
    for (const [index, playerId] of fixture.state.playerIds.entries()) state = select(state, playerId, `pokemon-${index + 1}`, fixture.context).state;
    state = vote(state, 'p1', 'p2', fixture.context).state;
    state = vote(state, 'p2', 'p1', fixture.context).state;
    state = vote(state, 'p3', 'p2', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(MOST_LIKELY_TO_WIN_POINTS).toBe(3);
    expect(state.lastRound?.winnerIds).toEqual(['p2']);
    expect(state.scores).toEqual({ p1: 0, p2: 3, p3: 0 });
    expect(state.lastRound?.answers.find((answer) => answer.playerId === 'p2')).toMatchObject({ votesReceived: 2, won: true });
  });

  it('revotes once between tied answers and then awards a shared victory', () => {
    const fixture = setup({}, 4); let state = fixture.state;
    for (const [index, playerId] of fixture.state.playerIds.entries()) state = select(state, playerId, `pokemon-${index + 1}`, fixture.context).state;
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state;
    state = vote(state, 'p3', 'p2', fixture.context).state; state = vote(state, 'p4', 'p1', fixture.context).state;
    expect(state.phase).toBe('REVOTE'); expect(state.voteCandidates).toEqual(['p1', 'p2']);
    expect(mostLikelyToGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ canVote: true, ownVotePlayerId: null });
    fixture.context.players[0]!.connected = false; expect(mostLikelyToGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ role: 'SPECTATOR', canVote: false });
    fixture.context.players[0]!.connected = true; expect(mostLikelyToGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({ role: 'PLAYER', canVote: true, ownVotePlayerId: null });
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state;
    state = vote(state, 'p3', 'p2', fixture.context).state; state = vote(state, 'p4', 'p1', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound?.winnerIds).toEqual(['p1', 'p2']);
    expect(state.scores).toEqual({ p1: 3, p2: 3, p3: 0, p4: 0 });
    expect(state.playerStats.p1).toMatchObject({ sharedWins: 1, soloWins: 0 });
  });

  it('excludes missing answers on timeout and treats missing votes as abstentions', () => {
    const fixture = setup(); let state = fixture.state;
    state = select(state, 'p1', 'pokemon-1', fixture.context).state; state = select(state, 'p2', 'pokemon-2', fixture.context).state;
    fixture.setNow(46_000); state = mostLikelyToGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('VOTING'); expect(state.voteCandidates).toEqual(['p1', 'p2']);
    state = vote(state, 'p1', 'p2', fixture.context).state;
    fixture.setNow(76_000); state = mostLikelyToGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.lastRound?.winnerIds).toEqual(['p2']);
    expect(state.playerStats.p3).toMatchObject({ answersSubmitted: 0, roundsMissed: 1 });
  });

  it('finishes after the reveal with integrated standings and statistics', () => {
    const fixture = setup(); let state = fixture.state;
    for (const [index, playerId] of fixture.state.playerIds.entries()) state = select(state, playerId, `pokemon-${index + 1}`, fixture.context).state;
    state = vote(state, 'p1', 'p2', fixture.context).state; state = vote(state, 'p2', 'p1', fixture.context).state; state = vote(state, 'p3', 'p2', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = mostLikelyToGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS'); const results = mostLikelyToGame.getResults(state);
    expect(results.winnerId).toBe('p2'); expect(results.standings[0]).toMatchObject({ playerId: 'p2', points: 3, stats: { roundWins: 1 } });
  });
});
