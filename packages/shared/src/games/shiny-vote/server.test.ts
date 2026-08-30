import { describe, expect, it } from 'vitest';
import type { GameContext, GamePlayer, Pokemon, PokemonCatalog, ShinyCandidateMode, ShinyOptionId, ShinyVoteState } from '../../index.js';
import { shinyPointsForOrder, shinyVoteGame } from '../../index.js';

const pokemon: Pokemon[] = Array.from({ length: 8 }, (_, index) => ({
  id: `pokemon-${index + 1}`,
  nationalDexNumber: index + 1,
  name: `Pokémon ${index + 1}`,
  generation: index < 6 ? 1 : 2,
  sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${index + 1}.png`, shinySprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${index + 1}.png`,
  hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50, baseStatTotal: 300, types: ['normal'],
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

function setup(rounds = 2, candidateMode: ShinyCandidateMode = 'SAME_POKEMON', optionCount = 4, generations = [1], showVotes = true, random: () => number = () => 0) {
  let now = 1_000;
  const preloadedImages: string[] = [];
  const context: GameContext = { players: players.map((player) => ({ ...player })), pokemon: catalog, get now() { return now; }, random, roomCode: 'PIKA42', preloadImage: (source) => preloadedImages.push(source) };
  let state = shinyVoteGame.createInitialState({ generations, roundSeconds: 20, rounds, candidateMode, optionCount, showVotes }, context);
  state = shinyVoteGame.start(state, context);
  return { state, context, preloadedImages, setNow(value: number) { now = value; } };
}

function vote(state: ShinyVoteState, playerId: string, optionId: ShinyOptionId, context: GameContext) {
  return shinyVoteGame.handleAction(state, playerId, { type: 'VOTE', optionId }, context);
}

describe('public shiny voting', () => {
  it('rewards correct answers by authoritative solve order', () => {
    expect([1, 2, 3, 4, 5].map(shinyPointsForOrder)).toEqual([4, 3, 2, 1, 1]);
  });

  it('supports four versions of the same Pokémon with distinct server-side palettes', () => {
    const fixture = setup();
    expect(new Set(fixture.state.options.map((option) => option.pokemonId)).size).toBe(1);
    expect(new Set(fixture.state.options.map((option) => JSON.stringify(option.recolor))).size).toBe(4);
    const fakeOptions = fixture.state.options.filter((option) => option.id !== fixture.state.correctOptionId);
    expect(fakeOptions.every((option) => option.recolor && option.recolor.saturationScale < 1)).toBe(true);
  });

  it('builds fake recolors from normal sprites and sometimes from official shiny sprites', () => {
    const values = [0, 0, 0.9, 0.1, 0.9];
    const fixture = setup(2, 'SAME_POKEMON', 4, [1], true, () => values.shift() ?? 0.9);
    const fakeOptions = fixture.state.options.filter((option) => option.id !== fixture.state.correctOptionId);
    expect(fakeOptions.some((option) => !option.sprite.includes('/shiny/'))).toBe(true);
    expect(fakeOptions.some((option) => option.sprite.includes('/shiny/'))).toBe(true);
    expect(fakeOptions.every((option) => option.recolor !== null)).toBe(true);
  });

  it('supports four different Pokémon when configured by the host', () => {
    const fixture = setup(2, 'DIFFERENT_POKEMON');
    expect(new Set(fixture.state.options.map((option) => option.pokemonId)).size).toBe(4);
    expect(new Set(fixture.state.options.map((option) => option.pokemonName)).size).toBe(4);
  });

  it.each([3, 4, 5, 6])('creates exactly one official shiny among %i configurable options', (optionCount) => {
    const fixture = setup(2, 'SAME_POKEMON', optionCount);
    expect(fixture.state.options).toHaveLength(optionCount);
    const authenticOptions = fixture.state.options.filter((option) => option.recolor === null);
    expect(authenticOptions).toHaveLength(1);
    expect(authenticOptions[0]).toMatchObject({ id: fixture.state.correctOptionId });
    expect(authenticOptions[0]?.sprite).toContain('/shiny/');
    expect(new Set(fixture.state.options.map((option) => JSON.stringify(option.recolor))).size).toBe(optionCount);
  });

  it('uses unique Pokémon from only the configured generations in different mode', () => {
    const fixture = setup(2, 'DIFFERENT_POKEMON', 6, [1]);
    expect(new Set(fixture.state.options.map((option) => option.pokemonId)).size).toBe(6);
    expect(fixture.state.options.every((option) => pokemon.find((entry) => entry.id === option.pokemonId)?.generation === 1)).toBe(true);
  });

  it('reveals and scores correctly with six options', () => {
    const fixture = setup(1, 'SAME_POKEMON', 6);
    let state = vote(fixture.state, 'pedro', 'F', fixture.context).state;
    state = vote(state, 'ana', 'A', fixture.context).state;
    state = vote(state, 'marta', 'A', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.options).toHaveLength(6);
    expect(state.correctOptionId).toBe('A');
    expect(state.scores).toEqual({ pedro: 0, ana: 4, marta: 3 });
  });

  it('keeps only the correct answer secret while votes and pending players are public', () => {
    const fixture = setup();
    expect(fixture.state.correctOptionId).toBe('A');
    let publicState = shinyVoteGame.getPublicState(fixture.state, fixture.context);
    expect(publicState.correctOptionId).toBeNull();
    expect(publicState.lastRound).toBeNull();
    expect(publicState.options[0]?.sprite).toMatch(/^\/api\/rooms\/PIKA42\/games\//);
    expect(publicState.options[0]?.sprite).not.toContain('shiny');
    expect(publicState.options.every((option) => !('recolor' in option))).toBe(true);

    const authenticAsset = shinyVoteGame.resolveAsset!(fixture.state, {
      assetToken: fixture.state.assetToken,
      roundNumber: fixture.state.roundNumber,
      assetId: fixture.state.correctOptionId!,
    }, fixture.context);
    const fakeAsset = shinyVoteGame.resolveAsset!(fixture.state, {
      assetToken: fixture.state.assetToken,
      roundNumber: fixture.state.roundNumber,
      assetId: fixture.state.options.find((option) => option.id !== fixture.state.correctOptionId)!.id,
    }, fixture.context);
    expect(authenticAsset).toMatchObject({ transform: 'PIXEL_ART' });
    expect(fakeAsset).toMatchObject({ transform: 'PALETTE_RECOLOR', recolor: expect.any(Object) });

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

  it('hides other players option ids until reveal while exposing completion', () => {
    const fixture = setup(2, 'SAME_POKEMON', 4, [1], false);
    let state = vote(fixture.state, 'pedro', 'C', fixture.context).state;
    let publicState = shinyVoteGame.getPublicState(state, fixture.context);
    expect(publicState.showVotes).toBe(false);
    expect(publicState.votedPlayerIds).toEqual(['pedro']);
    expect(publicState.votes).toEqual({});
    expect(JSON.stringify(publicState)).not.toContain('"optionId":"C"');
    expect((shinyVoteGame.getPlayerState(state, 'pedro', fixture.context) as { vote: { optionId: string } }).vote.optionId).toBe('C');
    state = vote(state, 'ana', 'A', fixture.context).state;
    state = vote(state, 'marta', 'B', fixture.context).state;
    publicState = shinyVoteGame.getPublicState(state, fixture.context);
    expect(publicState.phase).toBe('ROUND_RESULTS');
    expect(publicState.votes).toEqual(state.votes);
  });

  it('does not wait for a disconnected non-voter and preserves an accepted vote after disconnect', () => {
    const fixture = setup();
    let state = vote(fixture.state, 'marta', 'A', fixture.context).state;
    fixture.setNow(1_100);
    fixture.context.players[2]!.connected = false;
    state = vote(state, 'pedro', 'A', fixture.context).state;
    state = vote(state, 'ana', 'B', fixture.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.lastRound?.votes.marta?.optionId).toBe('A');
    expect(state.lastRound?.correctPlayerIds).toEqual(['marta', 'pedro']);
    expect(state.scores.marta).toBe(4);

    const second = setup();
    second.context.players[2]!.connected = false;
    let withoutVote = vote(second.state, 'pedro', 'A', second.context).state;
    withoutVote = vote(withoutVote, 'ana', 'B', second.context).state;
    expect(withoutVote.phase).toBe('ROUND_RESULTS');
    expect(withoutVote.lastRound?.missedPlayerIds).toContain('marta');
  });

  it('ends voting immediately after every participant votes and scores the reveal', () => {
    const fixture = setup();
    let state = vote(fixture.state, 'pedro', 'A', fixture.context).state;
    state = vote(state, 'ana', 'C', fixture.context).state;
    state = vote(state, 'marta', 'A', fixture.context).state;

    expect(state.phase).toBe('ROUND_RESULTS');
    expect(state.nextTransitionAt).toBe(fixture.context.now + 3_000);
    expect(state.scores).toEqual({ pedro: 4, ana: 0, marta: 3 });
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
    expect(state.preparedOptions).toHaveLength(4);
    expect(fixture.preloadedImages).toEqual(state.preparedOptions?.map((option) => option.sprite));

    fixture.setNow(state.nextTransitionAt!);
    const preparedOptions = state.preparedOptions;
    state = shinyVoteGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_ACTIVE');
    expect(state.roundNumber).toBe(2);
    expect(state.options).toEqual(preparedOptions);
    expect(state.preparedOptions).toBeNull();
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
