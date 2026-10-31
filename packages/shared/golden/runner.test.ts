import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type { GameContext, MiniGameModule } from '../dist/index.js';
import type { GoldenScenario } from './types.js';

// El catálogo real importa el dist del servidor; estos tests no dependen de él.
const { stubCatalog, catalogPatches } = vi.hoisted(() => ({ stubCatalog: { fixture: 'stub' }, catalogPatches: [] as unknown[] }));
vi.mock('./catalog.js', () => ({
  loadGoldenCatalog: (fixtureId: string, patch?: unknown) => {
    catalogPatches.push(patch);
    return fixtureId === 'gen1-2' ? stubCatalog : null;
  },
}));

const { renderFixtures, runScenario } = await import('./runner.js');
const { buildGoldenContext } = await import('./context.js');

interface CounterConfig { target: number }
interface CounterState { count: number; target: number; lastNow: number; started: boolean }
type CounterAction = { type: 'INCREMENT' } | { type: 'EXPLODE' };

const seenContexts: GameContext[] = [];
const counter: MiniGameModule<CounterConfig, CounterState, CounterAction, unknown> = {
  manifest: { id: 'counter', name: 'Contador', icon: 'x', description: 'x', minPlayers: 1, profileStats: { metrics: [] } },
  configSchema: z.object({ target: z.number().int().min(1).default(2) }),
  actionSchema: z.discriminatedUnion('type', [z.object({ type: z.literal('INCREMENT') }), z.object({ type: z.literal('EXPLODE') })]),
  defaultConfig: { target: 2 },
  createInitialState: (config, context) => { seenContexts.push(context); return { count: 0, target: config.target, lastNow: context.now, started: false }; },
  start: (state, context) => ({ ...state, started: true, lastNow: context.now, count: Math.floor(context.random() * 0) }),
  handleAction: (state, playerId, action, context) => {
    if (action.type === 'EXPLODE') throw new Error('boom');
    if (playerId === 'p2') return { state, accepted: false, error: 'No es tu turno.' };
    return { state: { ...state, count: state.count + 1, lastNow: context.now }, accepted: true };
  },
  handleTimeout: (state, context) => ({ ...state, count: state.count + 1, lastNow: context.now }),
  handlePresenceChange: (state, context) => ({ ...state, lastNow: context.now }),
  getLifecycle: (state) => ({ phase: state.count >= state.target ? 'GAME_RESULTS' : 'ROUND_ACTIVE' }) as never,
  getPublicState: (state, context) => ({ count: state.count, now: context.now, connected: context.players.map((player) => player.connected !== false), absent: undefined }),
  getPlayerState: (state, playerId, context) => ({ playerId, isHost: context.hostId === playerId, room: context.roomCode }),
  isFinished: (state) => state.count >= state.target,
  getResults: (state) => ({ winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: state.count, stats: {} }] }),
};

const players = [{ id: 'p1', displayName: 'Uno' }, { id: 'p2', displayName: 'Dos' }];

describe('runScenario', () => {
  it('registra initial, afterStart, un afterSteps por paso y results al terminar', () => {
    const scenario: GoldenScenario = {
      name: 'basic', seed: 7, catalog: 'gen1-2', players, config: { target: 2 },
      steps: [
        { kind: 'action', playerId: 'p2', action: { type: 'INCREMENT' }, now: 1500 },
        { kind: 'presence', players: [players[0]!, { ...players[1]!, connected: false }], now: 1600 },
        { kind: 'action', playerId: 'p1', action: { type: 'INCREMENT' }, now: 2000 },
        { kind: 'timeout', now: 3000 },
      ],
    };
    const fixture = runScenario(counter, scenario);
    expect(seenContexts.at(-1)?.pokemon).toBe(stubCatalog);
    expect(fixture).toMatchObject({ engineId: 'counter', scenario: 'basic', seed: 7, catalog: 'gen1-2', config: { target: 2 } });
    expect(fixture.expected.configNormalized).toEqual({ target: 2 });
    expect(fixture.expected.initial).toEqual({
      lifecycle: { phase: 'ROUND_ACTIVE' }, finished: false,
      publicState: { count: 0, now: 1000, connected: [true, true], absent: undefined },
      playerStates: { p1: { playerId: 'p1', isHost: true, room: 'GOLD01' }, p2: { playerId: 'p2', isHost: false, room: 'GOLD01' } },
    });
    expect(fixture.expected.afterStart.publicState).toMatchObject({ count: 0, now: 1000 });
    expect(fixture.expected.afterSteps).toHaveLength(4);
    expect(fixture.expected.afterSteps[0]).toMatchObject({ accepted: false, error: 'No es tu turno.' });
    expect(fixture.expected.afterSteps[1]).not.toHaveProperty('accepted');
    expect(fixture.expected.afterSteps[1]).toMatchObject({ snapshot: { publicState: { now: 1600, connected: [true, false] } } });
    expect(fixture.expected.afterSteps[2]).toEqual(expect.objectContaining({ accepted: true }));
    expect(fixture.expected.afterSteps[2]).not.toHaveProperty('error');
    expect(fixture.expected.afterSteps[3]).toMatchObject({ snapshot: { finished: true, publicState: { count: 2, now: 3000 } } });
    expect(fixture.expected.results).toEqual({ winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 2, stats: {} }] });
    expect(fixture).not.toHaveProperty('stoppedAt');
  });

  it('guarda threw y detiene el escenario cuando el motor lanza', () => {
    const fixture = runScenario(counter, {
      name: 'explodes', seed: 1, catalog: 'gen1-2', players, config: {}, startNow: 500, roomCode: 'ABC123',
      steps: [
        { kind: 'action', playerId: 'p1', action: { type: 'INCREMENT' }, now: 600 },
        { kind: 'action', playerId: 'p1', action: { type: 'EXPLODE' }, now: 700 },
        { kind: 'timeout', now: 800 },
      ],
    });
    expect(fixture.expected.configNormalized).toEqual({ target: 2 });
    expect(fixture.expected.initial.playerStates.p1).toEqual({ playerId: 'p1', isHost: true, room: 'ABC123' });
    expect(fixture.expected.afterSteps).toEqual([expect.objectContaining({ accepted: true }), { threw: 'boom' }]);
    expect(fixture.stoppedAt).toBe(1);
    expect(fixture).toMatchObject({ startNow: 500, roomCode: 'ABC123' });
    expect(fixture).not.toHaveProperty('expected.results');
  });
});

