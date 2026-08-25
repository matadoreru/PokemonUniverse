import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { officialSubjectiveCategories } from './categories.js';
import { defaultOneOfUsIsFakeConfig } from './config.js';
import { FAKE_ROUND_POINTS, NORMAL_ROUND_POINTS } from './rules.js';
import { FAKE_CHOICE_REVEAL_MS, FAKE_ROUND_RESULT_MS, oneOfUsIsFakeGame } from './server.js';
import type { OneOfUsIsFakePlayerState, OneOfUsIsFakeState } from './types.js';

const entries: Pokemon[] = [
  pokemon('bulbasaur', 'Bulbasaur', 1), pokemon('charizard', 'Charizard', 1),
  pokemon('lucario', 'Lucario', 4), pokemon('sprigatito', 'Sprigatito', 9),
  { ...pokemon('vulpix-alola', 'Vulpix de Alola', 1), isDefault: false },
];

function pokemon(id: string, name: string, generation: number): Pokemon {
  return {
    id, name, generation, nationalDexNumber: 1, sprite: `/${id}.png`, hp: 50, attack: 50, defense: 50,
    specialAttack: 50, specialDefense: 50, speed: 50, baseStatTotal: 300, heightDecimeters: 10,
    weightHectograms: 100, legendaryStatus: 'NORMAL', abilities: [], types: ['normal'],
    evolutionStage: 1, evolutionStageCount: 1,
  };
}

const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((pokemon) => pokemon.id === id),
  byDexNumber: (number) => entries.find((pokemon) => pokemon.nationalDexNumber === number),
  forGenerations: (generations, options) => entries.filter((pokemon) => generations.includes(pokemon.generation) && (options?.includeForms || pokemon.isDefault !== false)),
};

function setup(overrides: Partial<typeof defaultOneOfUsIsFakeConfig> = {}, randomValues: number[] = []) {
  const context: GameContext = {
    players: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, displayName: id.toUpperCase(), connected: true, active: true })),
    pokemon: catalog, now: 1_000, random: () => randomValues.shift() ?? 0,
    hostCustomCategories: [{ id: 'c1', text: 'Pokémon para ir al gimnasio' }, { id: 'c2', text: 'Pokémon para dormir la siesta' }, { id: 'c3', text: 'Pokémon para ganar un concurso' }],
  };
  const config = { ...defaultOneOfUsIsFakeConfig, generations: [1, 4, 9], rounds: 2, ...overrides };
  let state = oneOfUsIsFakeGame.createInitialState(config, context);
  state = oneOfUsIsFakeGame.start(state, context);
  return { state, context, setNow(now: number) { context.now = now; } };
}

function selectAll(state: OneOfUsIsFakeState, context: GameContext, ids = ['bulbasaur', 'charizard', 'bulbasaur', 'lucario']): OneOfUsIsFakeState {
  let next = state;
  state.playerIds.forEach((playerId, index) => {
    const result = oneOfUsIsFakeGame.handleAction(next, playerId, { type: 'SELECT_POKEMON', pokemonId: ids[index]! }, context);
    expect(result.accepted).toBe(true); next = result.state;
  });
  return next;
}

function toDiscussion(state: OneOfUsIsFakeState, fixture: ReturnType<typeof setup>): OneOfUsIsFakeState {
  let next = selectAll(state, fixture.context);
  expect(next.phase).toBe('CHOICE_REVEAL');
  while (next.phase === 'CHOICE_REVEAL') {
    fixture.setNow(next.nextTransitionAt!);
    next = oneOfUsIsFakeGame.handleTimeout(next, fixture.context);
  }
  return next;
}

function vote(state: OneOfUsIsFakeState, voterId: string, targetId: string, context: GameContext): OneOfUsIsFakeState {
  const result = oneOfUsIsFakeGame.handleAction(state, voterId, { type: 'VOTE_PLAYER', playerId: targetId }, context);
  expect(result.accepted).toBe(true); return result.state;
}

