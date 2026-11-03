/**
 * Gestor central de audio (spec §8), portado de Inazuma sin el ambiente ni la música del fútbol.
 * Un único `AudioContext` que solo se crea dentro de un gesto del usuario y con el sonido activado;
 * canales música / efectos / interfaz con su ganancia; silencio general; suspensión con la pestaña
 * oculta; efectos sintetizados desde `sfx.json` con límite de voces, enfriamiento y variación
 * determinista. Todas sus dependencias del navegador llegan inyectadas (ver `index.ts`).
 */
import { loadSfx, type Channel, type SfxFile, type SoundId } from './catalog';
import { channelGains, rampTo } from './mixer';
import { loadSettings, migrateLegacy, sanitizeSettings, saveSettings, type AudioSettings, type StorageLike } from './settings';
import { playSound, soundDuration, type AudioContextLike, type GainLike } from './synth';
import { variationFor } from './variation';
import { VoicePool } from './voices';

export type { AudioContextLike, GainLike } from './synth';

/** Orden en que se crean los nodos de canal. */
export const CHANNELS: readonly Channel[] = ['music', 'sfx', 'ui'];

export type MusicTrack = 'lobby' | 'game' | 'results';

/** Lo que la UI pide a la música: un tema (o silencio) y bajar el volumen mientras suena un grito. */
export interface MusicControl {
  play(track: MusicTrack | null): void;
  duck(on: boolean): void;
}

/** Reproductor real de música (lo aporta la Task 2); recibe el contexto ya desbloqueado. */
export type MusicPlayerLike = MusicControl;

export interface DocumentLike {
  readonly hidden: boolean;
}

export interface AudioDeps {
  /** Crea el `AudioContext`; `null` (o una excepción) = sin Web Audio. */
  createContext(): AudioContextLike | null;
  storage: StorageLike | null;
  /** Reloj en milisegundos (enfriamiento y voces). */
  now(): number;
  document?: DocumentLike;
  /** Crea el reproductor de música al desbloquear, conectado al canal de música. */
  createMusic?(ctx: AudioContextLike, out: GainLike, cfg: SfxFile['music']): MusicPlayerLike;
}

export interface AudioState {
  unlocked: boolean;
  muted: boolean;
  /** Últimos 20 ids pedidos con el sonido activado (para los E2E). */
  recent: SoundId[];
}

export interface Audio {
  play(id: SoundId): void;
  /** Llamar solo desde un gesto del usuario (`pointerdown`, `keydown`). */
  unlock(): void;
  settings(): AudioSettings;
  update(patch: Partial<AudioSettings>): void;
  toggleMute(): void;
  subscribe(fn: () => void): () => void;
  setHidden(hidden: boolean): void;
  music: MusicControl;
  state(): AudioState;
}

const RAMP_SEC = 0.08;
const RECENT_MAX = 20;

function quiet(p: Promise<void> | undefined): void {
  // Una promesa de resume/suspend rechazada nunca debe llegar a la consola.
  void p?.catch(() => undefined);
}

export function createAudio(deps: AudioDeps, cfg: SfxFile = loadSfx()): Audio {
  const pool = new VoicePool(cfg.limits.maxVoices, cfg.limits.defaultCooldownMs);
  const listeners = new Set<() => void>();
  const recent: SoundId[] = [];
  migrateLegacy(deps.storage);
  let settings: AudioSettings = loadSettings(deps.storage);
  let ctx: AudioContextLike | null = null;
  let channels: Record<Channel, GainLike> | null = null;
  let player: MusicPlayerLike | null = null;
  let gestured = false;
  let hidden = deps.document?.hidden ?? false;
  let pendingTrack: MusicTrack | null = null;
  let ducked = false;
  let seed = 0;

  function applyGains(): void {
    if (!ctx || !channels) return;
    const g = channelGains(settings, cfg.mix);
    for (const c of CHANNELS) rampTo(channels[c].gain, g[c], ctx.currentTime, RAMP_SEC);
  }

  function applyHidden(): void {
    if (!ctx) return;
    try {
      if (hidden) quiet(ctx.suspend());
      else if (ctx.state !== 'running') quiet(ctx.resume());
    } catch {
      // Sin suspender: el audio sigue, nunca rompe la pantalla.
    }
  }

  /** Crea el contexto y el grafo de canales; solo tras un gesto y con el sonido activado. */
  function ensureContext(): void {
    if (ctx || !gestured || settings.muted) return;
    let created: AudioContextLike | null = null;
    try {
      created = deps.createContext();
    } catch {
      created = null;
    }
    if (!created) return;
    try {
      const master = created.createGain();
      master.gain.value = 1;
      master.connect(created.destination);
      const ch = {} as Record<Channel, GainLike>;
      for (const c of CHANNELS) {
        ch[c] = created.createGain();
        ch[c].gain.value = 0;
        ch[c].connect(master);
      }
      ctx = created;
      channels = ch;
    } catch {
      return;
    }
    applyGains();
    hidden = deps.document?.hidden ?? hidden;
    applyHidden();
    // Lo pedido antes del gesto: la música se aplica; los efectos ya se descartaron.
    try {
      player = deps.createMusic?.(ctx, channels.music, cfg.music) ?? null;
      if (player) {
        if (pendingTrack) player.play(pendingTrack);
        if (ducked) player.duck(true);
      }
    } catch {
      player = null;
    }
  }

  function notify(): void {
    listeners.forEach((fn) => fn());
  }

  const music: MusicControl = {
    play(track) {
      pendingTrack = track;
      try {
        player?.play(track);
      } catch {
        // La música nunca rompe la pantalla.
      }
    },
    duck(on) {
      ducked = on;
      try {
        player?.duck(on);
      } catch {
        // Ídem.
      }
    },
  };

  const audio: Audio = {
    play(id) {
      const s = cfg.sounds[id];
      if (!s || settings.muted) return;
      recent.push(id);
      if (recent.length > RECENT_MAX) recent.shift();
      if (!ctx || !channels || hidden) return;
      if (!pool.tryAcquire(id, deps.now() / 1000, soundDuration(s), s.priority, s.cooldownMs)) return;
      try {
        playSound(ctx, channels[s.channel], s, ctx.currentTime, variationFor(++seed, cfg.variation));
      } catch {
        // Un fallo de Web Audio nunca rompe la pantalla de juego.
      }
    },
    unlock() {
      gestured = true;
      ensureContext();
    },
    settings: () => settings,
    update(patch) {
      const next = sanitizeSettings({ ...settings, ...patch });
      if (CHANNELS.every((c) => next[c] === settings[c]) && next.master === settings.master && next.muted === settings.muted) return;
      settings = next;
      saveSettings(deps.storage, settings);
      // Activar el sonido ocurre dentro de un gesto (clic o tecla M): si ya hubo uno, se crea el contexto.
      ensureContext();
      applyGains();
      notify();
    },
    toggleMute() {
      audio.update({ muted: !settings.muted });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    setHidden(h) {
      hidden = h;
      applyHidden();
    },
    music,
    state: () => ({ unlocked: ctx !== null, muted: settings.muted, recent: [...recent] }),
  };
  return audio;
}
