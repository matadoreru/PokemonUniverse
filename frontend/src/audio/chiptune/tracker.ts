/**
 * Secuenciador chiptune (spec §8), portado de Inazuma: una canción es un tempo, un número de
 * compases y pistas con un patrón de texto (una nota por paso: `C4`, `F#3`; `-` alarga la anterior,
 * `.` silencio; en la pista de batería `k` bombo, `s` caja, `h` charles, `o` charles abierto).
 * `compileSong` es puro (testable); `renderSong` la convierte una sola vez en un búfer con un
 * `OfflineAudioContext`. Un tema en bucle se renderiza dos vueltas y se conserva la segunda: así las
 * colas de las notas del final ya están al principio y el bucle no tiene corte ni solape. Un tema sin
 * bucle (la fanfarria) se renderiza una vez con su cola. Las ondas vienen de `synth.ts`.
 */
import type { AudioBufferLike, AudioNodeLike, SynthContext } from '../synth';
import { applyWave, noiseBuffer } from '../synth';

export type Wave = 'pulse12' | 'pulse25' | 'square' | 'triangle' | 'saw' | 'sine';

export interface TrackDef {
  wave: Wave | 'drums';
  gain: number;
  /** Envolvente: ataque (s), caída (s), nivel de sostenido (0–1) y liberación (s). */
  env: [number, number, number, number];
  /** Pasos por compás (8 = corcheas, 16 = semicorcheas). */
  steps: 8 | 16;
  pattern: string;
  /** Desvío fijo en cents (p. ej. una segunda voz desafinada). */
  detune?: number;
}

export interface Song {
  bpm: number;
  bars: number;
  /** `false` = suena una vez y vuelve al silencio (fanfarria). */
  loop: boolean;
  tracks: TrackDef[];
}

export interface NoteEvent {
  t: number;
  dur: number;
  freq: number;
  wave: Wave;
  gain: number;
  env: TrackDef['env'];
  detune: number;
}

export type DrumKind = 'k' | 's' | 'h' | 'o';

export interface DrumEvent {
  t: number;
  kind: DrumKind;
  gain: number;
}

export interface CompiledSong {
  length: number;
  notes: NoteEvent[];
  drums: DrumEvent[];
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frecuencia de una nota ("A4" = 440 Hz; sostenidos con #, bemoles con b). */
export function noteHz(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`nota inválida: ${name}`);
  const semis = SEMITONE[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** ((semis - 9) / 12);
}

/** Duración de la canción en segundos (compases de 4/4). */
export function songLength(song: Pick<Song, 'bpm' | 'bars'>): number {
  return (song.bars * 4 * 60) / song.bpm;
}

function tokens(pattern: string): string[] {
  return pattern.split(/\s+/).filter((t) => t && t !== '|');
}

/** Compila una pista en eventos con tiempo absoluto; el patrón debe tener `bars × steps` pasos. */
export function compileTrack(track: TrackDef, bpm: number, bars: number): { notes: NoteEvent[]; drums: DrumEvent[] } {
  const toks = tokens(track.pattern);
  const expected = bars * track.steps;
  if (toks.length !== expected) throw new Error(`patrón de ${toks.length} pasos; se esperaban ${expected}`);
  const stepDur = 60 / bpm / (track.steps / 4);
  const notes: NoteEvent[] = [];
  const drums: DrumEvent[] = [];
  if (track.wave === 'drums') {
    toks.forEach((tk, i) => {
      if (tk === '.' || tk === '-') return;
      if (tk !== 'k' && tk !== 's' && tk !== 'h' && tk !== 'o') throw new Error(`golpe inválido: ${tk}`);
      drums.push({ t: i * stepDur, kind: tk, gain: track.gain });
    });
    return { notes, drums };
  }
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i]!;
    if (tk === '.' || tk === '-') continue;
    let len = 1;
    while (i + len < toks.length && toks[i + len] === '-') len++;
    notes.push({ t: i * stepDur, dur: len * stepDur, freq: noteHz(tk), wave: track.wave, gain: track.gain, env: track.env, detune: track.detune ?? 0 });
  }
  return { notes, drums };
}

