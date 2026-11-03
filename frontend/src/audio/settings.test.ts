import { describe, expect, it } from 'vitest';
import {
  AUDIO_STORAGE_KEY,
  DEFAULT_SETTINGS,
  LEGACY_SFX_KEY,
  loadSettings,
  migrateLegacy,
  saveSettings,
  stepGain,
  type StorageLike,
} from './settings';

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

describe('ajustes de audio', () => {
  it('por defecto está silenciado y con todos los volúmenes a 75', () => {
    expect(DEFAULT_SETTINGS).toEqual({ muted: true, master: 75, music: 75, sfx: 75, ui: 75 });
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('guarda y vuelve a leer; descarta valores fuera de los pasos', () => {
    const storage = memoryStorage();
    saveSettings(storage, { muted: false, master: 100, music: 0, sfx: 50, ui: 25 });
    expect(loadSettings(storage)).toEqual({ muted: false, master: 100, music: 0, sfx: 50, ui: 25 });
    storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ muted: false, master: 33, music: 'x' }));
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, muted: false });
    storage.setItem(AUDIO_STORAGE_KEY, '{no es json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("migrateLegacy con 'on' activa el sonido una sola vez y borra la clave antigua", () => {
    const storage = memoryStorage({ [LEGACY_SFX_KEY]: 'on' });
    migrateLegacy(storage);
    expect(storage.data.has(LEGACY_SFX_KEY)).toBe(false);
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, muted: false });
    // El usuario lo silencia y, aunque el módulo viejo vuelva a escribir 'on', no se re-migra.
    saveSettings(storage, { ...DEFAULT_SETTINGS, muted: true });
    storage.setItem(LEGACY_SFX_KEY, 'on');
    migrateLegacy(storage);
    expect(loadSettings(storage).muted).toBe(true);
  });

  it("migrateLegacy con 'off' o sin clave deja los valores por defecto", () => {
    const off = memoryStorage({ [LEGACY_SFX_KEY]: 'off' });
    migrateLegacy(off);
    expect(off.data.has(LEGACY_SFX_KEY)).toBe(false);
    expect(loadSettings(off)).toEqual(DEFAULT_SETTINGS);
    const empty = memoryStorage();
    migrateLegacy(empty);
    expect(empty.data.size).toBe(0);
  });

  it('un storage que lanza da los valores por defecto sin excepción', () => {
    expect(() => migrateLegacy(throwing)).not.toThrow();
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => migrateLegacy(null)).not.toThrow();
  });

  it('stepGain es cuadrática', () => {
    expect(stepGain(0)).toBe(0);
    expect(stepGain(100)).toBe(1);
    expect(stepGain(50)).toBe(0.25);
    expect(stepGain(75)).toBeCloseTo(0.5625, 6);
  });
});
