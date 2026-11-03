/**
 * Temas propios (spec §8): cada uno compila sin errores en el tracker, dura lo previsto y respeta su
 * carácter (vestíbulo en Do mayor a 120 bpm y 16 compases, juego más rápido, fanfarria corta sin
 * bucle). El render con `OfflineAudioContext` se prueba con un contexto falso.
 */
import { describe, expect, it } from 'vitest';
import { SONGS } from './chiptune/songs';
import { compileSong, compileTrack, noteHz, renderSong, RESULT_TAIL_SEC, songLength, type OfflineContextLike } from './chiptune/tracker';

const TRACKS = ['lobby', 'game', 'results'] as const;

describe('tracker', () => {
  it('convierte nombres de nota en Hz (A4 = 440, sostenidos y bemoles)', () => {
    expect(noteHz('A4')).toBe(440);
    expect(noteHz('C4')).toBeCloseTo(261.63, 1);
    expect(noteHz('F#3')).toBeCloseTo(185, 0);
    expect(noteHz('Bb3')).toBeCloseTo(233.08, 1);
    expect(() => noteHz('H4')).toThrow();
  });

  it('compila un patrón: `-` alarga, `.` es silencio y el largo debe cuadrar con los compases', () => {
    const c = compileTrack({ wave: 'square', gain: 0.2, env: [0, 0, 1, 0], steps: 8, pattern: 'C4 - . E4 | G4 - - -' }, 120, 1);
    expect(c.notes.map((n) => [n.t, n.dur])).toEqual([[0, 0.5], [0.75, 0.25], [1, 1]]);
    expect(() => compileTrack({ wave: 'square', gain: 0.2, env: [0, 0, 1, 0], steps: 8, pattern: 'C4 - .' }, 120, 1)).toThrow(/pasos/);
    const d = compileTrack({ wave: 'drums', gain: 0.3, env: [0, 0, 1, 0], steps: 16, pattern: 'k . h . s . h . k . h . s . h h' }, 120, 1);
    expect(d.drums.filter((x) => x.kind === 'k')).toHaveLength(2);
    expect(d.drums.filter((x) => x.kind === 'h')).toHaveLength(5);
  });
});

describe('temas', () => {
  it('cada tema compila sin errores y sus notas caben en el bucle y en un rango audible', () => {
    for (const key of TRACKS) {
      const song = SONGS[key];
      const c = compileSong(song);
      expect(c.length, key).toBeCloseTo(songLength(song), 9);
      expect(c.notes.length, key).toBeGreaterThan(16);
      for (const n of c.notes) {
        expect(n.t + n.dur, key).toBeLessThanOrEqual(c.length + 1e-9);
        expect(n.freq, key).toBeGreaterThan(55);
        expect(n.freq, key).toBeLessThan(2100);
      }
    }
  });

  it('vestíbulo: Do mayor (sin alteraciones) a 120 bpm, 16 compases en bucle', () => {
    const lobby = SONGS.lobby;
    expect(lobby.bpm).toBe(120);
    expect(lobby.bars).toBe(16);
    expect(lobby.loop).toBe(true);
    expect(songLength(lobby)).toBe(32);
    for (const t of lobby.tracks) expect(t.pattern, t.wave).not.toMatch(/[#b]/);
  });

  it('juego: más tenso y rápido (~140 bpm), en bucle de no más de ~30 s', () => {
    expect(SONGS.game.bpm).toBeGreaterThanOrEqual(136);
    expect(SONGS.game.bpm).toBeLessThanOrEqual(150);
    expect(SONGS.game.loop).toBe(true);
    expect(songLength(SONGS.game)).toBeLessThanOrEqual(30);
    expect(songLength(SONGS.game)).toBeGreaterThanOrEqual(12);
  });

  it('resultados: fanfarria corta que no hace bucle', () => {
    expect(SONGS.results.loop).toBe(false);
    expect(songLength(SONGS.results)).toBeLessThanOrEqual(10);
    expect(songLength(SONGS.results)).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------- render con un contexto falso

class Param {
  value = 0;
  setValueAtTime(): void { /* nada */ }
  linearRampToValueAtTime(): void { /* nada */ }
  exponentialRampToValueAtTime(): void { /* nada */ }
  cancelScheduledValues(): void { /* nada */ }
}
class Node { connect(d: unknown): unknown { return d; } }

function fakeOffline(created: { length: number; rate: number; starts: number }[]) {
  return (channels: number, length: number, rate: number): OfflineContextLike => {
    expect(channels).toBe(1);
    const info = { length, rate, starts: 0 };
    created.push(info);
    const buffer = (len: number) => { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; };
    return {
      currentTime: 0,
      sampleRate: rate,
      destination: new Node(),
      createGain: () => Object.assign(new Node(), { gain: new Param() }),
      createOscillator: () => Object.assign(new Node(), { type: 'sine', frequency: new Param(), detune: new Param(), setPeriodicWave() { /* nada */ }, start() { info.starts++; }, stop() { /* nada */ } }),
      createBufferSource: () => Object.assign(new Node(), { buffer: null, loop: false, start() { info.starts++; }, stop() { /* nada */ } }),
      createBiquadFilter: () => Object.assign(new Node(), { type: 'lowpass', frequency: new Param(), Q: new Param() }),
      createBuffer: (_c: number, len: number) => buffer(len),
      createPeriodicWave: () => ({}),
      startRendering: () => Promise.resolve(buffer(length)),
    };
  };
}

describe('renderSong', () => {
  it('un tema en bucle se renderiza dos vueltas y se queda con la segunda (bucle sin corte)', async () => {
    const created: { length: number; rate: number; starts: number }[] = [];
    const rate = 8000;
    const buf = await renderSong(SONGS.game, rate, fakeOffline(created));
    const frames = Math.ceil(songLength(SONGS.game) * rate);
    expect(created).toHaveLength(1);
    expect(created[0]!.length).toBe(frames * 2);
    expect(buf.length).toBe(frames);
    expect(created[0]!.starts).toBeGreaterThan(0);
  });

  it('la fanfarria se renderiza una sola vez con su cola', async () => {
    const created: { length: number; rate: number; starts: number }[] = [];
    const rate = 8000;
    const buf = await renderSong(SONGS.results, rate, fakeOffline(created));
    const frames = Math.ceil((songLength(SONGS.results) + RESULT_TAIL_SEC) * rate);
    expect(created[0]!.length).toBe(frames);
    expect(buf.length).toBe(frames);
  });
});
