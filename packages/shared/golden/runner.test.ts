import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type { GameContext, MiniGameModule } from '../dist/index.js';
import type { GoldenScenario } from './types.js';

// El catálogo real importa el dist del servidor; estos tests no dependen de él.
const { stubCatalog } = vi.hoisted(() => ({ stubCatalog: { fixture: 'stub' } }));
vi.mock('./catalog.js', () => ({ loadGoldenCatalog: (fixtureId: string) => (fixtureId === 'gen1-2' ? stubCatalog : null) }));

const { renderFixtures, runScenario } = await import('./runner.js');

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
    expect(fixture).not.toHaveProperty('expected.results');
  });
});

describe('renderFixtures', () => {
  it('genera un fichero por escenario y config-cases con claves ordenadas y sin undefined', () => {
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
    expect(Object.keys(JSON.parse(basic) as object)).toEqual(['catalog', 'config', 'engineId', 'expected', 'players', 'scenario', 'seed', 'steps']);
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
