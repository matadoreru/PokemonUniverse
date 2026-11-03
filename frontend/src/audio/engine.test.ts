import { describe, expect, it } from 'vitest';
import { CHANNELS, createAudio, type AudioDeps, type MusicPlayerLike } from './engine';
import { SOUND_IDS, loadSfx } from './catalog';
import { AUDIO_STORAGE_KEY, DEFAULT_SETTINGS, stepGain, type StorageLike } from './settings';

// ---------------------------------------------------------------- dobles de Web Audio

class FakeParam {
  value = 0;
  setValueAtTime(v: number): void { this.value = v; }
  linearRampToValueAtTime(v: number): void { this.value = v; }
  exponentialRampToValueAtTime(v: number): void { this.value = v; }
  cancelScheduledValues(): void { /* nada que cancelar */ }
}

class FakeNode {
  outputs: unknown[] = [];
  connect(dest: unknown): unknown { this.outputs.push(dest); return dest; }
}

class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = 'lowpass'; frequency = new FakeParam(); Q = new FakeParam(); }
class FakeOsc extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  setPeriodicWave(): void { /* onda de pulso */ }
  start(): void { /* programado */ }
  stop(): void { /* programado */ }
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  start(): void { /* programado */ }
  stop(): void { /* programado */ }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'suspended';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeNode[] = [];
  suspends = 0;
  resumes = 0;
  resume(): Promise<void> { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createBiquadFilter(): FakeFilter { return new FakeFilter(); }
  createOscillator(): FakeOsc { const o = new FakeOsc(); this.sources.push(o); return o; }
  createBufferSource(): FakeSource { const s = new FakeSource(); this.sources.push(s); return s; }
  createBuffer(_ch: number, length: number): { getChannelData(): Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createPeriodicWave(): unknown { return {}; }
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const UNMUTED = JSON.stringify({ ...DEFAULT_SETTINGS, muted: false });

function setup(opts: { muted?: boolean; createMusic?: AudioDeps['createMusic']; hidden?: boolean; hasActivation?: () => boolean } = {}) {
  const contexts: FakeContext[] = [];
  let clock = 1000;
  const storage = memoryStorage(opts.muted === false ? { [AUDIO_STORAGE_KEY]: UNMUTED } : {});
  const doc = { hidden: opts.hidden ?? false };
  const deps: AudioDeps = {
    createContext: () => { const c = new FakeContext(); contexts.push(c); return c; },
    storage,
    now: () => clock,
    document: doc,
    ...(opts.createMusic ? { createMusic: opts.createMusic } : {}),
    ...(opts.hasActivation ? { hasActivation: opts.hasActivation } : {}),
  };
  const audio = createAudio(deps);
  return {
    audio,
    storage,
    doc,
    contexts,
    ctx: () => contexts[0]!,
    advance: (ms: number) => { clock += ms; },
  };
}

/** Nodo de canal al que acaba conectado un nodo: el que va directamente al nodo maestro. */
function channelOf(ctx: FakeContext, node: FakeNode): string | undefined {
  const master = ctx.gains.find((g) => g.outputs.includes(ctx.destination))!;
  const channelNodes = ctx.gains.filter((g) => g.outputs.includes(master));
  let cur: unknown = node;
  for (let i = 0; i < 8 && cur instanceof FakeNode; i++) {
    const idx = channelNodes.indexOf(cur as FakeGain);
    if (idx >= 0) return CHANNELS[idx];
    cur = cur.outputs[0];
  }
  return undefined;
}

/** Dispara un efecto y devuelve las fuentes nuevas que creó. */
function fire(t: ReturnType<typeof setup>, id: Parameters<typeof t.audio.play>[0]): FakeNode[] {
  const ctx = t.contexts[0];
  const before = ctx?.sources.length ?? 0;
  t.audio.play(id);
  return ctx ? ctx.sources.slice(before) : [];
}

// ---------------------------------------------------------------- pruebas

describe('motor de audio', () => {
  it('sin gesto no se crea contexto, ni siquiera con el sonido activado', () => {
    const t = setup({ muted: false });
    t.audio.play('ui.tap');
    t.audio.music.play('lobby');
    expect(t.contexts).toHaveLength(0);
    expect(t.audio.state().unlocked).toBe(false);
  });

  it('silenciado no crea contexto ni voces, y activar el sonido tras un gesto sí lo crea', () => {
    const t = setup();
    t.audio.unlock();
    t.audio.play('ui.tap');
    expect(t.contexts).toHaveLength(0);
    expect(t.audio.state()).toEqual({ unlocked: false, muted: true, recent: [] });
    t.audio.update({ muted: false });
    expect(t.contexts).toHaveLength(1);
    expect(t.audio.state().unlocked).toBe(true);
    expect(fire(t, 'ui.tap').length).toBeGreaterThan(0);
  });

  it('activar el sonido sin ningún gesto previo no crea contexto', () => {
    const t = setup();
    t.audio.update({ muted: false });
    expect(t.contexts).toHaveLength(0);
  });

  it('tras unlock() con sonido, play crea voces en el canal correcto', () => {
    const t = setup({ muted: false });
    t.audio.unlock();
    t.audio.unlock();
    expect(t.contexts).toHaveLength(1);
    expect(t.ctx().state).toBe('running');
    const ui = fire(t, 'ui.confirm');
    expect(ui.length).toBeGreaterThan(0);
    for (const n of ui) expect(channelOf(t.ctx(), n)).toBe('ui');
    const sfx = fire(t, 'game.hit');
    expect(sfx.length).toBeGreaterThan(0);
    for (const n of sfx) expect(channelOf(t.ctx(), n)).toBe('sfx');
  });

  it('sin activación real (pointerdown táctil) no crea el contexto; el siguiente gesto con activación sí', () => {
    let active = false;
    const t = setup({ muted: false, hasActivation: () => active });
    t.audio.unlock();
    expect(t.contexts).toHaveLength(0);
    expect(t.audio.state().unlocked).toBe(false);
    active = true;
    t.audio.unlock();
    expect(t.contexts).toHaveLength(1);
    expect(t.audio.state().unlocked).toBe(true);
  });

  it('un contexto suspendido no programa voces (no se acumulan para el reanudar)', () => {
    const t = setup({ muted: false });
    t.audio.unlock();
    t.ctx().state = 'suspended';
    expect(fire(t, 'game.hit')).toHaveLength(0);
    expect(t.audio.state().recent).toEqual(['game.hit']);
    t.ctx().state = 'running';
    expect(fire(t, 'game.hit').length).toBeGreaterThan(0);
  });

  it('las ganancias de canal siguen los ajustes y el silencio las lleva a 0', () => {
    const t = setup({ muted: false });
    t.audio.unlock();
    const ctx = t.ctx();
    const master = ctx.gains.find((g) => g.outputs.includes(ctx.destination))!;
    const channelNodes = ctx.gains.filter((g) => g.outputs.includes(master));
    const mix = loadSfx().mix;
    const expected = (ch: 'music' | 'sfx' | 'ui', s = DEFAULT_SETTINGS) => stepGain(s.master) * stepGain(s[ch]) * mix[ch];
    CHANNELS.forEach((ch, i) => expect(channelNodes[i]!.gain.value).toBeCloseTo(expected(ch), 6));
    t.audio.update({ sfx: 100 });
    expect(channelNodes[CHANNELS.indexOf('sfx')]!.gain.value).toBeCloseTo(expected('sfx', { ...DEFAULT_SETTINGS, sfx: 100 }), 6);
    t.audio.update({ muted: true });
    for (const n of channelNodes) expect(n.gain.value).toBe(0);
    expect(fire(t, 'game.miss')).toHaveLength(0);
  });

  it('nunca hay más de 10 efectos sonando a la vez; al terminar se liberan', () => {
    const t = setup({ muted: false });
    t.audio.unlock();
    let sounding = 0;
    for (const id of SOUND_IDS) if (fire(t, id).length > 0) sounding++;
    // Hay de sobra efectos de prioridad normal y alta: se llenan las 10 voces y ni la prioridad máxima pasa de ahí.
    expect(sounding).toBe(10);
    t.advance(3000);
    expect(fire(t, 'game.win').length).toBeGreaterThan(0);
  });

  it('el enfriamiento descarta repeticiones del mismo efecto', () => {
    const t = setup({ muted: false });
    t.audio.unlock();
    expect(fire(t, 'game.hit').length).toBeGreaterThan(0);
    t.advance(30);
    expect(fire(t, 'game.hit')).toHaveLength(0);
    t.advance(40);
    expect(fire(t, 'game.hit').length).toBeGreaterThan(0);
  });

  it('recent guarda los ids pedidos con el sonido activado (también antes del gesto), los últimos 20', () => {
    const muted = setup();
    muted.audio.play('ui.tap');
    expect(muted.audio.state().recent).toEqual([]);

    const t = setup({ muted: false });
    t.audio.play('ui.tap');
    expect(t.audio.state().recent).toEqual(['ui.tap']);
    t.audio.unlock();
    for (let i = 0; i < 25; i++) t.audio.play(i % 2 ? 'game.bid' : 'game.score');
    const recent = t.audio.state().recent;
    expect(recent).toHaveLength(20);
    expect(recent.at(-1)).toBe('game.score');
  });

  it('los efectos pedidos antes del gesto se descartan; la música pendiente se aplica al desbloquear', () => {
    const calls: string[] = [];
    const createMusic: AudioDeps['createMusic'] = (_ctx, out, cfg): MusicPlayerLike => {
      calls.push(`create ${cfg.fadeInSec}`);
      expect(out).toBeInstanceOf(FakeGain);
      return { play: (track) => calls.push(`play ${track}`), duck: (on) => calls.push(`duck ${on}`) };
    };
    const t = setup({ muted: false, createMusic });
    t.audio.play('game.hit');
    t.audio.music.play('lobby');
    t.audio.music.duck(true);
    expect(calls).toEqual([]);
    t.audio.unlock();
    expect(t.ctx().sources).toHaveLength(0);
    expect(calls).toEqual(['create 0.7', 'play lobby', 'duck true']);
    t.audio.music.play('game');
    t.audio.music.duck(false);
    expect(calls.slice(3)).toEqual(['play game', 'duck false']);
  });

  it('pestaña oculta suspende el contexto y visible lo reanuda; oculto no suena nada', () => {
    const t = setup({ muted: false });
    t.audio.unlock();
    t.audio.setHidden(true);
    expect(t.ctx().suspends).toBe(1);
    expect(fire(t, 'game.hit')).toHaveLength(0);
    t.audio.setHidden(false);
    expect(t.ctx().state).toBe('running');
    expect(fire(t, 'game.hit').length).toBeGreaterThan(0);

    // Un contexto suspendido por el sistema (Safari/iOS) se reanuda con el siguiente gesto.
    t.ctx().state = 'interrupted';
    t.audio.unlock();
    expect(t.ctx().state).toBe('running');
    expect(t.contexts).toHaveLength(1);

    const hidden = setup({ muted: false, hidden: true });
    hidden.audio.unlock();
    expect(hidden.ctx().suspends).toBe(1);
  });

  it('update persiste, avisa a los suscriptores y mantiene la misma referencia sin cambios', () => {
    const t = setup();
    const first = t.audio.settings();
    expect(t.audio.settings()).toBe(first);
    let calls = 0;
    const off = t.audio.subscribe(() => { calls++; });
    t.audio.update({ music: 25 });
    expect(calls).toBe(1);
    expect(t.audio.settings()).not.toBe(first);
    expect(t.audio.settings().music).toBe(25);
    expect(JSON.parse(t.storage.data.get(AUDIO_STORAGE_KEY)!)).toMatchObject({ music: 25, muted: true });
    t.audio.toggleMute();
    expect(t.audio.settings().muted).toBe(false);
    off();
    t.audio.update({ ui: 0 });
    expect(calls).toBe(2);
  });

  it('sobrevive sin AudioContext ni storage', () => {
    for (const createContext of [() => null, () => { throw new Error('sin Web Audio'); }]) {
      const audio = createAudio({ createContext, storage: null, now: () => 0 });
      expect(() => {
        audio.unlock();
        audio.update({ muted: false });
        audio.unlock();
        audio.play('ui.confirm');
        audio.music.play('lobby');
        audio.music.duck(true);
        audio.setHidden(true);
        audio.setHidden(false);
      }).not.toThrow();
      expect(audio.state()).toEqual({ unlocked: false, muted: false, recent: ['ui.confirm'] });
    }
  });
});