describe('runScenario con acción inválida', () => {
  it('registra invalidAction y detiene el escenario sin llamar a handleAction', () => {
    const fixture = runScenario(counter, {
      name: 'invalid', seed: 1, catalog: 'gen1-2', players, config: {},
      steps: [
        { kind: 'action', playerId: 'p1', action: { type: 'INCREMENT' }, now: 600 },
        { kind: 'action', playerId: 'p1', action: { type: 'NOPE' }, now: 700 },
        { kind: 'timeout', now: 800 },
      ],
    });
    expect(fixture.expected.afterSteps).toEqual([expect.objectContaining({ accepted: true }), { invalidAction: true }]);
    expect(fixture.stoppedAt).toBe(1);
    expect(fixture.expected).not.toHaveProperty('results');
  });
});

describe('renderFixtures', () => {
  it('genera un fichero por escenario y config-cases en orden de inserción y sin undefined', () => {
    const files = renderFixtures({
      counter: {
        module: counter,
        scenarios: [{ name: 'basic', seed: 7, catalog: 'gen1-2', players, config: { target: 1 }, steps: [{ kind: 'timeout', now: 2000 }] }],
        configCases: [{ target: 3 }, { target: 0 }, {}],
      },
    });
    expect([...files.keys()]).toEqual(['counter/basic.json', 'counter/config-cases.json']);
    const basic = files.get('counter/basic.json')!;
    expect(basic.endsWith('}\n')).toBe(true);
    expect(basic).not.toContain('absent');
    expect(Object.keys(JSON.parse(basic) as object)).toEqual(['engineId', 'scenario', 'seed', 'catalog', 'players', 'config', 'steps', 'expected']);
    expect(JSON.parse(files.get('counter/config-cases.json')!)).toEqual([
      { input: { target: 3 }, valid: true, normalized: { target: 3 } },
      { input: { target: 0 }, valid: false },
      { input: {}, valid: true, normalized: { target: 2 } },
    ]);
  });

  it('no genera nada sin escenarios', () => {
    expect(renderFixtures({}).size).toBe(0);
  });
});

describe('orden de claves', () => {
  it('conserva el orden de inserción del motor en la fixture serializada', () => {
    const unordered = { ...counter, getPublicState: () => ({ b: 1, a: 2 }) };
    const files = renderFixtures({
      counter: { module: unordered, scenarios: [{ name: 'order', seed: 1, catalog: 'gen1-2', players, config: {}, steps: [] }], configCases: [] },
    });
    const text = files.get('counter/order.json')!;
    expect(text).toContain('"b": 1');
    expect(text.indexOf('"b": 1')).toBeLessThan(text.indexOf('"a": 2'));
  });
});

describe('catalogPatch', () => {
  it('llega a loadGoldenCatalog y a la fixture justo después de catalog', () => {
    const catalogPatch = { bulbasaur: { palette: ['#000000', '#111111', '#222222'], paletteWeights: [1, 1, 2] } };
    const fixture = runScenario(counter, { name: 'patched', seed: 1, catalog: 'gen1-2', catalogPatch, players, config: {}, steps: [] });
    expect(catalogPatches.at(-1)).toEqual(catalogPatch);
    expect(Object.keys(fixture).slice(0, 6)).toEqual(['engineId', 'scenario', 'seed', 'catalog', 'catalogPatch', 'players']);
    expect(fixture.catalogPatch).toEqual(catalogPatch);
  });

  it('no aparece si el escenario no la trae', () => {
    const fixture = runScenario(counter, { name: 'plain', seed: 1, catalog: 'gen1-2', players, config: {}, steps: [] });
    expect(catalogPatches.at(-1)).toBeUndefined();
    expect(fixture).not.toHaveProperty('catalogPatch');
  });
});

