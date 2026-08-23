import { describe, expect, it } from 'vitest'; import type { GameContext, GamePlayer, HigherLowerConfig, HigherLowerPlayerState, HigherLowerState, Pokemon, PokemonCatalog } from '../../index.js'; import { defaultHigherLowerConfig, higherLowerConfigSchema, higherLowerGame, pokemonCategoryValue, selectPokemonByDifficulty, streakBonus } from '../../index.js';
const pokemon: Pokemon[] = [
  { id: 'alpha', name: 'Alpha', nationalDexNumber: 1, generation: 1, sprite: '/a.png', hp: 50, attack: 100, defense: 80, specialAttack: 70, specialDefense: 60, speed: 90, baseStatTotal: 450, types: ['fire'] },
  { id: 'beta', name: 'Beta', nationalDexNumber: 2, generation: 1, sprite: '/b.png', hp: 50, attack: 130, defense: 70, specialAttack: 80, specialDefense: 60, speed: 80, baseStatTotal: 470, types: ['water'] },
  { id: 'gamma', name: 'Gamma', nationalDexNumber: 152, generation: 2, sprite: '/c.png', hp: 40, attack: 70, defense: 60, specialAttack: 50, specialDefense: 50, speed: 60, baseStatTotal: 330, types: ['grass'] },
];
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((p) => p.id === id), byDexNumber: (n) => pokemon.find((p) => p.nationalDexNumber === n), forGenerations: (g) => pokemon.filter((p) => g.includes(p.generation)) };
const players: GamePlayer[] = [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }];
function setup(overrides: Partial<HigherLowerConfig> = {}) { let now = 1_000; let random = 0; const context: GameContext = { players: players.map((player) => ({ ...player })), pokemon: catalog, get now() { return now; }, random: () => random }; const config: HigherLowerConfig = { ...defaultHigherLowerConfig, generations: [1], categories: ['ATTACK'], rounds: 2, ...overrides }; let state = higherLowerGame.createInitialState(config, context); state = higherLowerGame.start(state, context); return { state, context, setNow: (n: number) => { now = n; }, setRandom: (n: number) => { random = n; } }; }
function answerAll(state: HigherLowerState, context: GameContext, p1: 'HIGHER' | 'SAME' | 'LOWER', p2 = p1) { let next = higherLowerGame.handleAction(state, 'p1', { type: 'ANSWER', choice: p1 }, context).state; next = higherLowerGame.handleAction(next, 'p2', { type: 'ANSWER', choice: p2 }, context).state; return next; }
describe('Higher or Lower', () => {
  it('uses Normal as the default difficulty and validates all five levels', () => {
    expect(defaultHigherLowerConfig.difficulty).toBe('NORMAL');
    for (const difficulty of ['VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'] as const) {
      expect(higherLowerConfigSchema.parse({ ...defaultHigherLowerConfig, difficulty }).difficulty).toBe(difficulty);
    }
  });
  it('makes comparisons progressively closer as difficulty increases', () => {
    const previous = pokemon[0]!;
    const attacks = [100, 105, 110, 120, 140];
    const candidates = attacks.map((attack, index): Pokemon => ({
      ...pokemon[1]!, id: `difficulty-${index}`, nationalDexNumber: index + 10, attack,
    }));
    const selected = (difficulty: HigherLowerConfig['difficulty']) => selectPokemonByDifficulty(previous, candidates, 'ATTACK', difficulty, () => 0);
    const differences = ['VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'].map((difficulty) =>
      Math.abs(pokemonCategoryValue(selected(difficulty as HigherLowerConfig['difficulty']), 'ATTACK') - previous.attack));
    expect(differences).toEqual([40, 20, 10, 5, 0]);
  });
  it('keeps random selection among equally suitable candidates', () => {
    const previous = pokemon[0]!;
    const candidates = [
      { ...pokemon[1]!, id: 'tie-a', nationalDexNumber: 10, attack: 100 },
      { ...pokemon[1]!, id: 'tie-b', nationalDexNumber: 11, attack: 100 },
      { ...pokemon[1]!, id: 'far', nationalDexNumber: 12, attack: 150 },
    ];
    expect(selectPokemonByDifficulty(previous, candidates, 'ATTACK', 'VERY_HARD', () => 0).id).toBe('tie-a');
    expect(selectPokemonByDifficulty(previous, candidates, 'ATTACK', 'VERY_HARD', () => 0.99).id).toBe('tie-b');
  });
  it('uses only enabled categories and configured generations', () => { const f = setup({ categories: ['HP', 'SPEED'], generations: [1] }); expect(['HP', 'SPEED']).toContain(f.state.category); expect([f.state.previousPokemonId, f.state.currentPokemonId].every((id) => catalog.byId(id!)?.generation === 1)).toBe(true); });
  it('scores Higher and Lower correctly', () => { const f = setup(); expect(answerAll(f.state, f.context, 'HIGHER').scores).toEqual({ p1: 1, p2: 1 }); const lowerState = { ...f.state, previousPokemonId: 'beta', currentPokemonId: 'alpha' }; expect(answerAll(lowerState, f.context, 'LOWER').scores.p1).toBe(1); });
  it('scores Same with three points', () => { const f = setup({ categories: ['HP'] }); const result = answerAll(f.state, f.context, 'SAME'); expect(result.lastRound?.correctAnswer).toBe('SAME'); expect(result.scores.p1).toBe(3); expect(result.playerStats.p1?.sameCorrect).toBe(1); });
  it('resets streak on failure or timeout and grants centralized bonuses', () => { const f = setup(); let state: HigherLowerState = { ...f.state, streaks: { p1: 2, p2: 4 } }; state = answerAll(state, f.context, 'HIGHER', 'LOWER'); expect(state.lastRound?.outcomes.p1).toMatchObject({ streak: 3, streakBonus: 1, awardedPoints: 2 }); expect(state.streaks.p2).toBe(0); expect(streakBonus(5)).toBe(2); expect(streakBonus(10)).toBe(4); });
  it('reveals on timeout and resets non-responder streaks', () => { const f = setup(); const state = { ...f.state, streaks: { p1: 4, p2: 2 } }; f.setNow(state.roundEndsAt!); const result = higherLowerGame.handleTimeout(state, f.context); expect(result.phase).toBe('ROUND_RESULTS'); expect(result.streaks).toEqual({ p1: 0, p2: 0 }); });
  it('shows or hides only the prior numeric value', () => { const visible = setup({ showPreviousValue: true }); expect(higherLowerGame.getPublicState(visible.state, visible.context).previousPokemon.value).toBe(100); const hidden = setup({ showPreviousValue: false }); const view = higherLowerGame.getPublicState(hidden.state, hidden.context); expect(view.previousPokemon.value).toBeNull(); expect(view.previousPokemon.name).toBe('Alpha'); });
  it('supports realtime and reveal-only public answers', () => { const realtime = setup({ answerVisibility: 'REALTIME' }); const answered = higherLowerGame.handleAction(realtime.state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, realtime.context).state; expect(higherLowerGame.getPublicState(answered, realtime.context).answers.p1?.choice).toBe('HIGHER'); const hidden = setup({ answerVisibility: 'REVEAL' }); const hiddenAnswered = higherLowerGame.handleAction(hidden.state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, hidden.context).state; const view = higherLowerGame.getPublicState(hiddenAnswered, hidden.context); expect(view.answers).toEqual({}); expect(view.answeredIds).toEqual(['p1']); });
  it('reveals both values and correct answer', () => { const f = setup(); const result = answerAll(f.state, f.context, 'HIGHER'); const view = higherLowerGame.getPublicState(result, f.context); expect(view.currentPokemon.value).toBe(130); expect(view.lastRound?.correctAnswer).toBe('HIGHER'); });
  it('finishes after configured rounds', () => { const f = setup({ rounds: 1 }); let state = answerAll(f.state, f.context, 'HIGHER'); f.setNow(state.nextTransitionAt!); state = higherLowerGame.handleTimeout(state, f.context); expect(state.phase).toBe('GAME_RESULTS'); expect(higherLowerGame.getResults(state).standings).toHaveLength(2); });
  it('restores own locked answer on reconnect', () => { const f = setup(); const state = higherLowerGame.handleAction(f.state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, f.context).state; const restored = higherLowerGame.getPlayerState(state, 'p1', f.context) as HigherLowerPlayerState; expect(restored).toMatchObject({ canAnswer: false, answer: { choice: 'HIGHER' } }); });
  it('reveals as soon as every connected player answered and keeps prior answers', () => { const f = setup(); let state = higherLowerGame.handleAction(f.state, 'p2', { type: 'ANSWER', choice: 'HIGHER' }, f.context).state; f.context.players[1]!.connected = false; state = higherLowerGame.handleAction(state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, f.context).state; expect(state.phase).toBe('ROUND_RESULTS'); expect(state.answers.p2?.choice).toBe('HIGHER'); });
});
