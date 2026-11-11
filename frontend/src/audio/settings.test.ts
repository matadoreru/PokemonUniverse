import { describe, expect, it } from 'vitest';
import { loadSettings } from '../preferences/preferences';
import { DEFAULT_SETTINGS, sanitizeSettings, stepGain, type StorageLike } from './settings';

const memoryStorage = (): StorageLike => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });

describe('ajustes de audio', () => {
  it('por defecto está silenciado y con todos los volúmenes a 75', () => {
    expect(DEFAULT_SETTINGS).toEqual({ muted: true, master: 75, music: 75, sfx: 75, ui: 75 });
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('stepGain es cuadrática', () => {
    expect(stepGain(0)).toBe(0);
    expect(stepGain(100)).toBe(1);
    expect(stepGain(50)).toBe(0.25);
    expect(stepGain(75)).toBeCloseTo(0.5625, 6);
  });

  it('acepta volúmenes en pasos de 5 y descarta los que no lo son', () => {
    expect(sanitizeSettings({ master: 35, music: 5, sfx: 100, ui: 0 })).toMatchObject({ master: 35, music: 5, sfx: 100, ui: 0 });
    expect(sanitizeSettings({ master: 33, music: -5, sfx: 105, ui: 12.5 })).toMatchObject({ master: 75, music: 75, sfx: 75, ui: 75 });
  });
});