export function compileSong(song: Song): CompiledSong {
  const notes: NoteEvent[] = [];
  const drums: DrumEvent[] = [];
  for (const t of song.tracks) {
    const c = compileTrack(t, song.bpm, song.bars);
    notes.push(...c.notes);
    drums.push(...c.drums);
  }
  return { length: songLength(song), notes, drums };
}

// ---------------------------------------------------------------- render

/** Lo que el render necesita de un `OfflineAudioContext`. */
export interface OfflineContextLike extends SynthContext {
  startRendering(): Promise<RenderedBuffer>;
}

/** Búfer renderizado (un `AudioBuffer` real lo cumple). */
export interface RenderedBuffer extends AudioBufferLike {
  readonly length: number;
}

export type OfflineFactory = (channels: number, length: number, sampleRate: number) => OfflineContextLike;

const browserOffline: OfflineFactory = (channels, length, sampleRate) => {
  const Ctor = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Ctor) throw new Error('sin OfflineAudioContext');
  const ctx: OfflineContextLike = new Ctor(channels, length, sampleRate);
  return ctx;
};

/** Frecuencia de muestreo del render (basta para el chiptune y pesa la mitad que 44,1 kHz). */
export const RENDER_RATE = 22050;
/** Cola que se deja tras la última nota de un tema sin bucle (s). */
export const RESULT_TAIL_SEC = 1;

function scheduleNote(ctx: SynthContext, out: AudioNodeLike, n: NoteEvent, offset: number): void {
  const t0 = n.t + offset;
  const [a, d, s, r] = n.env;
  const osc = ctx.createOscillator();
  applyWave(osc, ctx, n.wave);
  osc.frequency.value = n.freq;
  osc.detune.value = n.detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(n.gain, t0 + a);
  g.gain.linearRampToValueAtTime(n.gain * s, t0 + a + d);
  const end = t0 + Math.max(a + d, n.dur - 0.01);
  g.gain.setValueAtTime(n.gain * s, end);
  g.gain.linearRampToValueAtTime(0, end + r);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(end + r + 0.02);
}

function scheduleDrum(ctx: SynthContext, out: AudioNodeLike, e: DrumEvent, offset: number): void {
  const t0 = e.t + offset;
  if (e.kind === 'k') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(e.gain, t0);
    g.gain.linearRampToValueAtTime(0, t0 + 0.16);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.18);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const dur = e.kind === 's' ? 0.12 : e.kind === 'h' ? 0.035 : 0.14;
  if (e.kind === 's') {
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
  } else {
    f.type = 'highpass';
    f.frequency.value = 6500;
  }
  g.gain.setValueAtTime(e.gain * (e.kind === 's' ? 1 : 0.55), t0);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.01);
  if (e.kind === 's') {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(e.gain * 0.5, t0);
    g2.gain.linearRampToValueAtTime(0, t0 + 0.05);
    osc.connect(g2);
    g2.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.06);
  }
}

/**
 * Renderiza la canción a un búfer mono. En bucle: dura exactamente la canción. Sin bucle: la
 * canción más `RESULT_TAIL_SEC` de cola.
 */
export async function renderSong(song: Song, sampleRate: number = RENDER_RATE, createOffline: OfflineFactory = browserOffline): Promise<RenderedBuffer> {
  const c = compileSong(song);
  const L = c.length;
  const frames = Math.ceil((song.loop ? L : L + RESULT_TAIL_SEC) * sampleRate);
  const ctx = createOffline(1, song.loop ? frames * 2 : frames, sampleRate);
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);
  for (const offset of song.loop ? [0, L] : [0]) {
    for (const n of c.notes) scheduleNote(ctx, out, n, offset);
    for (const d of c.drums) scheduleDrum(ctx, out, d, offset);
  }
  const full = await ctx.startRendering();
  if (!song.loop) return full;
  // `createBuffer` de un contexto real devuelve un `AudioBuffer`, que tiene `length`.
  const loop = ctx.createBuffer(1, frames, sampleRate) as RenderedBuffer;
  loop.getChannelData(0).set(full.getChannelData(0).subarray(frames, frames * 2));
  return loop;
}
