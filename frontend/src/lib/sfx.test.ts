import { describe, expect, it, vi } from 'vitest';
import { createSfx, type AudioContextLike, type SfxDeps } from './sfx';

function fakeContext() {
  const oscillators: { type: string; frequency: number; started: number; stopped: number }[] = [];
  const ctx: AudioContextLike & { resumes: number } = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resumes: 0,
    resume() { ctx.resumes += 1; return Promise.resolve(); },
    createOscillator() {
      const osc = { type: 'sine', frequency: 0, started: 0, stopped: 0 };
      oscillators.push(osc);
      return {
        get type() { return osc.type; },
        set type(value: string) { osc.type = value; },
        frequency: { setValueAtTime(value: number) { osc.frequency = value; } },
        connect() { return undefined; },
        start() { osc.started += 1; },
        stop() { osc.stopped += 1; },
      };
    },
    createGain() {
      return {
        gain: { setValueAtTime() { return undefined; }, exponentialRampToValueAtTime() { return undefined; } },
        connect() { return undefined; },
      };
    },
  };
  return { ctx, oscillators };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function setup(initial: Record<string, string> = {}) {
  const { ctx, oscillators } = fakeContext();
  const storage = memoryStorage(initial);
  const createContext = vi.fn(() => ctx);
  const deps: SfxDeps = { createContext, storage };
  return { sfx: createSfx(deps), ctx, oscillators, storage, createContext };
}

describe('sfx', () => {
  it('is muted by default and never creates a context while muted', () => {
    const { sfx, createContext, oscillators } = setup();
    expect(sfx.isEnabled()).toBe(false);
    sfx.play('hit'); sfx.play('hit'); sfx.play('hit');
    expect(createContext).toHaveBeenCalledTimes(0);
    expect(oscillators).toHaveLength(0);
  });

  it("enabling creates and resumes the context once and persists 'on'", () => {
    const { sfx, ctx, createContext, storage } = setup();
    sfx.setEnabled(true);
    sfx.setEnabled(false);
    sfx.setEnabled(true);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.resumes).toBeGreaterThanOrEqual(1);
    expect(storage.data.get('pokemon-universe-sfx')).toBe('on');
    sfx.setEnabled(false);
    expect(storage.data.get('pokemon-universe-sfx')).toBe('off');
  });

  it('plays oscillators only when enabled', () => {
    const { sfx, oscillators } = setup();
    sfx.setEnabled(true);
    sfx.play('hit');
    expect(oscillators.map((o) => o.frequency)).toEqual([660, 880]);
    expect(oscillators.every((o) => o.started === 1 && o.stopped === 1)).toBe(true);
    sfx.play('clang');
    expect(oscillators.slice(2).map((o) => [o.type, o.frequency])).toEqual([['square', 180], ['square', 270]]);
    sfx.setEnabled(false);
    sfx.play('win');
    expect(oscillators).toHaveLength(4);
  });

  it("reads a stored 'on'", () => {
    expect(setup({ 'pokemon-universe-sfx': 'on' }).sfx.isEnabled()).toBe(true);
    expect(setup({ 'pokemon-universe-sfx': 'off' }).sfx.isEnabled()).toBe(false);
  });

  it("creates the context lazily on the first play when 'on' was stored", () => {
    const { sfx, ctx, createContext, oscillators } = setup({ 'pokemon-universe-sfx': 'on' });
    expect(createContext).toHaveBeenCalledTimes(0);
    sfx.play('tick');
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.resumes).toBe(1);
    expect(oscillators.map((o) => [o.type, o.frequency])).toEqual([['square', 1200]]);
    sfx.play('tick');
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('sfx survives a throwing storage and a missing AudioContext', () => {
    const storage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    const sfx = createSfx({ createContext: () => null, storage });
    expect(sfx.isEnabled()).toBe(false);
    expect(() => sfx.setEnabled(true)).not.toThrow();
    expect(() => sfx.play('reveal')).not.toThrow();
    const noStorage = createSfx({ createContext: () => null, storage: null });
    expect(noStorage.isEnabled()).toBe(false);
    expect(() => { noStorage.setEnabled(true); noStorage.play('miss'); }).not.toThrow();
  });

  it('notifies subscribers', () => {
    const { sfx } = setup();
    const listener = vi.fn();
    const unsubscribe = sfx.subscribe(listener);
    sfx.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    sfx.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    sfx.setEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
