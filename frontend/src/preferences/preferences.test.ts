import { describe, expect, it } from 'vitest';
import { AUDIO_STORAGE_KEY, DEFAULT_SETTINGS, LEGACY_SFX_KEY, type StorageLike } from '../audio/settings';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  loadSettings,
  migratePreferences,
  PREFERENCES_KEY,
  sanitizePreferences,
  saveSettings,
  updatePreferences,
} from './preferences';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const throwing: StorageLike = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); },
};

describe('ajustes del jugador', () => {
  it('por defecto: sonido apagado, movimiento del sistema y texto normal', () => {
    expect(loadPreferences(memoryStorage())).toEqual({ audio: DEFAULT_SETTINGS, motion: 'system', text: 'normal' });
    expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it('valida cada sección por separado: lo que no vale vuelve al valor por defecto', () => {
    expect(sanitizePreferences({ audio: { muted: false, master: 33 }, motion: 'reduce', text: 'enorme' }))
      .toEqual({ audio: { ...DEFAULT_SETTINGS, muted: false }, motion: 'reduce', text: 'normal' });
    expect(sanitizePreferences({ motion: 3, text: 'xlarge' })).toEqual({ ...DEFAULT_PREFERENCES, text: 'xlarge' });
    expect(sanitizePreferences('nada')).toEqual(DEFAULT_PREFERENCES);
    const storage = memoryStorage({ [PREFERENCES_KEY]: '{no es json' });
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it('el audio y la pantalla escriben su sección sin pisar la otra', () => {
    const storage = memoryStorage();
    updatePreferences(storage, { motion: 'full', text: 'large' });
    saveSettings(storage, { muted: false, master: 100, music: 0, sfx: 50, ui: 25 });
    expect(loadPreferences(storage)).toEqual({ audio: { muted: false, master: 100, music: 0, sfx: 50, ui: 25 }, motion: 'full', text: 'large' });
    updatePreferences(storage, { text: 'xlarge' });
    expect(loadSettings(storage)).toEqual({ muted: false, master: 100, music: 0, sfx: 50, ui: 25 });
    expect([...storage.data.keys()]).toEqual([PREFERENCES_KEY]);
  });

  it('migra la clave de audio antigua sin perder lo guardado y la borra', () => {
    const audio = { muted: false, master: 40, music: 10, sfx: 55, ui: 0 };
    const storage = memoryStorage({ [AUDIO_STORAGE_KEY]: JSON.stringify(audio), [LEGACY_SFX_KEY]: 'off' });
    migratePreferences(storage);
    expect(loadPreferences(storage)).toEqual({ ...DEFAULT_PREFERENCES, audio });
    expect(storage.data.has(AUDIO_STORAGE_KEY)).toBe(false);
    expect(storage.data.has(LEGACY_SFX_KEY)).toBe(false);
  });

  it('la clave nueva manda: una antigua que reaparece no la pisa', () => {
    const storage = memoryStorage();
    updatePreferences(storage, { motion: 'reduce' });
    storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, muted: false }));
    storage.setItem(LEGACY_SFX_KEY, 'on');
    migratePreferences(storage);
    expect(loadPreferences(storage)).toEqual({ ...DEFAULT_PREFERENCES, motion: 'reduce' });
    expect(storage.data.size).toBe(1);
  });

  it("el sonido de antes: 'on' lo activa con los volúmenes por defecto; 'off' o nada, apagado", () => {
    const on = memoryStorage({ [LEGACY_SFX_KEY]: 'on' });
    migratePreferences(on);
    expect(loadSettings(on)).toEqual({ ...DEFAULT_SETTINGS, muted: false });
    const off = memoryStorage({ [LEGACY_SFX_KEY]: 'off' });
    migratePreferences(off);
    expect(loadSettings(off)).toEqual(DEFAULT_SETTINGS);
    expect(off.data.has(LEGACY_SFX_KEY)).toBe(false);
    const empty = memoryStorage();
    migratePreferences(empty);
    expect(empty.data.size).toBe(0);
  });

  it('un almacenamiento que lanza da los valores por defecto sin excepción', () => {
    expect(() => migratePreferences(throwing)).not.toThrow();
    expect(loadPreferences(throwing)).toEqual(DEFAULT_PREFERENCES);
    expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => updatePreferences(throwing, { text: 'large' })).not.toThrow();
    expect(() => migratePreferences(null)).not.toThrow();
  });
});
