import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog, PokemonVisualCatalog } from '../../index.js';
import { defaultZoomedPokemonConfig } from './config.js';
import { alphaBounds, buildZoomedHints, localAlphaDensity, validFocusPoint, zoomedPoints, zoomStageAt, zoomStageSchedule, ZOOMED_POKEMON_ZOOM_STAGES } from './rules.js';
import { ZOOMED_POKEMON_COOLDOWN_MS, ZOOMED_POKEMON_REVEAL_MS, zoomedPokemonGame, zoomedPokemonPool } from './server.js';
import type { ZoomedPokemonState } from './types.js';

function mon(id: string, dex: number, generation: number, extra: Partial<Pokemon> = {}): Pokemon {
  return { id, nationalDexNumber: dex, name: id.replaceAll('-', ' '), generation, isDefault: true, sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`, hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1, baseStatTotal: 6, types: ['bug', 'fire'], evolutionStage: 2, evolutionStageCount: 2, legendaryStatus: 'NORMAL', ...extra };
}
const entries = [mon('volcarona', 637, 5), mon('butterfree', 12, 1), mon('gengar', 94, 1), mon('gengar-mega', 10038, 1, { isDefault: false, nationalDexNumber: 94 }), mon('broken', 999, 9, { sprite: '' })];
const pokemon: PokemonCatalog = { all: () => entries, byId: (id) => entries.find((entry) => entry.id === id), byDexNumber: (dex) => entries.find((entry) => entry.nationalDexNumber === dex && entry.isDefault !== false), forGenerations: (generations, options) => entries.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)) };
const artworks = new Map(['volcarona', 'gengar-mega'].map((id) => [id, { pokemonId: id, source: 'ARTWORK' as const, location: `local-artwork:${id}` }]));
const visuals: PokemonVisualCatalog = { artworkFor: (id) => artworks.get(id) ?? null, artworkPokemonIds: () => [...artworks.keys()] };

function setup(overrides: Partial<typeof defaultZoomedPokemonConfig> = {}, random = () => 0, count = 3) {
  const players = Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon, pokemonVisuals: visuals, now: 1_000, random, roomCode: 'ABC234' };
  const config = { ...defaultZoomedPokemonConfig, generations: [5], rounds: 2, ...overrides };
  let state = zoomedPokemonGame.createInitialState(config, context); state = zoomedPokemonGame.start(state, context);
  return { context, state, now(value: number) { context.now = value; } };
}
const guess = (state: ZoomedPokemonState, playerId: string, pokemonId: string, context: GameContext) => zoomedPokemonGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context);

describe('Zoomed Pokémon visual modes and exact targets', () => {
  it('uses the requested defaults and centralized discrete zoom levels', () => {
    expect(defaultZoomedPokemonConfig).toMatchObject({ imageMode: 'MIXED', roundSeconds: 30, rounds: 10, hintsEnabled: false });
    expect(ZOOMED_POKEMON_ZOOM_STAGES).toEqual([5, 3.5, 2.5, 1.7]); expect(ZOOMED_POKEMON_ZOOM_STAGES.at(-1)).toBeGreaterThan(1);
  });
  it('supports sprite, artwork and mixed pools with graceful mixed fallback', () => {
    const context = setup().context;
    expect(zoomedPokemonPool({ ...defaultZoomedPokemonConfig, generations: [1], imageMode: 'SPRITE' }, context).map((p) => p.id)).toEqual(['butterfree', 'gengar', 'gengar-mega']);
    expect(zoomedPokemonPool({ ...defaultZoomedPokemonConfig, generations: [1, 5], imageMode: 'ARTWORK' }, context).map((p) => p.id)).toEqual(['volcarona', 'gengar-mega']);
    expect(zoomedPokemonPool({ ...defaultZoomedPokemonConfig, generations: [1], imageMode: 'MIXED' }, context).map((p) => p.id)).toContain('butterfree');
  });
  it('blocks artwork mode with no available artwork and sprite mode never depends on artworks', () => {
    const context = setup().context; context.pokemonVisuals = { artworkFor: () => null, artworkPokemonIds: () => [] };
    expect(() => zoomedPokemonGame.createInitialState({ ...defaultZoomedPokemonConfig, generations: [5], imageMode: 'ARTWORK' }, context)).toThrow(/No hay artworks/);
    expect(() => zoomedPokemonGame.createInitialState({ ...defaultZoomedPokemonConfig, generations: [5], imageMode: 'SPRITE' }, context)).not.toThrow();
  });
  it('requires exact form identity and its own artwork key', () => {
    const fixture = setup({ generations: [1], imageMode: 'ARTWORK' });
    expect(fixture.state.targetPokemonId).toBe('gengar-mega'); const wrong = guess(fixture.state, 'p1', 'gengar', fixture.context); expect(wrong.accepted).toBe(true); expect(wrong.state.solves.p1).toBeUndefined();
    fixture.now(fixture.context.now + ZOOMED_POKEMON_COOLDOWN_MS); expect(guess(wrong.state, 'p1', 'gengar-mega', fixture.context).accepted).toBe(true);
  });
  it('keeps one target, visual and focus seed shared by every player without public identity leakage', () => {
    const fixture = setup({ imageMode: 'ARTWORK' }); const view = zoomedPokemonGame.getPublicState(fixture.state, fixture.context);
    expect(fixture.state.playerIds).toEqual(['p1', 'p2', 'p3']); expect(fixture.state.visual?.pokemonId).toBe('volcarona');
    expect(JSON.stringify(view)).not.toMatch(/volcarona|targetPokemon|local-artwork/i); expect(view.imageUrl).toMatch(/\/options\/active\/sprite$/); expect(view.focusPoint).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('alpha analysis, safe focus and progressive crop', () => {
  const width = 20; const height = 20; const alpha = new Uint8Array(width * height);
  for (let y = 4; y <= 15; y += 1) for (let x = 5; x <= 14; x += 1) alpha[y * width + x] = 255;
  const plane = { width, height, alpha };
  it('returns null for transparent assets and exact alpha bounds for visible content', () => {
    expect(alphaBounds({ width: 4, height: 4, alpha: new Uint8Array(16) })).toBeNull();
    expect(alphaBounds(plane)).toEqual({ x: 5, y: 4, width: 10, height: 12 });
  });
  it('selects variable opaque focus points with useful local density', () => {
    const first = validFocusPoint(plane, 1)!; const second = validFocusPoint(plane, 19)!;
    for (const focus of [first, second]) { const x = Math.floor(focus.x * width); const y = Math.floor(focus.y * height); expect(alpha[y * width + x]).toBe(255); expect(localAlphaDensity(plane, x, y, 2)).toBeGreaterThanOrEqual(0.32); }
    expect(first).not.toEqual(second);
  });
  it('keeps the same focus while every stage shows progressively more but never all the canvas', () => {
    const fixture = setup(); const view = zoomedPokemonGame.getPublicState(fixture.state, fixture.context); expect(view.focusPoint).toEqual({ x: 0.5, y: 0.5 });
    const visibleAreas = view.zoomStages.map((zoom) => 1 / zoom ** 2); expect(visibleAreas).toEqual([...visibleAreas].sort((a, b) => a - b)); expect(visibleAreas.at(-1)).toBeLessThan(1);
  });
  it('calculates stage boundaries proportionally and restores the authoritative current stage', () => {
    expect(zoomStageSchedule(1_000, 20)).toEqual([6_000, 11_000, 16_000]); expect(zoomStageAt(1_000, 20, 15_999)).toBe(2);
    const fixture = setup({ roundSeconds: 20 }); fixture.now(11_000); const state = zoomedPokemonGame.handleTimeout(fixture.state, fixture.context); expect(state.currentZoomStage).toBe(2); expect(zoomedPokemonGame.getPublicState(state, fixture.context).currentZoomStage).toBe(2);
  });
});

describe('authoritative attempts, order, score and round lifecycle', () => {
  it('allows repeated incorrect guesses, publishes them, and enforces the one-second cooldown', () => {
    const fixture = setup({ generations: [1, 5], imageMode: 'SPRITE' }); let result = guess(fixture.state, 'p1', 'butterfree', fixture.context);
    expect(result.accepted).toBe(true); expect(result.state.attempts[0]?.guessedPokemon.name).toBe('butterfree'); expect(result.state.cooldownUntil.p1).toBe(1_000 + ZOOMED_POKEMON_COOLDOWN_MS);
    expect(guess(result.state, 'p1', 'gengar', fixture.context).accepted).toBe(false); fixture.now(2_000); result = guess(result.state, 'p1', 'gengar', fixture.context); expect(result.accepted).toBe(true);
  });
  it('records server acceptance order and scores only by position, never by zoom stage', () => {
    const fixture = setup(); fixture.now(2_000); let state = guess(fixture.state, 'p2', 'volcarona', fixture.context).state;
    fixture.now(20_000); state = guess(state, 'p1', 'volcarona', fixture.context).state;
    expect(state.solves.p2).toMatchObject({ solveOrder: 1, points: zoomedPoints(3, 1), zoomStage: 0 }); expect(state.solves.p1).toMatchObject({ solveOrder: 2, points: zoomedPoints(3, 2), zoomStage: 2 });
    expect(state.solves.p2!.points).toBe(6); expect(state.solves.p1!.points).toBe(3);
  });
  it('does not reveal a correct answer, locks solved players, and rejects spectators', () => {
    const fixture = setup(); const solved = guess(fixture.state, 'p1', 'volcarona', fixture.context).state; const view = zoomedPokemonGame.getPublicState(solved, fixture.context);
    expect(view.solves.p1).toEqual({ solveOrder: 1, zoomStage: 0 }); expect(JSON.stringify(view)).not.toMatch(/volcarona/i); expect(guess(solved, 'p1', 'volcarona', fixture.context).accepted).toBe(false); expect(guess(solved, 'watcher', 'volcarona', fixture.context).accepted).toBe(false);
  });
  it('ends early when connected required players solve and a disconnected player does not block', () => {
    const fixture = setup({}, () => 0, 2); fixture.context.players[1]!.connected = false; const state = guess(fixture.state, 'p1', 'volcarona', fixture.context).state; expect(state.phase).toBe('ROUND_RESULTS');
  });
  it('times out, reveals complete and initial assets for four seconds, then advances automatically', () => {
    const fixture = setup({ rounds: 2 }); fixture.now(fixture.state.roundEndsAt!); let state = zoomedPokemonGame.handleTimeout(fixture.state, fixture.context); const view = zoomedPokemonGame.getPublicState(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.nextTransitionAt).toBe(fixture.context.now + ZOOMED_POKEMON_REVEAL_MS); expect(view.lastRound).toMatchObject({ pokemon: { name: 'volcarona' }, imageUrl: expect.stringContaining('/reveal/'), initialCropUrl: expect.stringContaining('/active/') });
    expect(zoomedPokemonGame.resolveAsset!(state, { assetToken: state.assetToken, roundNumber: 1, assetId: 'reveal' }, fixture.context)).toMatchObject({ transform: 'NORMALIZED' });
    fixture.now(state.nextTransitionAt!); state = zoomedPokemonGame.handleTimeout(state, fixture.context); expect(state.roundNumber).toBe(2); expect(state.phase).toBe('ROUND_ACTIVE');
  });
  it('does not repeat a target until the configured pool is exhausted', () => {
    const fixture = setup({ generations: [1, 5], rounds: 2, imageMode: 'SPRITE' }); const first = fixture.state.targetPokemonId; fixture.now(fixture.state.roundEndsAt!); let state = zoomedPokemonGame.handleTimeout(fixture.state, fixture.context); fixture.now(state.nextTransitionAt!); state = zoomedPokemonGame.handleTimeout(state, fixture.context); expect(state.targetPokemonId).not.toBe(first);
  });
  it('shows all selected hints from second zero and no hints by default', () => {
    const off = setup(); expect(zoomedPokemonGame.getPublicState(off.state, off.context).visibleHints).toEqual([]);
    const on = setup({ hintsEnabled: true, hintKinds: ['GENERATION', 'TYPE', 'TYPE_COUNT', 'EVOLUTION', 'CATEGORY'] }); expect(buildZoomedHints(entries[0]!, on.state.config.hintKinds)).toHaveLength(5); expect(zoomedPokemonGame.getPublicState(on.state, on.context).visibleHints).toHaveLength(5);
  });
  it('aggregates profile statistics including first positions, max zoom and misses', () => {
    const fixture = setup({ rounds: 1 }); fixture.now(2_000); let state = guess(fixture.state, 'p1', 'volcarona', fixture.context).state; fixture.now(state.roundEndsAt!); state = zoomedPokemonGame.handleTimeout(state, fixture.context); fixture.now(state.nextTransitionAt!); state = zoomedPokemonGame.handleTimeout(state, fixture.context);
    const results = zoomedPokemonGame.getResults(state); expect(results.standings.find((item) => item.playerId === 'p1')?.stats).toMatchObject({ correct: 1, firstTry: 1, firstPositions: 1, maxZoomSolves: 1, missed: 0 }); expect(results.standings.find((item) => item.playerId === 'p2')?.stats.missed).toBe(1);
  });
});