describe('buildGoldenContext', () => {
  const base: GoldenScenario = { name: 'ctx', seed: 1, catalog: 'gen1-2', players, config: {}, steps: [] };

  it('monta pokemonAudio desde el escenario', () => {
    const context = buildGoldenContext({ ...base, pokemonAudio: { bulbasaur: { latest: 'https://raw.githubusercontent.com/PokeAPI/cries/x.ogg' } } }, stubCatalog as never);
    expect(context.pokemonAudio?.cryFor('bulbasaur', 'LATEST')).toBe('https://raw.githubusercontent.com/PokeAPI/cries/x.ogg');
    expect(context.pokemonAudio?.cryFor('bulbasaur', 'LEGACY')).toBeNull();
    expect(context.pokemonAudio?.pokemonIds('LEGACY')).toEqual([]);
    expect(context.pokemonAudio?.pokemonIds()).toEqual(['bulbasaur']);
  });

  it('solo incluye las claves de contexto que trae el escenario', () => {
    const context = buildGoldenContext(base, stubCatalog as never);
    expect(context).not.toHaveProperty('pokemonAudio');
    expect(context).not.toHaveProperty('pokemonVisuals');
    expect(context).not.toHaveProperty('tcgCards');
    expect(context).not.toHaveProperty('hostCustomCategories');
    expect(context).not.toHaveProperty('hostWouldYouRatherPrompts');
    expect(context.hostId).toBe('p1');
    expect(context.roomCode).toBe('GOLD01');
  });

  it('monta pokemonVisuals y el contenido del host', () => {
    const asset = { pokemonId: 'pikachu', source: 'ARTWORK' as const, location: 'local-artwork:pikachu', width: 10, height: 10 };
    const context = buildGoldenContext({
      ...base,
      pokemonVisuals: { pikachu: asset },
      hostCustomCategories: [{ id: 'c1', text: 'Quién' }],
      hostWouldYouRatherPrompts: [{ id: 'w1', optionA: 'A', optionB: 'B' }],
    }, stubCatalog as never);
    expect(context.pokemonVisuals?.artworkFor('pikachu')).toEqual(asset);
    expect(context.pokemonVisuals?.artworkFor('mew')).toBeNull();
    expect(context.pokemonVisuals?.artworkPokemonIds()).toEqual(['pikachu']);
    expect(context.hostCustomCategories).toEqual([{ id: 'c1', text: 'Quién' }]);
    expect(context.hostWouldYouRatherPrompts).toEqual([{ id: 'w1', optionA: 'A', optionB: 'B' }]);
  });

  it('filtra tcgCards por sets, rarezas y precio decimal', () => {
    const card = (id: string, setId: string, rarity: string | null, price: string) => ({
      id, name: id, localId: '1', setId, setName: setId, rarity, imageUrl: `https://example.test/${id}.png`, price, currency: 'EUR', provider: 'cardmarket', variant: 'standard',
    });
    const cards = [card('a', 's1', 'Rare', '1.001'), card('b', 's1', 'Common', '1.002'), card('c', 's2', 'Rare', '10'), card('d', 's2', null, '0')];
    const tcg = buildGoldenContext({ ...base, tcgCards: cards }, stubCatalog as never).tcgCards!;
    const ids = (filters: Partial<Parameters<typeof tcg.cardsFor>[0]>) =>
      tcg.cardsFor({ generations: [1], setIds: [], rarities: [], minPrice: null, maxPrice: null, ...filters }).map((found) => found.id);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ setIds: ['s2'] })).toEqual(['c', 'd']);
    expect(ids({ rarities: ['Rare'] })).toEqual(['a', 'c']);
    expect(ids({ minPrice: '1.002', maxPrice: '9.99' })).toEqual(['b']);
  });
});

describe('paso asset', () => {
  const assetStep = { kind: 'asset' as const, assetToken: 'tok', roundNumber: 1, assetId: 'shadow', now: 1500 };

  it('normaliza un string a ORIGINAL y no añade snapshot', () => {
    const fixture = runScenario({ ...counter, resolveAsset: () => 'https://raw.githubusercontent.com/a.png' },
      { name: 'asset', seed: 1, catalog: 'gen1-2', players, config: {}, steps: [assetStep] });
    expect(fixture.expected.afterSteps).toEqual([{ resolution: { source: 'https://raw.githubusercontent.com/a.png', transform: 'ORIGINAL' } }]);
  });

  it('registra resolution null si el motor devuelve null o no resuelve assets', () => {
    const scenario: GoldenScenario = { name: 'asset', seed: 1, catalog: 'gen1-2', players, config: {}, steps: [assetStep] };
    expect(runScenario({ ...counter, resolveAsset: () => null }, scenario).expected.afterSteps).toEqual([{ resolution: null }]);
    expect(runScenario(counter, scenario).expected.afterSteps).toEqual([{ resolution: null }]);
  });
});
