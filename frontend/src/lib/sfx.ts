import { useSyncExternalStore } from 'react';

/** Sonidos de interfaz generados con Web Audio: sin ficheros, apagados por defecto y activados solo por el jugador. */
export type SfxName = 'tick' | 'hit' | 'miss' | 'reveal' | 'win' | 'clang';

export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
}

export interface OscillatorLike {
  type: string;
  frequency: AudioParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike {
  gain: AudioParamLike & { exponentialRampToValueAtTime(value: number, time: number): unknown };
  connect(destination: unknown): unknown;
}

export interface AudioContextLike {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface SfxDeps {
  createContext(): AudioContextLike | null;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}

export interface Sfx {
  isEnabled(): boolean;
  setEnabled(on: boolean): void;
  play(name: SfxName): void;
  subscribe(listener: () => void): () => void;
}

export const SFX_STORAGE_KEY = 'pokemon-universe-sfx';

interface Recipe { wave: string; notes: readonly number[]; seconds: number; chord?: boolean }

const RECIPES: Record<SfxName, Recipe> = {
  tick: { wave: 'square', notes: [1200], seconds: 0.03 },
  hit: { wave: 'sine', notes: [660, 880], seconds: 0.08 },
  miss: { wave: 'triangle', notes: [220, 165], seconds: 0.12 },
  reveal: { wave: 'sine', notes: [523, 659, 784], seconds: 0.06 },
  win: { wave: 'sine', notes: [523, 659, 784, 1047], seconds: 0.1 },
  clang: { wave: 'square', notes: [180, 270], seconds: 0.15, chord: true },
};

const PEAK_GAIN = 0.2;
const FLOOR_GAIN = 0.001;

function safeResume(ctx: AudioContextLike): void {
  try {
    void ctx.resume().catch(() => undefined);
  } catch {
    // Sin reanudar: el sonido se pierde, nunca rompe la partida.
  }
}

function schedule(ctx: AudioContextLike, recipe: Recipe): void {
  const start = ctx.currentTime;
  recipe.notes.forEach((frequency, index) => {
    const at = recipe.chord ? start : start + index * recipe.seconds;
    const end = at + recipe.seconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = recipe.wave;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(PEAK_GAIN, at);
    gain.gain.exponentialRampToValueAtTime(FLOOR_GAIN, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(end);
  });
}

export function createSfx(deps: SfxDeps): Sfx {
  const listeners = new Set<() => void>();
  let context: AudioContextLike | null = null;
  let enabled = false;
  try {
    enabled = deps.storage?.getItem(SFX_STORAGE_KEY) === 'on';
  } catch {
    enabled = false;
  }

  /** Crea el contexto una sola vez y lo reanuda. Solo se llama con el sonido activado. */
  function ensureContext(): AudioContextLike | null {
    if (context) {
      if (context.state === 'suspended') safeResume(context);
      return context;
    }
    try {
      context = deps.createContext();
    } catch {
      context = null;
    }
    if (context) safeResume(context);
    return context;
  }

  return {
    isEnabled: () => enabled,
    setEnabled(on) {
      if (on) ensureContext();
      if (on === enabled) return;
      enabled = on;
      try {
        deps.storage?.setItem(SFX_STORAGE_KEY, on ? 'on' : 'off');
      } catch {
        // Sin almacenamiento (modo privado): la preferencia dura lo que la pestaña.
      }
      listeners.forEach((listener) => listener());
    },
    play(name) {
      if (!enabled) return;
      const ctx = ensureContext();
      // Suspendido por falta de interacción: este sonido se pierde sin error.
      if (!ctx || ctx.state !== 'running') return;
      try {
        schedule(ctx, RECIPES[name]);
      } catch {
        // Un fallo de Web Audio nunca rompe la pantalla de juego.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function browserSfxDeps(): SfxDeps {
  if (typeof window === 'undefined') return { createContext: () => null, storage: null };
  let storage: SfxDeps['storage'] = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    storage,
    createContext() {
      const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor: typeof AudioContext | undefined = window.AudioContext ?? legacy.webkitAudioContext;
      if (!Ctor) return null;
      const ctx: AudioContextLike = new Ctor();
      return ctx;
    },
  };
}

export const sfx = createSfx(browserSfxDeps());

/** Estado del sonido para React; en el servidor siempre está apagado. */
export function useSfxEnabled(): [boolean, (on: boolean) => void] {
  const enabled = useSyncExternalStore(sfx.subscribe, sfx.isEnabled, () => false);
  return [enabled, sfx.setEnabled];
}
