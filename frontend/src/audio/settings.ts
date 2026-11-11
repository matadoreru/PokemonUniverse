/**
 * Ajustes de audio del jugador (spec §8): silencio y cuatro volúmenes de 0 a 100 en pasos de 5. Apagado por
 * defecto en la primera visita. Se guardan en la sección `audio` de los ajustes del jugador (`preferences/preferences.ts`),
 * que valida con `sanitizeSettings`.
 */

/** Volumen de 0 a 100, en múltiplos de `VOLUME_STEP` (los ajustes antiguos en pasos de 25 siguen valiendo). */
export type Step = number;

export interface AudioSettings {
  muted: boolean;
  master: Step;
  music: Step;
  sfx: Step;
  ui: Step;
}

/** Lo que el audio necesita de `localStorage`. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Clave antigua de los ajustes de audio: ahora viven en la sección `audio` de los ajustes (`preferences/preferences.ts`). */
export const AUDIO_STORAGE_KEY = 'pokemon-universe-audio';
/** Clave del sonido antiguo (el módulo de sonido anterior): `'on'` u `'off'`. */
export const LEGACY_SFX_KEY = 'pokemon-universe-sfx';

/** Paso de los deslizadores de volumen. */
export const VOLUME_STEP = 5;

export const DEFAULT_SETTINGS: AudioSettings = Object.freeze({ muted: true, master: 75, music: 75, sfx: 75, ui: 75 });

const VOLUME_KEYS = ['master', 'music', 'sfx', 'ui'] as const;

function isStep(x: unknown): x is Step {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100 && x % VOLUME_STEP === 0;
}

/** Curva cuadrática: 50 suena a la mitad percibida, no a la mitad de amplitud. */
export function stepGain(step: Step): number {
  return (step / 100) ** 2;
}

/** Normaliza un objeto cualquiera campo a campo; lo que no sea válido vuelve al valor por defecto. */
export function sanitizeSettings(raw: unknown): AudioSettings {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: AudioSettings = { ...DEFAULT_SETTINGS };
  if (typeof src.muted === 'boolean') out.muted = src.muted;
  for (const k of VOLUME_KEYS) {
    const v = src[k];
    if (isStep(v)) out[k] = v;
  }
  return out;
}
