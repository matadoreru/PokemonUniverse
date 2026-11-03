/**
 * Reproductor de música (spec §8), portado de Inazuma sin las pistas personales ni la capa de
 * intensidad: un tema por fase de la sala, renderizado una sola vez con `OfflineAudioContext` y
 * cacheado; al cambiar, fundido de salida (0,4 s) y solo después fundido de entrada (0,7 s), nunca
 * solapados. Mientras suena un grito de Cry Quiz la música baja al 30 % (ducking). Silenciado no
 * renderiza ni toca nada: el motor solo deja a 0 la ganancia del canal, así que el reproductor para
 * sus fuentes y, al reactivar el sonido, retoma el tema pedido. La fanfarria de resultados suena una
 * vez y deja silencio hasta que cambie la fase.
 *
 * Cadena: fuente → fundido (una por tema) → ducking (compartido) → canal de música.
 */
import type { RoomPhase } from '@pokemon-universe/shared/public';
import type { SfxFile } from './catalog';
import { SONGS } from './chiptune/songs';
import { RENDER_RATE, renderSong } from './chiptune/tracker';
import type { AudioContextLike, GainLike, MusicPlayerLike, MusicTrack } from './engine';
import type { BufferSourceLike } from './synth';
import { rampTo } from './mixer';

export interface RenderedTrack {
  /** El `AudioBuffer` que se asigna a la fuente. */
  buffer: unknown;
  /** Duración del búfer en segundos. */
  seconds: number;
}

export interface MusicPlayerOptions {
  render(track: MusicTrack): Promise<RenderedTrack>;
  isMuted(): boolean;
  /** Avisa de cualquier cambio de ajustes (se compara el silencio). */
  subscribe(fn: () => void): () => void;
  /** Reloj en milisegundos. */
  now(): number;
  /** Temporizador (inyectado para los tests). */
  after(ms: number, fn: () => void): void;
}

/** Rampa del ducking (s): rápida para que el grito se oiga desde el principio. */
const DUCK_RAMP_SEC = 0.15;
/** Margen tras programar el final de una rampa antes de parar la fuente (s). */
const STOP_MARGIN_SEC = 0.05;

interface Playing {
  fade: GainLike;
  src: BufferSourceLike;
}

function quietStop(src: BufferSourceLike, at: number): void {
  try {
    src.stop(at);
  } catch {
    // Una fuente ya parada no debe romper nada.
  }
}

function disconnect(node: unknown): void {
  try {
    (node as { disconnect?: () => void }).disconnect?.();
  } catch {
    // Ídem.
  }
}

export function createMusicPlayer(ctx: AudioContextLike, out: GainLike, cfg: SfxFile['music'], opts: MusicPlayerOptions): MusicPlayerLike {
  const duckNode = ctx.createGain();
  duckNode.gain.value = 1;
  duckNode.connect(out);
  /** Tema pedido por la UI (se recuerda también silenciado). */
  let wanted: MusicTrack | null = null;
  let current: Playing | null = null;
  /** Cada petición invalida las anteriores (renders y esperas en curso). */
  let gen = 0;
  /** Hasta cuándo dura el último fundido de salida (ms): el siguiente tema no entra antes. */
  let quietUntil = 0;
  /** La fanfarria sin bucle ya sonó para la petición actual. */
  let oneShotDone = false;
  let wasMuted = opts.isMuted();
  const render = cachedRender(opts.render);

  function stopCurrent(fadeSec: number): void {
    const c = current;
    if (!c) return;
    current = null;
    const t = ctx.currentTime;
    rampTo(c.fade.gain, 0, t, fadeSec);
    quietStop(c.src, t + fadeSec + STOP_MARGIN_SEC);
    quietUntil = Math.max(quietUntil, opts.now() + fadeSec * 1000);
    opts.after((fadeSec + 0.2) * 1000, () => disconnect(c.fade));
  }

  function begin(g: number, track: MusicTrack, r: RenderedTrack): void {
    if (g !== gen || opts.isMuted()) return;
    const loop = SONGS[track].loop;
    const fade = ctx.createGain();
    fade.gain.value = 0;
    fade.connect(duckNode);
    const src = ctx.createBufferSource();
    src.buffer = r.buffer;
    src.loop = loop;
    src.connect(fade);
    const t = ctx.currentTime;
    src.start(t);
    rampTo(fade.gain, 1, t, cfg.fadeInSec);
    const playing: Playing = { fade, src };
    current = playing;
    if (!loop) {
      oneShotDone = true;
      // Al acabar la fanfarria se suelta; la petición sigue siendo `results` y no se repite.
      opts.after(r.seconds * 1000, () => {
        if (current !== playing) return;
        current = null;
        disconnect(fade);
      });
    }
  }

  function start(track: MusicTrack | null): void {
    const g = ++gen;
    stopCurrent(cfg.fadeOutSec);
    if (track === null) return;
    render(track).then(
      (r) => {
        if (g !== gen || opts.isMuted()) return;
        const wait = quietUntil - opts.now();
        if (wait > 0) opts.after(wait, () => begin(g, track, r));
        else begin(g, track, r);
      },
      () => undefined,
    );
  }

  opts.subscribe(() => {
    const m = opts.isMuted();
    if (m === wasMuted) return;
    wasMuted = m;
    if (m) {
      // El canal ya está a 0: se para todo al instante y se olvida lo que estuviera por entrar.
      gen++;
      stopCurrent(0);
      quietUntil = 0;
    } else if (wanted && !oneShotDone) {
      start(wanted);
    }
  });

  return {
    play(track) {
      if (track === wanted) return;
      wanted = track;
      oneShotDone = false;
      if (opts.isMuted()) {
        gen++;
        return;
      }
      start(track);
    },
    duck(on) {
      rampTo(duckNode.gain, on ? cfg.duck : 1, ctx.currentTime, DUCK_RAMP_SEC);
    },
  };
}

// ---------------------------------------------------------------- render cacheado por tema

/** Envuelve un renderizador para que cada tema se renderice una sola vez; un fallo se olvida para reintentar. */
export function cachedRender(render: (track: MusicTrack) => Promise<RenderedTrack>): (track: MusicTrack) => Promise<RenderedTrack> {
  const cache = new Map<MusicTrack, Promise<RenderedTrack>>();
  return (track) => {
    let p = cache.get(track);
    if (!p) {
      p = render(track);
      p.catch(() => cache.delete(track));
      cache.set(track, p);
    }
    return p;
  };
}

/** Render real con `OfflineAudioContext`, compartido por todos los reproductores (también tras recargas en caliente). */
export const renderTrack = cachedRender((track) =>
  renderSong(SONGS[track], RENDER_RATE).then((buffer) => ({ buffer, seconds: buffer.length / RENDER_RATE })));

// ---------------------------------------------------------------- fase de la sala → tema

/**
 * Vestíbulo y votación del siguiente juego → `lobby`; resultados del juego y de la sesión →
 * `results`; la intro y todas las fases internas del juego (también sus rondas de resultados y
 * votaciones) → `game`, para que la música no cambie en cada ronda. Sin sala → silencio.
 */
export function musicTrackFor(phase: RoomPhase | null | undefined): MusicTrack | null {
  if (!phase) return null;
  if (phase === 'LOBBY' || phase === 'NEXT_GAME_VOTE' || phase === 'NEXT_GAME_VOTE_RESULTS') return 'lobby';
  if (phase === 'GAME_RESULTS' || phase === 'SESSION_RESULTS') return 'results';
  return 'game';
}
