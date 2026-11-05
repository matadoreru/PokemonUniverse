/**
 * Audio de la aplicación (spec §8): el singleton `audio` con las dependencias del navegador, el
 * hook `useAudioSettings()` y los enganches globales (desbloqueo con el primer gesto y pausa con la
 * pestaña oculta). Al importarse en los tests (sin `window`) no toca el DOM ni crea
 * ningún `AudioContext`.
 */
import { useSyncExternalStore } from 'react';
import { createAudio, type Audio, type AudioContextLike, type AudioDeps, type AudioState } from './engine';
import { createMusicPlayer, renderTrack } from './music';
import { DEFAULT_SETTINGS, type AudioSettings, type StorageLike } from './settings';

export type { Audio, AudioState, MusicControl, MusicTrack } from './engine';
export type { SoundId, Channel } from './catalog';
export type { AudioSettings, Step } from './settings';

declare global {
  interface Window {
    /** Solo en desarrollo: estado del audio para los E2E. */
    __puAudio?: { state(): AudioState };
  }
}

function browserDeps(): AudioDeps {
  if (typeof window === 'undefined') return { createContext: () => null, storage: null, now: () => 0 };
  let storage: StorageLike | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    storage,
    now: () => performance.now(),
    document,
    hasActivation: () => (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive !== false,
    createContext() {
      const legacy = window as Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor: typeof AudioContext | undefined = window.AudioContext ?? legacy.webkitAudioContext;
      if (!Ctor) return null;
      const ctx: AudioContextLike = new Ctor();
      return ctx;
    },
    // Se llama al desbloquear, cuando `audio` ya existe: el reproductor sigue el silencio de los ajustes.
    createMusic: (ctx, out, cfg) => createMusicPlayer(ctx, out, cfg, {
      render: renderTrack,
      isMuted: () => audio.settings().muted,
      subscribe: (fn) => audio.subscribe(fn),
      now: () => performance.now(),
      after: (ms, fn) => { window.setTimeout(fn, ms); },
    }),
  };
}

export const audio: Audio = createAudio(browserDeps());

/** Eventos de puntero que desbloquean el audio (además de `keydown`). */
export const UNLOCK_POINTER_EVENTS = ['pointerdown', 'pointerup', 'click'] as const;

/** Engancha el audio al documento; devuelve cómo soltarlo (tests y recargas en caliente). */
export function installAudio(a: Audio, doc: Document, win: Window): () => void {
  // Se escucha siempre: el primer gesto crea el contexto (si hay sonido) y los siguientes lo reanudan si quedó suspendido.
  const unlock = (): void => a.unlock();
  const onVisibility = (): void => a.setHidden(doc.hidden);
  // Un `pointerdown` táctil no da activación de usuario (solo `pointerup`/`click`): se escuchan todos y `unlock` es idempotente.
  for (const type of UNLOCK_POINTER_EVENTS) doc.addEventListener(type, unlock, { capture: true, passive: true });
  doc.addEventListener('keydown', unlock, { capture: true });
  doc.addEventListener('visibilitychange', onVisibility);
  if (import.meta.env.DEV) win.__puAudio = { state: () => a.state() };
  return () => {
    for (const type of UNLOCK_POINTER_EVENTS) doc.removeEventListener(type, unlock, { capture: true });
    doc.removeEventListener('keydown', unlock, { capture: true });
    doc.removeEventListener('visibilitychange', onVisibility);
    if (win.__puAudio) delete win.__puAudio;
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const dispose = installAudio(audio, document, window);
  import.meta.hot?.dispose(dispose);
}

const serverSnapshot = (): AudioSettings => DEFAULT_SETTINGS;

/** Ajustes de audio para React; cambian con `audio.update()`. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(audio.subscribe, audio.settings, serverSnapshot);
}
