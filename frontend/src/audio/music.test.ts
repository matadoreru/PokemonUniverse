/**
 * Reproductor de música (spec §8) con reloj y contexto falsos: fundido de salida 0,4 s y luego de
 * entrada 0,7 s sin solaparse, un único tema tras cambios seguidos, silencio con `play(null)`,
 * ducking al 30 %, nada de render con el sonido silenciado y la fanfarria que no se repite.
 */
import { describe, expect, it } from 'vitest';
import { loadSfx } from './catalog';
import { createMusicPlayer, musicTrackFor, type MusicPlayerOptions, type RenderedTrack } from './music';
import type { MusicTrack } from './engine';

// ---------------------------------------------------------------- dobles

interface Ramp { kind: 'set' | 'ramp'; value: number; time: number }

class FakeParam {
  value = 0;
  log: Ramp[] = [];
  setValueAtTime(v: number, time: number): void { this.value = v; this.log.push({ kind: 'set', value: v, time }); }
  linearRampToValueAtTime(v: number, time: number): void { this.value = v; this.log.push({ kind: 'ramp', value: v, time }); }
  exponentialRampToValueAtTime(v: number, time: number): void { this.value = v; this.log.push({ kind: 'ramp', value: v, time }); }
  cancelScheduledValues(): void { /* nada */ }
  /** Última rampa programada. */
  last(): Ramp | undefined { return this.log.filter((r) => r.kind === 'ramp').at(-1); }
}

class FakeNode {
  outputs: unknown[] = [];
  connect(dest: unknown): unknown { this.outputs.push(dest); return dest; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(when = 0): void { this.startedAt = when; }
  stop(when = 0): void { this.stoppedAt = when; }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  resume(): Promise<void> { return Promise.resolve(); }
  suspend(): Promise<void> { return Promise.resolve(); }
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createBufferSource(): FakeSource { const s = new FakeSource(); this.sources.push(s); return s; }
  createOscillator(): never { throw new Error('la música no crea osciladores en vivo'); }
  createBiquadFilter(): never { throw new Error('ídem'); }
  createBuffer(): never { throw new Error('ídem'); }
  createPeriodicWave(): never { throw new Error('ídem'); }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function setup(opts: { muted?: boolean; seconds?: Partial<Record<MusicTrack, number>> } = {}) {
  const ctx = new FakeContext();
  const out = new FakeGain();
  let clock = 0;
  let muted = opts.muted ?? false;
  const timers: { at: number; fn: () => void }[] = [];
  const listeners = new Set<() => void>();
  const renders: MusicTrack[] = [];
  const buffers = new Map<MusicTrack, object>();
  const pending = new Map<MusicTrack, (r: RenderedTrack) => void>();
  let deferRenders = false;
  const render: MusicPlayerOptions['render'] = (track) => {
    renders.push(track);
    const buffer = { track };
    buffers.set(track, buffer);
    const r: RenderedTrack = { buffer, seconds: opts.seconds?.[track] ?? 30 };
    if (deferRenders) return new Promise((res) => pending.set(track, res));
    return Promise.resolve(r);
  };
  const player = createMusicPlayer(ctx, out, loadSfx().music, {
    render,
    isMuted: () => muted,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    now: () => clock,
    after: (ms, fn) => { timers.push({ at: clock + ms, fn }); },
  });
  async function advance(ms: number): Promise<void> {
    const end = clock + ms;
    await flush();
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      clock = next.at;
      ctx.currentTime = clock / 1000;
      next.fn();
      await flush();
    }
    clock = end;
    ctx.currentTime = clock / 1000;
    await flush();
  }
  /** Fuentes que siguen sonando (arrancadas y sin parada programada). */
  const playing = () => ctx.sources.filter((s) => s.startedAt !== null && s.stoppedAt === null);
  const trackOf = (s: FakeSource) => (s.buffer as { track: MusicTrack }).track;
  /** Ganancia de fundido de una fuente (el nodo al que se conecta). */
  const fadeOf = (s: FakeSource) => s.outputs[0] as FakeGain;
  return {
    ctx, out, player, renders, advance, playing, trackOf, fadeOf, pending,
    defer: () => { deferRenders = true; },
    setMuted(m: boolean) { muted = m; listeners.forEach((fn) => fn()); },
  };
}

// ---------------------------------------------------------------- pruebas

describe('reproductor de música', () => {
  it('el primer tema entra con fundido de 0,7 s a través del nodo de ducking', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(0);
    const [src] = t.playing();
    expect(src).toBeDefined();
    expect(t.trackOf(src!)).toBe('lobby');
    expect(src!.loop).toBe(true);
    expect(t.fadeOf(src!).gain.last()).toEqual({ kind: 'ramp', value: 1, time: 0.7 });
    const duckNode = t.fadeOf(src!).outputs[0] as FakeGain;
    expect(duckNode.outputs).toEqual([t.out]);
  });

  it('cambiar de tema funde la salida 0,4 s y solo después entra el nuevo en 0,7 s, sin solaparse', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(1000);
    const [lobby] = t.playing();
    t.player.play('game');
    await t.advance(0);
    expect(t.fadeOf(lobby!).gain.last()).toEqual({ kind: 'ramp', value: 0, time: 1.4 });
    expect(lobby!.stoppedAt).toBeGreaterThanOrEqual(1.4);
    expect(lobby!.stoppedAt).toBeLessThan(1.5);
    // Durante el fundido de salida todavía no suena el nuevo tema.
    await t.advance(399);
    expect(t.ctx.sources.filter((s) => t.trackOf(s) === 'game')).toHaveLength(0);
    await t.advance(1);
    const game = t.playing();
    expect(game.map(t.trackOf)).toEqual(['game']);
    expect(game[0]!.startedAt).toBeCloseTo(1.4, 9);
    expect(t.fadeOf(game[0]!).gain.last()).toEqual({ kind: 'ramp', value: 1, time: 1.4 + 0.7 });
  });

