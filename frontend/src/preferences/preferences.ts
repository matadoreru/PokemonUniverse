/**
 * Ajustes del jugador (E8): sonido, movimiento y tamaño del texto en una sola clave de `localStorage`. Cada sección se
 * valida campo a campo (lo que no vale vuelve al valor por defecto) y toda lectura y escritura va en try/catch, para que
 * el modo privado o un almacenamiento bloqueado nunca rompan la pantalla. El audio y la pantalla escriben cada uno su
 * sección leyendo antes la clave entera, así ninguno pisa lo del otro.
 */
import { AUDIO_STORAGE_KEY, DEFAULT_SETTINGS, LEGACY_SFX_KEY, sanitizeSettings, type AudioSettings, type StorageLike } from '../audio/settings';

/** Movimiento: el del sistema operativo, siempre reducido o siempre completo. */
export type MotionPreference = 'system' | 'reduce' | 'full';
/** Tamaño del texto: 100 %, 112,5 % y 125 % de la letra raíz. */
export type TextPreference = 'normal' | 'large' | 'xlarge';

export interface Preferences {
  audio: AudioSettings;
  motion: MotionPreference;
  text: TextPreference;
}

export const PREFERENCES_KEY = 'pokemon-universe-preferences';

export const MOTION_PREFERENCES: readonly MotionPreference[] = ['system', 'reduce', 'full'];
export const TEXT_PREFERENCES: readonly TextPreference[] = ['normal', 'large', 'xlarge'];
/** Letra raíz de cada tamaño (la aplica `:root[data-text]` en tokens.css). */
export const TEXT_SCALE: Readonly<Record<TextPreference, number>> = { normal: 1, large: 1.125, xlarge: 1.25 };

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({ audio: DEFAULT_SETTINGS, motion: 'system', text: 'normal' });

function oneOf<T extends string>(values: readonly T[], x: unknown, fallback: T): T {
  return typeof x === 'string' && (values as readonly string[]).includes(x) ? x as T : fallback;
}

/** Normaliza un objeto cualquiera: cada sección por separado, como `sanitizeSettings` con el audio. */
export function sanitizePreferences(raw: unknown): Preferences {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    audio: sanitizeSettings(src.audio),
    motion: oneOf(MOTION_PREFERENCES, src.motion, DEFAULT_PREFERENCES.motion),
    text: oneOf(TEXT_PREFERENCES, src.text, DEFAULT_PREFERENCES.text),
  };
}

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function remove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Si no se puede borrar, la clave nueva ya existe y no se vuelve a migrar.
  }
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadPreferences(storage: StorageLike | null): Preferences {
  return sanitizePreferences(parse(read(storage, PREFERENCES_KEY)));
}

export function savePreferences(storage: StorageLike | null, prefs: Preferences): void {
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento: los ajustes duran lo que la pestaña.
  }
}

/** Cambia una o más secciones y conserva las demás tal como están guardadas. */
export function updatePreferences(storage: StorageLike | null, patch: Partial<Preferences>): Preferences {
  const next = sanitizePreferences({ ...loadPreferences(storage), ...patch });
  savePreferences(storage, next);
  return next;
}

/**
 * Migra las claves antiguas a la nueva sin perder lo guardado, solo si aún no hay clave nueva: primero los ajustes de
 * audio (`pokemon-universe-audio`) y, si no los hay, el sonido de antes (`'on'` activa el sonido con los volúmenes por
 * defecto). Las claves antiguas se borran siempre, para que no vuelvan a migrarse.
 */
export function migratePreferences(storage: StorageLike | null): void {
  const audio = read(storage, AUDIO_STORAGE_KEY);
  const legacy = read(storage, LEGACY_SFX_KEY);
  if (audio === null && legacy === null) return;
  if (read(storage, PREFERENCES_KEY) === null) {
    const settings = audio !== null ? sanitizeSettings(parse(audio)) : { ...DEFAULT_SETTINGS, muted: legacy !== 'on' };
    savePreferences(storage, { ...DEFAULT_PREFERENCES, audio: settings });
  }
  remove(storage, AUDIO_STORAGE_KEY);
  remove(storage, LEGACY_SFX_KEY);
}

/** Lo que el audio guarda: su sección de la clave común. */
export function loadSettings(storage: StorageLike | null): AudioSettings {
  return loadPreferences(storage).audio;
}

export function saveSettings(storage: StorageLike | null, settings: AudioSettings): void {
  updatePreferences(storage, { audio: settings });
}
