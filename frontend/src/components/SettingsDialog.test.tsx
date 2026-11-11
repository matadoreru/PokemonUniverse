import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AudioSettings } from '../audio';
import { AudioSettingsPanel, audioPatchFor, DisplaySettingsPanel } from './SettingsDialog';

const on: AudioSettings = { muted: false, master: 75, music: 50, sfx: 35, ui: 100 };

function html(settings: AudioSettings): string {
  return renderToStaticMarkup(createElement(AudioSettingsPanel, { settings, onPatch: () => undefined }));
}

describe('AudioSettingsPanel', () => {
  it('draws the switch and four volume sliders with their value', () => {
    const out = html(on);
    expect(out).toMatch(/role="switch"[^>]*aria-checked="true"/);
    for (const name of ['Volumen general', 'Música', 'Efectos', 'Interfaz']) expect(out).toContain(`>${name}</label>`);
    expect(out.match(/type="range"/g)).toHaveLength(4);
    expect(out.match(/step="5"/g)).toHaveLength(4);
    for (const value of ['75 %', '50 %', '35 %', '100 %']) expect(out).toContain(value);
    expect(out).not.toContain('Atajo');
    expect(out).not.toContain('Probar sonido');
  });

  it('shows the switch off and disables the sliders while muted', () => {
    const out = html({ ...on, muted: true });
    expect(out).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(out.match(/type="range"[^>]*disabled=""|disabled=""[^>]*type="range"/g)).toHaveLength(4);
  });
});

describe('audioPatchFor', () => {
  it('maps a changed slider to an audio.update patch', () => {
    expect(audioPatchFor('music', 100)).toEqual({ music: 100 });
    expect(audioPatchFor('master', 35)).toEqual({ master: 35 });
  });
});

describe('DisplaySettingsPanel', () => {
  it('draws Movimiento and Texto as radio groups with the current choice checked', () => {
    const out = renderToStaticMarkup(createElement(DisplaySettingsPanel, { preferences: { motion: 'reduce', text: 'xlarge' }, onPatch: () => undefined }));
    expect(out.match(/role="radiogroup"/g)).toHaveLength(2);
    for (const label of ['Movimiento', 'Texto', 'Sistema', 'Reducido', 'Completo', 'Normal', 'Grande', 'Muy grande']) expect(out).toContain(`>${label}<`);
    expect(out).toMatch(/aria-checked="true"[^>]*>Reducido</);
    expect(out).toMatch(/aria-checked="true"[^>]*>Muy grande</);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(2);
  });
});
