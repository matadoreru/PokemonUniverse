import { describe, expect, it } from 'vitest';
import raw from '../data/sfx.json';
import { SOUND_IDS, SfxFileZ, loadSfx } from './catalog';
import { soundDuration } from './synth';

/** Copia mutable del JSON para construir variantes inválidas. */
function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}

describe('catálogo de sonidos (sfx.json)', () => {
  it('pasa el esquema SfxFileZ', () => {
    expect(SfxFileZ.safeParse(raw).success).toBe(true);
    expect(() => loadSfx()).not.toThrow();
  });

  it('define exactamente los 24 ids del catálogo', () => {
    const cfg = loadSfx();
    expect(SOUND_IDS).toHaveLength(24);
    expect(Object.keys(cfg.sounds).sort()).toEqual([...SOUND_IDS].sort());
  });

  it('la mezcla es música 0,55 · efectos 0,90 · interfaz 0,50, con 10 voces, 60 ms y ±35 cents / ±12 %', () => {
    const cfg = loadSfx();
    expect(cfg.mix).toEqual({ music: 0.55, sfx: 0.9, ui: 0.5 });
    expect(cfg.limits).toEqual({ maxVoices: 10, defaultCooldownMs: 60 });
    expect(cfg.variation).toEqual({ cents: 35, gain: 0.12 });
    expect(cfg.music).toEqual({ fadeOutSec: 0.4, fadeInSec: 0.7, duck: 0.3 });
  });

  it('cada efecto dura ≤ 0,8 s (victoria y podio ≤ 1,6 s) y ninguna voz pasa de ganancia 0,3', () => {
    const cfg = loadSfx();
    for (const id of SOUND_IDS) {
      const s = cfg.sounds[id];
      const max = id === 'game.win' || id === 'game.podium' ? 1.6 : 0.8;
      expect(soundDuration(s), id).toBeLessThanOrEqual(max);
      for (const v of s.voices) expect(v.gain, id).toBeLessThanOrEqual(0.3);
    }
  });

  it('los ui.* van al canal de interfaz y el resto al de efectos', () => {
    const cfg = loadSfx();
    for (const id of SOUND_IDS) expect(cfg.sounds[id].channel, id).toBe(id.startsWith('ui.') ? 'ui' : 'sfx');
  });

  it('rechaza un efecto que falte, uno desconocido, una voz tonal sin frecuencia y un arpegio sin paso', () => {
    const missing = clone();
    delete (missing.sounds as Record<string, unknown>)['ui.tap'];
    expect(SfxFileZ.safeParse(missing).success).toBe(false);

    const extra = clone();
    const extraSounds = extra.sounds as Record<string, unknown>;
    extraSounds['ui.save'] = extraSounds['ui.tap'];
    expect(SfxFileZ.safeParse(extra).success).toBe(false);

    const noFreq = clone();
    (noFreq.sounds as Record<string, unknown>)['ui.tap'] = { channel: 'ui', voices: [{ wave: 'square', gain: 0.2 }] };
    expect(SfxFileZ.safeParse(noFreq).success).toBe(false);

    const noStep = clone();
    (noStep.sounds as Record<string, unknown>)['ui.tap'] = { channel: 'ui', voices: [{ wave: 'square', notes: [440], gain: 0.2 }] };
    expect(SfxFileZ.safeParse(noStep).success).toBe(false);

    const loud = clone();
    loud.mix = { music: 1.5, sfx: 0.9, ui: 0.5 };
    expect(SfxFileZ.safeParse(loud).success).toBe(false);
  });
});
