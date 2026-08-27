import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { describe, expect, it } from 'vitest';
import { defaultSketchmonConfig } from './config.js';
import { SKETCHMON_DRAWER_POINTS, sketchmonGuesserPoints } from './rules.js';
import { SKETCHMON_GUESS_COOLDOWN_MS, SKETCHMON_REVEAL_MS, SKETCHMON_SPRITE_PREVIEW_MS, sketchmonGame } from './server.js';
import type { SketchmonPlayerState, SketchmonState } from './types.js';

const entries: Pokemon[] = [
  pokemon('bulbasaur', 'Bulbasaur', 1, ['grass', 'poison']),
  pokemon('charizard', 'Charizard', 1, ['fire', 'flying']),
  pokemon('chikorita', 'Chikorita', 2, ['grass']),
  { ...pokemon('vulpix-alola', 'Vulpix de Alola', 1, ['ice']), isDefault: false, nationalDexNumber: 37 },
];

function pokemon(id: string, name: string, generation: number, types: Pokemon['types']): Pokemon {
  return {
    id, name, generation, nationalDexNumber: { bulbasaur: 1, charizard: 6, chikorita: 152 }[id] ?? 1,
    sprite: `/${id}.png`, hp: 70, attack: 70, defense: 70, specialAttack: 70, specialDefense: 70,
    speed: 70, baseStatTotal: 420, evolutionStage: id === 'charizard' ? 3 : 1,
    evolutionStageCount: id === 'charizard' ? 3 : 3, types,
  };
}

const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((entry) => entry.id === id),
  byDexNumber: (number) => entries.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations, options) => entries.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)),
};

function setup(overrides: Partial<typeof defaultSketchmonConfig> = {}, playerCount = 3) {
  let now = 1_000;
  const randomValues = [0.99, 0.99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const context: GameContext = {
    players: [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }, { id: 'p3', displayName: 'Carlos' }].slice(0, playerCount),
    pokemon: catalog, now, random: () => randomValues.shift() ?? 0,
  };
  const config = { ...defaultSketchmonConfig, generations: [1], includeForms: false, ...overrides };
  let state = sketchmonGame.createInitialState(config, context);
  state = sketchmonGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; context.now = value; } };
}

function guess(state: SketchmonState, playerId: string, pokemonId: string, context: GameContext) {
  return sketchmonGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context);
}

function draw(state: SketchmonState, playerId: string, context: GameContext) {
  return sketchmonGame.handleAction(state, playerId, {
    type: 'DRAW_BATCH', operations: [{ kind: 'START', stroke: {
      id: 'stroke_1', tool: 'PENCIL', color: '#182033', width: 8,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }],
    } }],
  }, context);
}

function advanceResult(state: SketchmonState, fixture: ReturnType<typeof setup>): SketchmonState {
  fixture.setNow(state.nextTransitionAt!);
  return sketchmonGame.handleTimeout(state, fixture.context);
}