  it('dos cambios seguidos en 100 ms dejan un único tema sonando', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(1000);
    t.player.play('game');
    await t.advance(100);
    t.player.play('results');
    await t.advance(2000);
    expect(t.playing().map(t.trackOf)).toEqual(['results']);
    expect(t.ctx.sources.filter((s) => t.trackOf(s) === 'game')).toHaveLength(0);
  });

  it('pedir el mismo tema que suena o que está a punto de entrar no lo reinicia', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(1000);
    t.player.play('game');
    await t.advance(100);
    t.player.play('game');
    await t.advance(300);
    t.player.play('game');
    await t.advance(1000);
    expect(t.ctx.sources.map(t.trackOf)).toEqual(['lobby', 'game']);
  });

  it('play(null) funde a silencio', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(1000);
    const [lobby] = t.playing();
    t.player.play(null);
    await t.advance(0);
    expect(t.fadeOf(lobby!).gain.last()).toEqual({ kind: 'ramp', value: 0, time: 1.4 });
    await t.advance(5000);
    expect(t.playing()).toHaveLength(0);
  });

  it('duck(true) baja la ganancia al 30 % y duck(false) la devuelve; se mantiene entre temas', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(0);
    const duckNode = t.fadeOf(t.playing()[0]!).outputs[0] as FakeGain;
    t.player.duck(true);
    expect(duckNode.gain.last()?.value).toBeCloseTo(0.3, 9);
    t.player.play('game');
    await t.advance(1000);
    expect(t.fadeOf(t.playing()[0]!).outputs[0]).toBe(duckNode);
    expect(duckNode.gain.value).toBeCloseTo(0.3, 9);
    t.player.duck(false);
    expect(duckNode.gain.last()?.value).toBe(1);
  });

  it('silenciado no renderiza nada; al activar el sonido entra el tema pedido', async () => {
    const t = setup({ muted: true });
    t.player.play('lobby');
    t.player.play('game');
    await t.advance(2000);
    expect(t.renders).toEqual([]);
    expect(t.ctx.sources).toHaveLength(0);
    t.setMuted(false);
    await t.advance(0);
    expect(t.renders).toEqual(['game']);
    expect(t.playing().map(t.trackOf)).toEqual(['game']);
  });

  it('silenciar para las fuentes y reactivar retoma el tema actual, sin volver a renderizar', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(1000);
    const [first] = t.playing();
    t.setMuted(true);
    await t.advance(0);
    expect(first!.stoppedAt).not.toBeNull();
    expect(t.playing()).toHaveLength(0);
    t.setMuted(false);
    await t.advance(1000);
    expect(t.playing().map(t.trackOf)).toEqual(['lobby']);
    expect(t.renders).toEqual(['lobby']);
  });

  it('cada tema se renderiza una sola vez y se reutiliza', async () => {
    const t = setup();
    t.player.play('lobby');
    await t.advance(1000);
    t.player.play('game');
    await t.advance(1000);
    t.player.play('lobby');
    await t.advance(1000);
    expect(t.renders).toEqual(['lobby', 'game']);
    expect(t.playing().map(t.trackOf)).toEqual(['lobby']);
  });

  it('un render en curso de un tema que ya no se quiere no llega a sonar', async () => {
    const t = setup();
    t.defer();
    t.player.play('lobby');
    t.player.play('game');
    await t.advance(0);
    t.pending.get('lobby')!({ buffer: { track: 'lobby' }, seconds: 30 });
    await t.advance(1000);
    expect(t.ctx.sources).toHaveLength(0);
    t.pending.get('game')!({ buffer: { track: 'game' }, seconds: 30 });
    await t.advance(0);
    expect(t.playing().map(t.trackOf)).toEqual(['game']);
  });

  it('un render que falla no rompe nada ni deja un tema a medias', async () => {
    const ctx = new FakeContext();
    const player = createMusicPlayer(ctx, new FakeGain(), loadSfx().music, {
      render: () => Promise.reject(new Error('sin OfflineAudioContext')),
      isMuted: () => false,
      subscribe: () => () => undefined,
      now: () => 0,
      after: () => undefined,
    });
    player.play('lobby');
    await flush();
    expect(ctx.sources).toHaveLength(0);
  });

  it('la fanfarria de resultados no hace bucle; al acabar queda en silencio hasta que cambie la fase', async () => {
    const t = setup({ seconds: { results: 7 } });
    t.player.play('results');
    await t.advance(0);
    const [fanfare] = t.playing();
    expect(fanfare!.loop).toBe(false);
    await t.advance(8000);
    t.player.play('results');
    t.setMuted(true);
    t.setMuted(false);
    await t.advance(2000);
    expect(t.ctx.sources).toHaveLength(1);
    t.player.play('lobby');
    await t.advance(1000);
    expect(t.ctx.sources.map(t.trackOf)).toEqual(['results', 'lobby']);
  });
});

describe('tema por fase de la sala', () => {
  it('vestíbulo y votación → lobby; resultados de juego y de sesión → results; el resto del juego → game', () => {
    expect(musicTrackFor(null)).toBeNull();
    expect(musicTrackFor(undefined)).toBeNull();
    expect(musicTrackFor('LOBBY')).toBe('lobby');
    expect(musicTrackFor('NEXT_GAME_VOTE')).toBe('lobby');
    expect(musicTrackFor('NEXT_GAME_VOTE_RESULTS')).toBe('lobby');
    expect(musicTrackFor('GAME_STARTING')).toBe('game');
    expect(musicTrackFor('ROUND_ACTIVE')).toBe('game');
    expect(musicTrackFor('ROUND_RESULTS')).toBe('game');
    expect(musicTrackFor('VOTING')).toBe('game');
    expect(musicTrackFor('VOTE_RESULTS')).toBe('game');
    expect(musicTrackFor('GAME_RESULTS')).toBe('results');
    expect(musicTrackFor('SESSION_RESULTS')).toBe('results');
  });
});
