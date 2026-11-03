/**
 * Ajustes de audio del jugador (spec §8): silencio y cuatro volúmenes en pasos de 25. Apagado por
 * defecto en la primera visita. Viven en `localStorage`; toda lectura y escritura va en try/catch
 * para que el modo privado o un almacenamiento bloqueado nunca rompan la pantalla.
 */

export type Step = 0 | 25 | 50 | 75 | 100;

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

export const AUDIO_STORAGE_KEY = 'pokemon-universe-audio';
/** Clave del sonido antiguo (`lib/sfx.ts`): `'on'` u `'off'`. */
export const LEGACY_SFX_KEY = 'pokemon-universe-sfx';

export const STEPS: readonly Step[] = [0, 25, 50, 75, 100];

export const DEFAULT_SETTINGS: AudioSettings = Object.freeze({ muted: true, master: 75, music: 75, sfx: 75, ui: 75 });

const VOLUME_KEYS = ['master', 'music', 'sfx', 'ui'] as const;

function isStep(x: unknown): x is Step {
  return typeof x === 'number' && (STEPS as readonly number[]).includes(x);
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

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function loadSettings(storage: StorageLike | null): AudioSettings {
  const raw = read(storage, AUDIO_STORAGE_KEY);
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike | null, s: AudioSettings): void {
  try {
    storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento: los ajustes duran lo que la pestaña.
  }
}

/**
 * Migra la clave antigua: solo si aún no hay ajustes nuevos, `'on'` activa el sonido con los
 * volúmenes por defecto. La clave antigua se borra siempre, para que no vuelva a migrarse.
 */
export function migrateLegacy(storage: StorageLike | null): void {
  const legacy = read(storage, LEGACY_SFX_KEY);
  if (legacy === null) return;
  if (read(storage, AUDIO_STORAGE_KEY) === null && legacy === 'on') saveSettings(storage, { ...DEFAULT_SETTINGS, muted: false });
  try {
    storage?.removeItem(LEGACY_SFX_KEY);
  } catch {
    // Si no se puede borrar, la próxima visita ya tiene ajustes nuevos y no se re-migra.
  }
}