describe('Sketchmon', () => {
  it('uses the requested four speed bands', () => {
    expect([0, 19_999, 20_000, 39_999, 40_000, 59_999, 60_000, 90_000].map(sketchmonGuesserPoints))
      .toEqual([5, 5, 4, 4, 3, 3, 2, 2]);
  });

  it('shuffles each lap independently and lets everyone draw once per lap', () => {
    const fixture = setup({ laps: 2 }); let state = fixture.state; const drawers: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      drawers.push(state.drawerId!); fixture.setNow(state.roundEndsAt!);
      state = sketchmonGame.handleTimeout(state, fixture.context);
      state = advanceResult(state, fixture);
    }
    expect(drawers.slice(0, 3)).toEqual(['p1', 'p2', 'p3']);
    expect(drawers.slice(3)).toEqual(['p2', 'p3', 'p1']);
    expect(state.phase).toBe('GAME_RESULTS');
    expect(Object.values(state.playerStats).map((stats) => stats.drawingRounds)).toEqual([2, 2, 2]);
  });

  it('accepts normalized drawing batches only from the drawer and supports undo and clear', () => {
    const fixture = setup();
    const rejected = draw(fixture.state, 'p2', fixture.context);
    expect(rejected).toMatchObject({ accepted: false, error: expect.stringMatching(/Solo quien dibuja/) });
    const started = draw(fixture.state, 'p1', fixture.context);
    expect(started.accepted).toBe(true); expect(started.state.strokes[0]?.points).toHaveLength(2);
    const appended = sketchmonGame.handleAction(started.state, 'p1', {
      type: 'DRAW_BATCH', operations: [{ kind: 'APPEND', strokeId: 'stroke_1', points: [{ x: 0.3, y: 0.4 }] }],
    }, fixture.context);
    expect(appended.state.strokes[0]?.points).toHaveLength(3);
    const undone = sketchmonGame.handleAction(appended.state, 'p1', { type: 'UNDO_STROKE' }, fixture.context);
    expect(undone.state.strokes).toEqual([]);
    const redrawn = draw(undone.state, 'p1', fixture.context);
    const cleared = sketchmonGame.handleAction(redrawn.state, 'p1', { type: 'CLEAR_DRAWING' }, fixture.context);
    expect(cleared.state.strokes).toEqual([]);
    const restored = sketchmonGame.handleAction(cleared.state, 'p1', { type: 'UNDO_STROKE' }, fixture.context);
    expect(restored.state.strokes).toHaveLength(1);
    const redone = sketchmonGame.handleAction(restored.state, 'p1', { type: 'REDO_STROKE' }, fixture.context);
    expect(redone.state.strokes).toEqual([]);
  });

  it('supports fill strokes and does not impose an artificial drawing-length limit', () => {
    const fixture = setup(); let state = fixture.state;
    state = sketchmonGame.handleAction(state, 'p1', { type: 'DRAW_BATCH', operations: [{ kind: 'START', stroke: { id: 'fill_1', tool: 'FILL', color: '#ef4444', width: 8, points: [{ x: .5, y: .5 }] } }] }, fixture.context).state;
    expect(state.strokes[0]).toMatchObject({ tool: 'FILL', color: '#ef4444' });
    for (let start = 0; start < 304; start += 8) {
      const operations = Array.from({ length: Math.min(8, 304 - start) }, (_, index) => ({
        kind: 'START' as const,
        stroke: { id: `unbounded_${start + index}`, tool: 'PENCIL' as const, color: '#182033' as const, width: 8, points: [{ x: .1, y: .1 }] },
      }));
      const result = sketchmonGame.handleAction(state, 'p1', { type: 'DRAW_BATCH', operations }, fixture.context);
      expect(result.accepted).toBe(true); state = result.state;
    }
    expect(state.strokes).toHaveLength(305);
  });

  it('keeps the authoritative undo/redo projection consistent after reconnecting', () => {
    const fixture = setup(); let state = draw(fixture.state, 'p1', fixture.context).state;
    state = sketchmonGame.handleAction(state, 'p1', { type: 'UNDO_STROKE' }, fixture.context).state;
    expect(sketchmonGame.getPublicState(state, fixture.context).strokes).toEqual([]);
    state = sketchmonGame.handleAction(state, 'p1', { type: 'REDO_STROKE' }, fixture.context).state;
    const restored = sketchmonGame.getPublicState(state, fixture.context);
    expect(restored.strokes).toEqual(state.strokes); expect(restored.strokes[0]?.points).toHaveLength(2);
  });

  it('publishes multiple wrong guesses, applies cooldown and ends on the first correct answer', () => {
    const fixture = setup(); const target = fixture.state.targetPokemonId!;
    const wrongId = entries.find((entry) => entry.id !== target && entry.isDefault !== false)!.id;
    const wrong = guess(fixture.state, 'p2', wrongId, fixture.context);
    expect(wrong.accepted).toBe(true);
    expect(sketchmonGame.getPublicState(wrong.state, fixture.context).attempts[0]).toMatchObject({ playerId: 'p2', guessedPokemon: { id: wrongId } });
    expect(guess(wrong.state, 'p2', target, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Espera/) });
    fixture.setNow(fixture.context.now + SKETCHMON_GUESS_COOLDOWN_MS);
    const solved = guess(wrong.state, 'p2', target, fixture.context);
    expect(solved.state.phase).toBe('ROUND_RESULTS');
    expect(solved.state.lastRound).toMatchObject({ winnerId: 'p2', drawerId: 'p1', guesserPoints: 5, drawerPoints: SKETCHMON_DRAWER_POINTS, winnerAttemptCount: 2 });
    expect(solved.state.scores).toMatchObject({ p1: SKETCHMON_DRAWER_POINTS, p2: 5, p3: 0 });
  });

  it('reveals optional hints progressively at the proportional 60/40/20 schedule', () => {
    const fixture = setup({ hintsEnabled: true, roundSeconds: 90 }); let state = fixture.state;
    expect(state.nextTransitionAt).toBe(31_000);
    fixture.setNow(state.nextTransitionAt!); state = sketchmonGame.handleTimeout(state, fixture.context);
    expect(state.visibleHints).toEqual([{ kind: 'GENERATION', generation: 1 }]);
    expect(state.nextTransitionAt).toBe(51_000);
    fixture.setNow(state.nextTransitionAt!); state = sketchmonGame.handleTimeout(state, fixture.context);
    expect(state.visibleHints[1]).toMatchObject({ kind: 'TYPES' });
    fixture.setNow(state.nextTransitionAt!); state = sketchmonGame.handleTimeout(state, fixture.context);
    expect(state.visibleHints[2]).toMatchObject({ kind: 'EVOLUTION' });
    expect(state.nextTransitionAt).toBeNull();
  });

  it('withdraws the sprite after the configurable three-second memory preview', () => {
    const fixture = setup({ memoryPreviewEnabled: true, hintsEnabled: true, roundSeconds: 90 });
    let state = fixture.state;
    const target = entries.find((entry) => entry.id === state.targetPokemonId)!;
    expect(state.nextTransitionAt).toBe(1_000 + SKETCHMON_SPRITE_PREVIEW_MS);
    expect(sketchmonGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({
      role: 'DRAWER', secretPokemon: { name: target.name, sprite: target.sprite, types: [] },
    });
    fixture.setNow(state.nextTransitionAt!);
    state = sketchmonGame.handleTimeout(state, fixture.context);
    expect(state.nextTransitionAt).toBe(31_000);
    expect(sketchmonGame.getPlayerState(state, 'p1', fixture.context)).toMatchObject({
      role: 'DRAWER', secretPokemon: { name: target.name, sprite: null, previewEndsAt: 4_000, types: [] },
    });
  });

  it('never leaks the secret to public or guesser projections before reveal', () => {
    const fixture = setup(); const target = fixture.state.targetPokemonId!;
    const publicState = sketchmonGame.getPublicState(fixture.state, fixture.context);
    const drawer = sketchmonGame.getPlayerState(fixture.state, 'p1', fixture.context) as SketchmonPlayerState;
    const guesser = sketchmonGame.getPlayerState(fixture.state, 'p2', fixture.context) as SketchmonPlayerState;
    expect(JSON.stringify(publicState)).not.toContain(target);
    expect(JSON.stringify(guesser)).not.toContain(target);
    expect(drawer).toMatchObject({ role: 'DRAWER', canDraw: true, secretPokemon: { name: entries.find((entry) => entry.id === target)?.name, sprite: `/${target}.png` } });
    expect(guesser).toEqual({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0 });
  });

  it('keeps each final drawing for the reveal and exposes the complete gallery only at game results', () => {
    const fixture = setup({}, 2); let state = draw(fixture.state, 'p1', fixture.context).state;
    fixture.setNow(38_200); state = guess(state, 'p2', state.targetPokemonId!, fixture.context).state;
    expect(state.lastRound).toMatchObject({ elapsedMs: 37_200, guesserPoints: 4 });
    expect(state.lastRound?.drawing).toHaveLength(1);
    expect(sketchmonGame.getPublicState(state, fixture.context).gallery).toEqual([]);
    expect(state.nextTransitionAt).toBe(fixture.context.now + SKETCHMON_REVEAL_MS);
    state = advanceResult(state, fixture);
    state = draw(state, state.drawerId!, fixture.context).state;
    const winner = state.playerIds.find((id) => id !== state.drawerId)!;
    state = guess(state, winner, state.targetPokemonId!, fixture.context).state;
    state = advanceResult(state, fixture);
    expect(state.phase).toBe('GAME_RESULTS');
    const view = sketchmonGame.getPublicState(state, fixture.context);
    expect(view.gallery).toHaveLength(2); expect(view.gallery[0]?.drawing).toHaveLength(1);
    expect(view.results?.standings).toHaveLength(2);
  });

  it('uses configured generations/forms and skips a disconnected drawer without points', () => {
    const generation = setup({ generations: [2] });
    expect(generation.state.poolIds).toEqual(['chikorita']);
    const forms = setup({ includeForms: true }); expect(forms.state.poolIds).toContain('vulpix-alola');
    const fixture = setup(); fixture.context.players[0]!.connected = false;
    const state = sketchmonGame.handlePresenceChange!(fixture.state, fixture.context);
    expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundNumber).toBe(2); expect(state.drawerId).toBe('p2');
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(state.playerStats.p1).toMatchObject({ drawingRounds: 1, drawingFailures: 1 });
  });
});
