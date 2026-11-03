/**
 * Sintetizador de efectos (spec §8), portado de Inazuma: construye en Web Audio las voces de un
 * efecto de `sfx.json` (oscilador o ruido, envolvente, deslizamiento o arpegio, filtro, vibrato)
 * con la variación determinista del disparo. Trabaja sobre interfaces mínimas (`AudioContextLike`)
 * para que los tests usen un contexto falso; un `AudioContext` real las cumple.
 */
import type { SfxSound, SfxVoice, SfxWave } from './catalog';
import type { Variation } from './variation';

// ---------------------------------------------------------------- interfaces mínimas de Web Audio

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
}

export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  detune: AudioParamLike;
  setPeriodicWave(wave: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: unknown;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BiquadLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  Q: AudioParamLike;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createBufferSource(): BufferSourceLike;
  createBiquadFilter(): BiquadLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createPeriodicWave(real: Float32Array, imag: Float32Array): unknown;
}

/** Lo que el sintetizador necesita de un contexto (también vale un `OfflineAudioContext`). */
export type SynthContext = Omit<AudioContextLike, 'state' | 'resume' | 'suspend'>;

// ---------------------------------------------------------------- ondas chiptune

const waveCache = new WeakMap<object, Map<number, unknown>>();

/** Onda de pulso con ciclo de trabajo `duty` (serie de Fourier, 48 armónicos), cacheada por contexto. */
export function pulseWave(ctx: SynthContext, duty: number): unknown {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  const hit = m.get(duty);
  if (hit) return hit;
  const n = 48;
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  const w = ctx.createPeriodicWave(real, imag);
  m.set(duty, w);
  return w;
}

export function applyWave(osc: OscillatorLike, ctx: SynthContext, wave: Exclude<SfxWave, 'noise'>): void {
  if (wave === 'pulse12') osc.setPeriodicWave(pulseWave(ctx, 0.125));
  else if (wave === 'pulse25') osc.setPeriodicWave(pulseWave(ctx, 0.25));
  else if (wave === 'saw') osc.type = 'sawtooth';
  else osc.type = wave;
}

const noiseCache = new WeakMap<object, AudioBufferLike>();

/** Un segundo de ruido blanco determinista (xorshift), compartido por contexto. */
export function noiseBuffer(ctx: SynthContext): AudioBufferLike {
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < d.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  noiseCache.set(ctx, buf);
  return buf;
}

// ---------------------------------------------------------------- efectos

function voiceDuration(v: SfxVoice): number {
  const arp = v.notes ? v.notes.length * (v.step ?? 0) : 0;
  return v.delay + v.attack + v.hold + v.decay + arp;
}

/** Duración total de un efecto (segundos): la de su voz más larga. */
export function soundDuration(s: SfxSound): number {
  return Math.max(...s.voices.map(voiceDuration));
}

function scheduleVoice(ctx: SynthContext, out: AudioNodeLike, v: SfxVoice, at: number, vr: Variation): void {
  const t0 = at + v.delay;
  const arp = v.notes ? v.notes.length * (v.step ?? 0) : 0;
  const peakAt = t0 + v.attack;
  const sustainEnd = peakAt + v.hold + arp;
  const end = sustainEnd + v.decay;
  const g = ctx.createGain();
  const gain = Math.min(1, v.gain * vr.gain);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, peakAt);
  g.gain.setValueAtTime(gain, sustainEnd);
  g.gain.linearRampToValueAtTime(0, end);
  let head: AudioNodeLike = g;
  if (v.filter) {
    const f = ctx.createBiquadFilter();
    f.type = v.filter.type;
    f.frequency.value = v.filter.freq;
    f.Q.value = v.filter.q;
    f.connect(g);
    head = f;
  }
  g.connect(out);
  if (v.wave === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    src.connect(head);
    src.start(t0);
    src.stop(end + 0.02);
    return;
  }
  const osc = ctx.createOscillator();
  applyWave(osc, ctx, v.wave);
  osc.detune.value = vr.cents;
  if (v.notes) {
    const step = v.step ?? 0.05;
    osc.frequency.setValueAtTime(v.notes[0] ?? 440, t0);
    v.notes.forEach((f, i) => osc.frequency.setValueAtTime(f, peakAt + i * step));
  } else {
    const f0 = v.freq ?? 440;
    osc.frequency.setValueAtTime(f0, t0);
    if (v.slide) osc.frequency.exponentialRampToValueAtTime(v.slide, end);
  }
  if (v.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = v.vibrato.hz;
    const depth = ctx.createGain();
    depth.gain.value = v.vibrato.cents;
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(t0);
    lfo.stop(end + 0.02);
  }
  osc.connect(head);
  osc.start(t0);
  osc.stop(end + 0.02);
}

/** Programa el efecto en `out` a partir de `at` (segundos del contexto); devuelve su duración. */
export function playSound(ctx: SynthContext, out: AudioNodeLike, s: SfxSound, at: number, vr: Variation): number {
  for (const v of s.voices) scheduleVoice(ctx, out, v, at, vr);
  return soundDuration(s);
}