describe('One of Us Is Fake', () => {
  it('ships an extensible official catalog of subjective prompts', () => {
    expect(officialSubjectiveCategories.length).toBeGreaterThanOrEqual(45);
    expect(officialSubjectiveCategories.map((category) => category.text)).toContain('Pokémon que parecen mascotas');
    expect(new Set(officialSubjectiveCategories.map((category) => category.id)).size).toBe(officialSubjectiveCategories.length);
  });

  it('selects the fake independently every round, so the same player can repeat', () => {
    const fixture = setup({ rounds: 2 });
    expect(fixture.state.fakePlayerId).toBe('p1');
    let state = toDiscussion(fixture.state, fixture);
    state = vote(state, 'p1', 'p2', fixture.context);
    state = vote(state, 'p2', 'p1', fixture.context);
    state = vote(state, 'p3', 'p1', fixture.context);
    state = vote(state, 'p4', 'p1', fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    fixture.setNow(state.nextTransitionAt!);
    state = oneOfUsIsFakeGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.fakePlayerId).toBe('p1');
  });

  it('does not tell the fake by default, and only marks that player when configured', () => {
    const hidden = setup({ fakeKnows: false });
    const hiddenFake = oneOfUsIsFakeGame.getPlayerState(hidden.state, hidden.state.fakePlayerId!, hidden.context) as OneOfUsIsFakePlayerState;
    expect(hiddenFake).not.toHaveProperty('isFake');
    const informed = setup({ fakeKnows: true });
    expect(oneOfUsIsFakeGame.getPlayerState(informed.state, informed.state.fakePlayerId!, informed.context)).toMatchObject({ isFake: true });
    const normalId = informed.state.playerIds.find((id) => id !== informed.state.fakePlayerId)!;
    expect(oneOfUsIsFakeGame.getPlayerState(informed.state, normalId, informed.context)).not.toHaveProperty('isFake');
  });

  it('keeps categories, fake identity and other choices private until their reveal', () => {
    const fixture = setup(); const state = fixture.state;
    const publicJson = JSON.stringify(oneOfUsIsFakeGame.getPublicState(state, fixture.context));
    expect(publicJson).not.toContain(state.mainCategoryId!); expect(publicJson).not.toContain(state.fakeCategoryId!);
    expect(oneOfUsIsFakeGame.getPublicState(state, fixture.context)).not.toHaveProperty('fakePlayerId');
    const fakeView = oneOfUsIsFakeGame.getPlayerState(state, state.fakePlayerId!, fixture.context) as Extract<OneOfUsIsFakePlayerState, { role: 'PLAYER' }>;
    expect(fakeView.myCategory).toBeTruthy(); expect(JSON.stringify(fakeView)).not.toContain(state.mainCategoryId!);
    const selected = oneOfUsIsFakeGame.handleAction(state, 'p1', { type: 'SELECT_POKEMON', pokemonId: 'charizard' }, fixture.context).state;
    const publicSelection = oneOfUsIsFakeGame.getPublicState(selected, fixture.context);
    expect(publicSelection.selectionCompletedIds).toEqual(['p1']); expect(JSON.stringify(publicSelection)).not.toContain('charizard');
  });

  it('accepts any in-pool Pokémon, exact forms and repeated choices without category validation', () => {
    const fixture = setup({ includeRegionalForms: true });
    let state = oneOfUsIsFakeGame.handleAction(fixture.state, 'p1', { type: 'SELECT_POKEMON', pokemonId: 'vulpix-alola' }, fixture.context).state;
    state = oneOfUsIsFakeGame.handleAction(state, 'p2', { type: 'SELECT_POKEMON', pokemonId: 'vulpix-alola' }, fixture.context).state;
    expect(state.selections.p1?.id).toBe('vulpix-alola'); expect(state.selections.p2?.id).toBe('vulpix-alola');
    const noForms = setup({ includeRegionalForms: false });
    expect(oneOfUsIsFakeGame.handleAction(noForms.state, 'p1', { type: 'SELECT_POKEMON', pokemonId: 'vulpix-alola' }, noForms.context)).toMatchObject({ accepted: false });
    const genOne = setup({ generations: [1] });
    expect(oneOfUsIsFakeGame.handleAction(genOne.state, 'p1', { type: 'SELECT_POKEMON', pokemonId: 'lucario' }, genOne.context)).toMatchObject({ accepted: false });
  });

  it('reveals choices in random order, one at a time, then keeps them visible for discussion', () => {
    const fixture = setup({}, [0, 0, 0.99, 0, 0, 0, 0]);
    let state = selectAll(fixture.state, fixture.context);
    expect(oneOfUsIsFakeGame.getPublicState(state, fixture.context).revealedChoices).toEqual([]);
    const order = [...state.revealOrder];
    fixture.setNow(state.nextTransitionAt!); state = oneOfUsIsFakeGame.handleTimeout(state, fixture.context);
    expect(oneOfUsIsFakeGame.getPublicState(state, fixture.context).revealedChoices.map((choice) => choice.playerId)).toEqual(order.slice(0, 1));
    expect(state.nextTransitionAt).toBe(fixture.context.now + FAKE_CHOICE_REVEAL_MS);
    while (state.phase === 'CHOICE_REVEAL') { fixture.setNow(state.nextTransitionAt!); state = oneOfUsIsFakeGame.handleTimeout(state, fixture.context); }
    expect(state.phase).toBe('DISCUSSION'); expect(oneOfUsIsFakeGame.getPublicState(state, fixture.context).revealedChoices).toHaveLength(4);
  });

  it('ends discussion as soon as connected players vote while keeping ballot targets secret', () => {
    const fixture = setup(); let state = toDiscussion(fixture.state, fixture);
    state = vote(state, 'p1', 'p2', fixture.context);
    const publicVote = oneOfUsIsFakeGame.getPublicState(state, fixture.context);
    expect(publicVote.votedPlayerIds).toEqual(['p1']); expect(JSON.stringify(publicVote)).not.toContain('"p1":"p2"');
    state = vote(state, 'p2', 'p1', fixture.context); state = vote(state, 'p3', 'p1', fixture.context); state = vote(state, 'p4', 'p1', fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.roundEndsAt).toBeNull();
    const selfFixture = setup(); const selfState = toDiscussion(selfFixture.state, selfFixture);
    expect(oneOfUsIsFakeGame.handleAction(selfState, 'p1', { type: 'VOTE_PLAYER', playerId: 'p1' }, selfFixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/mismo/) });
  });

  it('revotes only among tied leaders, repeats when the tie shrinks, then breaks an unchanged tie randomly', () => {
    const fixture = setup({}, [0, 0, 0, 0, 0, 0, 0, 0, 0]); let state = toDiscussion(fixture.state, fixture);
    state = vote(state, 'p1', 'p2', fixture.context); state = vote(state, 'p2', 'p3', fixture.context);
    state = vote(state, 'p3', 'p4', fixture.context); state = vote(state, 'p4', 'p1', fixture.context);
    expect(state.phase).toBe('REVOTE'); expect(state.voteCandidates).toEqual(expect.arrayContaining(['p1', 'p2', 'p3', 'p4']));
    state = vote(state, 'p1', 'p2', fixture.context); state = vote(state, 'p2', 'p1', fixture.context);
    state = vote(state, 'p3', 'p1', fixture.context); state = vote(state, 'p4', 'p2', fixture.context);
    expect(state.phase).toBe('REVOTE'); expect(state.voteCandidates).toEqual(['p1', 'p2']); expect(state.voteRoundNumber).toBe(3);
    state = vote(state, 'p1', 'p2', fixture.context); state = vote(state, 'p2', 'p1', fixture.context);
    state = vote(state, 'p3', 'p1', fixture.context); state = vote(state, 'p4', 'p2', fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(['p1', 'p2']).toContain(state.lastRound?.selectedPlayerId);
    expect(state.lastRound?.voteRounds).toHaveLength(3);
  });

  it('awards the whole normal team when they find the fake, otherwise only the fake', () => {
    const normalFixture = setup(); let normal = toDiscussion(normalFixture.state, normalFixture);
    const fake = normal.fakePlayerId!; const normalTarget = normal.playerIds.find((id) => id !== fake)!;
    for (const voter of normal.playerIds) normal = vote(normal, voter, voter === fake ? normalTarget : fake, normalFixture.context);
    expect(normal.lastRound?.winner).toBe('NORMALS'); expect(normal.scores[fake]).toBe(0);
    for (const id of normal.playerIds.filter((id) => id !== fake)) expect(normal.scores[id]).toBe(NORMAL_ROUND_POINTS);
    const fakeFixture = setup(); let fakeWin = toDiscussion(fakeFixture.state, fakeFixture);
    const fakeId = fakeWin.fakePlayerId!; const wrong = fakeWin.playerIds.find((id) => id !== fakeId)!;
    for (const voter of fakeWin.playerIds) fakeWin = vote(fakeWin, voter, voter === wrong ? fakeId : wrong, fakeFixture.context);
    expect(fakeWin.lastRound?.winner).toBe('FAKE'); expect(fakeWin.scores[fakeId]).toBe(FAKE_ROUND_POINTS);
    expect(fakeWin.playerStats[fakeId]).toMatchObject({ victoriesAsFake: 1, fakeUndiscovered: 1 });
    expect(fakeWin.playerStats[wrong]?.normalWronglySelected).toBe(1);
  });

  it('uses custom categories, avoids prompt repetition while unused prompts remain, and rejects insufficient pools', () => {
    const custom = setup({ categorySource: 'CUSTOM', rounds: 2 });
    expect(custom.state.categoryPool).toHaveLength(3); expect(custom.state.categoryPool.every((category) => category.id.startsWith('custom-'))).toBe(true);
    const firstIds = [custom.state.mainCategoryId, custom.state.fakeCategoryId];
    let state = toDiscussion(custom.state, custom);
    state = vote(state, 'p1', 'p2', custom.context); state = vote(state, 'p2', 'p1', custom.context);
    state = vote(state, 'p3', 'p1', custom.context); state = vote(state, 'p4', 'p1', custom.context);
    custom.setNow(state.nextTransitionAt!); state = oneOfUsIsFakeGame.handleTimeout(state, custom.context);
    expect([state.mainCategoryId, state.fakeCategoryId].some((id) => !firstIds.includes(id))).toBe(true);
    const context = { ...custom.context, hostCustomCategories: [{ id: 'only', text: 'Solo una' }] };
    expect(() => oneOfUsIsFakeGame.createInitialState({ ...custom.state.config, categorySource: 'CUSTOM' }, context)).toThrow(/2 categorías/);
  });

  it('does not let disconnected players block selection or voting and restores private state on reconnect', () => {
    const fixture = setup(); fixture.context.players[3]!.connected = false;
    let state = fixture.state;
    for (const id of ['p1', 'p2', 'p3']) state = oneOfUsIsFakeGame.handleAction(state, id, { type: 'SELECT_POKEMON', pokemonId: 'bulbasaur' }, fixture.context).state;
    expect(state.phase).toBe('CHOICE_REVEAL');
    while (state.phase === 'CHOICE_REVEAL') { fixture.setNow(state.nextTransitionAt!); state = oneOfUsIsFakeGame.handleTimeout(state, fixture.context); }
    state = vote(state, 'p1', 'p2', fixture.context); state = vote(state, 'p2', 'p1', fixture.context); state = vote(state, 'p3', 'p1', fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS');
    fixture.context.players[3]!.connected = true;
    expect(oneOfUsIsFakeGame.getPlayerState(state, 'p4', fixture.context)).toMatchObject({ role: 'PLAYER', myCategory: expect.any(String) });
  });

  it('finishes configured rounds with generic standings and all profile metrics', () => {
    const fixture = setup({ rounds: 1 }); let state = toDiscussion(fixture.state, fixture);
    state = vote(state, 'p1', 'p2', fixture.context); state = vote(state, 'p2', 'p1', fixture.context);
    state = vote(state, 'p3', 'p1', fixture.context); state = vote(state, 'p4', 'p1', fixture.context);
    fixture.setNow(state.nextTransitionAt!); state = oneOfUsIsFakeGame.handleTimeout(state, fixture.context);
    expect(state.phase).toBe('GAME_RESULTS'); expect(fixture.context.now).toBe(1_000 + (4 * FAKE_CHOICE_REVEAL_MS) + FAKE_ROUND_RESULT_MS);
    const results = oneOfUsIsFakeGame.getResults(state); expect(results.standings).toHaveLength(4);
    expect(results.standings[0]?.stats).toEqual(expect.objectContaining({
      roundsPlayed: 1, victoriesAsFake: expect.any(Number), victoriesAsNormal: expect.any(Number), timesFake: expect.any(Number),
      fakeDiscovered: expect.any(Number), fakeUndiscovered: expect.any(Number), correctVotes: expect.any(Number),
      incorrectVotes: expect.any(Number), normalWronglySelected: expect.any(Number),
    }));
  });
});
