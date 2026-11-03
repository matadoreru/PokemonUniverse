import type { GameContext, LearnsetPokemonCatalog, Move, Pokemon, PokemonEvolutionInfo, ResolvedLevelUpMove } from '../../index.js';
import { describe, expect, it } from 'vitest';
import { defaultLearnsetGuessConfig } from './config.js';
import { LEARNSET_GUESS_COOLDOWN_MS, LEARNSET_HINT_INTERVAL_MS, LEARNSET_RESULT_DURATION_MS, evolutionHint, groupLearnset, learnsetGuessGame, learnsetReferenceGeneration } from './server.js';
import { LEARNSET_LAST_WARNING_MS, LEARNSET_ORDER_BONUSES, learnsetPoints } from './rules.js';
import type { LearnsetGuessPlayerState, LearnsetGuessState } from './types.js';

const pokemon: Pokemon[] = [
  makePokemon('late-hints', 1, 'Late Hints', 1),
  makePokemon('pikachu', 25, 'Pikachu', 1), makePokemon('charmander', 4, 'Charmander', 1),
  makePokemon('eevee', 133, 'Eevee', 1), makePokemon('mew', 151, 'Mew', 1), makePokemon('treecko', 252, 'Treecko', 3),
];
const move = (id: string, name: string, type: Move['type'], category: Move['category']): Move => ({ id, name, type, category });
const pikachuMoves: ResolvedLevelUpMove[] = [
  learn(move('growl', 'Growl', 'normal', 'status'), 1), learn(move('tail-whip', 'Tail Whip', 'normal', 'status'), 1),
  learn(move('thunder-shock', 'Thunder Shock', 'electric', 'special'), 7), learn(move('nuzzle', 'Nuzzle', 'electric', 'physical'), 7),
  learn(move('electro-ball', 'Electro Ball', 'electric', 'special'), 18), learn(move('spark', 'Spark', 'electric', 'physical'), 20),
  learn(move('discharge', 'Discharge', 'electric', 'special'), 25), learn(move('agility', 'Agility', 'psychic', 'status'), 30),
  learn(move('slam', 'Slam', 'normal', 'physical'), 35), learn(move('thunder', 'Thunder', 'electric', 'special'), 40),
];
const otherMoves = [learn(move('scratch', 'Scratch', 'normal', 'physical'), 1), learn(move('growl', 'Growl', 'normal', 'status'), 1), learn(move('ember', 'Ember', 'fire', 'special'), 7)];
const learnsets = new Map<string, ResolvedLevelUpMove[]>();
for (const generation of [1, 3, 7, 9]) {
  learnsets.set(`late-hints:${generation}`, [learn(move('late-one', 'Late One', 'normal', 'status'), 20), learn(move('late-two', 'Late Two', 'normal', 'physical'), 30)]);
  learnsets.set(`pikachu:${generation}`, pikachuMoves); learnsets.set(`charmander:${generation}`, otherMoves); learnsets.set(`eevee:${generation}`, otherMoves);
  learnsets.set(`mew:${generation}`, [otherMoves[0]!]);
}
learnsets.set('treecko:3', otherMoves); learnsets.set('treecko:7', otherMoves); learnsets.set('treecko:9', otherMoves);
const evolutions: Record<string, PokemonEvolutionInfo> = { 'late-hints': { stage: 1, stages: 1 }, pikachu: { stage: 2, stages: 3 }, charmander: { stage: 1, stages: 3 }, eevee: { stage: 1, stages: 2 }, mew: { stage: 1, stages: 1 }, treecko: { stage: 1, stages: 3 } };

const catalog: LearnsetPokemonCatalog = {
  all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
  levelUpMoves: (id, generation) => learnsets.get(`${id}:${generation}`) ?? [], evolutionInfo: (id) => evolutions[id],
};

function makePokemon(id: string, nationalDexNumber: number, name: string, generation: number): Pokemon { return { id, nationalDexNumber, name, generation, sprite: `/${id}.png`, hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1, baseStatTotal: 6, types: ['normal'] }; }
function learn(entry: Move, level: number): ResolvedLevelUpMove { return { moveId: entry.id, level, move: entry }; }

function setup(overrides: Partial<typeof defaultLearnsetGuessConfig> = {}) {
  let now = 1_000; const context: GameContext = { players: [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }], pokemon: catalog, now, random: () => 0 };
  const config = { ...defaultLearnsetGuessConfig, generations: [1], rounds: 2, ...overrides };
  let state = learnsetGuessGame.createInitialState(config, context); state = learnsetGuessGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; context.now = value; } };
}
function guess(state: LearnsetGuessState, playerId: string, pokemonId: string, context: GameContext) { return learnsetGuessGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context); }

describe('Learnset Guess', () => {
  it('uses the highest enabled generation and only candidates with a valid initial learnset there', () => {
    expect(learnsetReferenceGeneration([1, 3, 7])).toBe(7);
    const fixture = setup({ generations: [1, 3, 7] }); expect(fixture.state.referenceGeneration).toBe(7); expect(fixture.state.correctPokemonId).toBe('pikachu'); expect(fixture.state.correctPokemonId).not.toBe('mew');
  });

  it('sorts moves and groups every move learned at the same level', () => {
    const groups = groupLearnset([...pikachuMoves].reverse()); expect(groups.map((entries) => entries[0]!.level)).toEqual([1, 7, 18, 20, 25, 30, 35, 40]); expect(groups[0]).toHaveLength(2); expect(groups[1]).toHaveLength(2);
  });

  it('initially exposes all and only moves through level 15 with metadata', () => {
    const fixture = setup(); const view = learnsetGuessGame.getPublicState(fixture.state, fixture.context);
    expect(view.visibleGroups.flatMap((group) => group.moves).map((entry) => entry.level)).toEqual([1, 1, 7, 7]);
    expect(view.visibleGroups.flatMap((group) => group.moves)).toContainEqual(expect.objectContaining({ name: 'Thunder Shock', type: 'electric', category: 'special' }));
    expect(view.visibleGroups.flatMap((group) => group.moves).some((entry) => (entry.level ?? 0) > 15)).toBe(false);
  });

  it('uses the Spanish move name when the catalog provides one', () => {
    const spanishCatalog: LearnsetPokemonCatalog = { ...catalog, levelUpMoves: (id, generation) => (catalog.levelUpMoves(id, generation) as ResolvedLevelUpMove[]).map((entry) => ({ ...entry, move: { ...entry.move, names: { es: entry.move.name === 'Growl' ? 'Gruñido' : entry.move.name } } })) };
    const context = { players: [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }], pokemon: spanishCatalog, now: 1_000, random: () => 0 } satisfies GameContext;
    let state = learnsetGuessGame.createInitialState({ ...defaultLearnsetGuessConfig, generations: [1], rounds: 1 }, context); state = learnsetGuessGame.start(state, context);
    expect(learnsetGuessGame.getPublicState(state, context).visibleGroups.flatMap((group) => group.moves).some((entry) => entry.name === 'Gruñido')).toBe(true);
  });

  it('reveals one higher-level block every centralized interval', () => {
    const fixture = setup(); fixture.setNow(fixture.state.nextTransitionAt!); const state = learnsetGuessGame.handleTimeout(fixture.state, fixture.context); const view = learnsetGuessGame.getPublicState(state, fixture.context);
    expect(state.revealedExtraGroups).toBe(1); expect(view.visibleGroups.at(-1)?.moves[0]?.level).toBe(18); expect(state.nextTransitionAt).toBe(fixture.context.now + LEARNSET_HINT_INTERVAL_MS);
  });

  it('can hide levels and evolution independently', () => {
    const hidden = setup({ showLevels: false, showEvolution: false }); const view = learnsetGuessGame.getPublicState(hidden.state, hidden.context);
    expect(view.visibleGroups.every((group) => group.level === null && group.moves.every((entry) => entry.level === null))).toBe(true); expect(view.evolutionHint).toBeNull();
    const visible = setup({ showEvolution: true }); expect(learnsetGuessGame.getPublicState(visible.state, visible.context).evolutionHint).toBe('Evolución intermedia · etapa 2 de 3');
    expect(evolutionHint(1, 1)).toBe('No evoluciona');
  });

  it('publishes incorrect attempts, keeps the round active and enforces cooldown', () => {
    const fixture = setup(); const wrong = guess(fixture.state, 'p1', 'charmander', fixture.context); expect(wrong.accepted).toBe(true); expect(wrong.state.phase).toBe('ROUND_ACTIVE');
    expect(learnsetGuessGame.getPublicState(wrong.state, fixture.context).attempts[0]).toMatchObject({ playerId: 'p1', pokemonId: 'charmander', pokemonName: 'Charmander' });
    expect(guess(wrong.state, 'p1', 'eevee', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Espera/) });
    fixture.setNow(fixture.context.now + LEARNSET_GUESS_COOLDOWN_MS); expect(guess(wrong.state, 'p1', 'eevee', fixture.context).accepted).toBe(true);
  });

  it('marks a correct player privately without exposing or publishing the answer', () => {
    const fixture = setup(); const solved = guess(fixture.state, 'p1', 'pikachu', fixture.context); const publicState = learnsetGuessGame.getPublicState(solved.state, fixture.context);
    expect(solved.state.phase).toBe('ROUND_ACTIVE'); expect(publicState.solvedPlayers).toEqual([{ playerId: 'p1', solveOrder: 1 }]); expect(publicState.attempts).toEqual([]);
    expect(JSON.stringify(publicState)).not.toContain('correctPokemonId'); expect(JSON.stringify(publicState)).not.toContain('Pikachu');
    expect(learnsetGuessGame.getPlayerState(solved.state, 'p1', fixture.context)).toEqual({ canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 7 });
    expect(guess(solved.state, 'p1', 'pikachu', fixture.context).accepted).toBe(false); expect(guess(solved.state, 'p2', 'charmander', fixture.context).accepted).toBe(true);
  });

  it('ends early when all connected players solve and keeps prior solves on disconnect', () => {
    const fixture = setup(); let state = guess(fixture.state, 'p1', 'pikachu', fixture.context).state; fixture.context.players[1]!.connected = false;
    state = learnsetGuessGame.handlePresenceChange!(state, fixture.context); expect(state.phase).toBe('ROUND_RESULTS'); expect(state.solves.p1?.points).toBe(7);
  });

  it('a disconnected player does not add missed', () => {
    const context: GameContext = { players: [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }, { id: 'p3', displayName: 'Luis' }], pokemon: catalog, now: 1_000, random: () => 0 };
    let state = learnsetGuessGame.createInitialState({ ...defaultLearnsetGuessConfig, generations: [1], rounds: 2 }, context); state = learnsetGuessGame.start(state, context);
    state = guess(state, 'p1', 'pikachu', context).state; context.players[2]!.connected = false;
    state = learnsetGuessGame.handlePresenceChange!(state, context); expect(state.phase).toBe('ROUND_ACTIVE');
    context.now = state.roundEndsAt!; state = learnsetGuessGame.handleTimeout(state, context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.playerStats.p1?.missed).toBe(0); expect(state.playerStats.p2?.missed).toBe(1); expect(state.playerStats.p3?.missed).toBe(0);
  });

  it('rejects disconnected players and guesses received at the authoritative deadline', () => {
    const disconnected = setup(); disconnected.context.players[0]!.connected = false;
    expect(guess(disconnected.state, 'p1', 'pikachu', disconnected.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/conectado/) });
    expect((learnsetGuessGame.getPlayerState(disconnected.state, 'p1', disconnected.context) as LearnsetGuessPlayerState).canGuess).toBe(false);

    const expired = setup(); expired.setNow(expired.state.roundEndsAt!);
    const late = guess(expired.state, 'p1', 'pikachu', expired.context);
    expect(late).toMatchObject({ accepted: false, error: expect.stringMatching(/tiempo/) });
    expect(late.state).toMatchObject({ phase: 'ROUND_RESULTS', solves: {} });
  });

  it('times out, reveals the answer and automatically advances after four seconds', () => {
    const fixture = setup(); fixture.setNow(fixture.state.roundEndsAt!); let state = learnsetGuessGame.handleTimeout(fixture.state, fixture.context); const view = learnsetGuessGame.getPublicState(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(view.lastRound?.pokemon).toMatchObject({ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png', generation: 1 }); expect(view.lastRound?.learnset).toHaveLength(pikachuMoves.length); expect(state.nextTransitionAt).toBe(fixture.context.now + LEARNSET_RESULT_DURATION_MS);
    fixture.setNow(state.nextTransitionAt!); state = learnsetGuessGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundNumber).toBe(2);
  });

  it('finishes after N rounds with profile metrics and the solve order breaking an equal stage', () => {
    const fixture = setup({ rounds: 1 }); let state = guess(fixture.state, 'p1', 'pikachu', fixture.context).state; state = guess(state, 'p2', 'pikachu', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = learnsetGuessGame.handleTimeout(state, fixture.context); const results = learnsetGuessGame.getResults(state);
    expect(state.phase).toBe('GAME_RESULTS'); expect(results.winnerId).toBe('p1'); expect(results.standings.map((entry) => entry.won)).toEqual([true, false]);
    expect(results.standings[0]?.stats).toMatchObject({ correct: 1, missed: 0, initialSolves: 1, pointsFromSolves: 7, bestRoundPoints: 7 });
    expect(results.standings[1]?.stats).toMatchObject({ correct: 1, pointsFromSolves: 6, bestRoundPoints: 6 });
  });

  it('ties winners with equal scores', () => {
    const fixture = setup({ rounds: 1 }); let state: LearnsetGuessState = { ...fixture.state, scores: { p1: 0, p2: 1 } }; state = guess(state, 'p1', 'pikachu', fixture.context).state; state = guess(state, 'p2', 'pikachu', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = learnsetGuessGame.handleTimeout(state, fixture.context); const results = learnsetGuessGame.getResults(state);
    expect(state.scores).toEqual({ p1: 7, p2: 7 }); expect(results.winnerId).toBeNull(); expect(results.standings.every((entry) => entry.won)).toBe(true);
  });

  it('reduces points by reveal stage to a configurable floor and allows equal stage scores', () => {
    expect([0, 1, 2, 3, 4, 9].map((stage) => learnsetPoints(stage, 3))).toEqual([5, 4, 3, 2, 1, 1]);
    const fixture = setup(); const staged = { ...fixture.state, revealedExtraGroups: 2 }; let state = guess(staged, 'p1', 'pikachu', fixture.context).state; state = guess(state, 'p2', 'pikachu', fixture.context).state; expect(state.solves.p1).toMatchObject({ points: 5, solveOrder: 1 }); expect(state.solves.p2).toMatchObject({ points: 4, solveOrder: 2 });
  });

  it('restores only safe private progress and rejects spectators', () => {
    const fixture = setup(); const state = guess(fixture.state, 'p1', 'pikachu', fixture.context).state; const restored = learnsetGuessGame.getPlayerState(state, 'p1', fixture.context);
    expect(JSON.stringify(restored)).not.toContain('pikachu'); expect(restored).toMatchObject({ solved: true, canGuess: false });
    expect(guess(state, 'spectator', 'pikachu', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/conectado/) });
  });
  describe('order bonus and last warning', () => {
    function trio(roundSeconds = 60) {
      const context: GameContext = { players: [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }, { id: 'p3', displayName: 'Luis' }], pokemon: catalog, now: 1_000, random: () => 0 };
      let state = learnsetGuessGame.createInitialState({ ...defaultLearnsetGuessConfig, generations: [1], rounds: 2, roundSeconds }, context);
      expect(state.lastWarning).toBe(false);
      state = learnsetGuessGame.start(state, context);
      return { state, context };
    }

    it('rules', () => {
      expect(LEARNSET_ORDER_BONUSES).toEqual([2, 1]); expect(LEARNSET_LAST_WARNING_MS).toBe(10_000);
      expect(learnsetPoints(0, 1)).toBe(7); expect(learnsetPoints(0, 2)).toBe(6); expect(learnsetPoints(0, 3)).toBe(5); expect(learnsetPoints(4, 1)).toBe(3); expect(learnsetPoints(6, 3)).toBe(1);
    });

    it('the first two solvers earn the order bonus', () => {
      const { state: initial, context } = trio(); let state = initial;
      state = guess(state, 'p1', 'pikachu', context).state; state = guess(state, 'p2', 'pikachu', context).state; state = guess(state, 'p3', 'pikachu', context).state;
      expect([state.solves.p1?.points, state.solves.p2?.points, state.solves.p3?.points]).toEqual([7, 6, 5]);
      expect(state.scores).toEqual({ p1: 7, p2: 6, p3: 5 });
      expect([state.playerStats.p1, state.playerStats.p2, state.playerStats.p3].map((stats) => [stats?.pointsFromSolves, stats?.bestRoundPoints])).toEqual([[7, 7], [6, 6], [5, 5]]);
      expect((learnsetGuessGame.getPlayerState(state, 'p2', context) as LearnsetGuessPlayerState).roundPoints).toBe(6);
    });

    it('cuts the round to 10 s when only one player is missing', () => {
      const { state: initial, context } = trio(); const start = context.now; expect(initial.roundEndsAt).toBe(start + 60_000);
      context.now = start + 5_000; let state = guess(initial, 'p1', 'pikachu', context).state;
      expect(state.lastWarning).toBe(false); expect(learnsetGuessGame.getPublicState(state, context).lastWarning).toBe(false); expect(state.roundEndsAt).toBe(start + 60_000);
      state = guess(state, 'p2', 'pikachu', context).state;
      expect(state.roundEndsAt).toBe(start + 15_000); expect(state.lastWarning).toBe(true);
      expect(state.nextTransitionAt === null || state.nextTransitionAt < state.roundEndsAt!).toBe(true);
      const view = learnsetGuessGame.getPublicState(state, context); expect(view.lastWarning).toBe(true); expect(view.roundEndsAt).toBe(start + 15_000);
      expect(JSON.stringify(view)).not.toContain('Pikachu'); expect(JSON.stringify(view)).not.toContain('pikachu');
      context.now = start + 15_000; state = learnsetGuessGame.handleTimeout(state, context);
      expect(state.phase).toBe('ROUND_RESULTS'); expect(state.playerStats.p3?.missed).toBe(1);
      expect(learnsetGuessGame.getPublicState(state, context).lastWarning).toBe(false);
    });

    it('drops a pending hint that would fall at or after the cut deadline', () => {
      const { state: initial, context } = trio(); const start = context.now;
      context.now = start + 6_000; let state = guess(initial, 'p1', 'pikachu', context).state; state = guess(state, 'p2', 'pikachu', context).state;
      expect(state.roundEndsAt).toBe(start + 16_000); expect(state.nextTransitionAt).toBe(start + LEARNSET_HINT_INTERVAL_MS);
      context.now = start + 7_000; state = learnsetGuessGame.handleTimeout(state, context);
      expect(state.revealedExtraGroups).toBe(1); expect(state.nextTransitionAt).toBe(start + 14_000);
      const late = { ...initial, nextTransitionAt: start + 20_000 }; context.now = start + 6_000;
      let cut = guess(late, 'p1', 'pikachu', context).state; cut = guess(cut, 'p2', 'pikachu', context).state;
      expect(cut.roundEndsAt).toBe(start + 16_000); expect(cut.nextTransitionAt).toBeNull();
      const atEnd = { ...initial, nextTransitionAt: start + 16_000 };
      let edge = guess(atEnd, 'p1', 'pikachu', context).state; edge = guess(edge, 'p2', 'pikachu', context).state;
      expect(edge.nextTransitionAt).toBeNull();
    });

    it('last warning never extends a closer deadline', () => {
      const { state: initial, context } = trio(); const end = initial.roundEndsAt!;
      let state = guess(initial, 'p1', 'pikachu', context).state; context.now = end - 4_000; state = guess(state, 'p2', 'pikachu', context).state;
      expect(state.roundEndsAt).toBe(end); expect(state.lastWarning).toBe(true);
    });

    it('a disconnect can trigger the last warning', () => {
      const { state: initial, context } = trio(); const start = context.now;
      let state = guess(initial, 'p1', 'pikachu', context).state; expect(state.lastWarning).toBe(false);
      context.now = start + 3_000; context.players[2]!.connected = false; state = learnsetGuessGame.handlePresenceChange!(state, context);
      expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.lastWarning).toBe(true); expect(state.roundEndsAt).toBe(start + 13_000);
      expect(learnsetGuessGame.getPublicState(state, context).lastWarning).toBe(true);
      context.players[2]!.connected = true; state = learnsetGuessGame.handlePresenceChange!(state, context);
      expect(state.roundEndsAt).toBe(start + 13_000);
    });

    it('the missing player leaving resolves the round instead of warning', () => {
      const { state: initial, context } = trio();
      let state = guess(initial, 'p1', 'pikachu', context).state; state = guess(state, 'p2', 'pikachu', context).state;
      context.players[2]!.connected = false; state = learnsetGuessGame.handlePresenceChange!(state, context);
      expect(state.phase).toBe('ROUND_RESULTS');
    });

    it('no warning while two players are missing', () => {
      const { state: initial, context } = trio(); const end = initial.roundEndsAt!;
      const state = guess(initial, 'p1', 'pikachu', context).state;
      expect(state.lastWarning).toBe(false); expect(state.roundEndsAt).toBe(end);
      const unsolved = learnsetGuessGame.handlePresenceChange!(initial, { ...context, players: context.players.map((player) => player.id === 'p3' ? { ...player, connected: false } : player) });
      expect(unsolved.lastWarning).toBe(false); expect(unsolved.roundEndsAt).toBe(end);
    });

    it('the warning resets next round', () => {
      const { state: initial, context } = trio(); const start = context.now;
      let state = guess(initial, 'p1', 'pikachu', context).state; state = guess(state, 'p2', 'pikachu', context).state; expect(state.lastWarning).toBe(true);
      context.now = state.roundEndsAt!; state = learnsetGuessGame.handleTimeout(state, context); expect(state.phase).toBe('ROUND_RESULTS');
      context.now = state.nextTransitionAt!; state = learnsetGuessGame.handleTimeout(state, context);
      expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundNumber).toBe(2); expect(state.lastWarning).toBe(false);
      expect(state.roundEndsAt).toBe(context.now + 60_000); expect(learnsetGuessGame.getPublicState(state, context).lastWarning).toBe(false);
      expect(start).toBeLessThan(context.now);
    });
  });
});
