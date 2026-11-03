import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AudioSettings } from '../audio';
import { AudioSettingsPanel, audioPatchFor } from './AudioSettingsDialog';

const on: AudioSettings = { muted: false, master: 75, music: 50, sfx: 25, ui: 100 };

function html(settings: AudioSettings): string {
  return renderToStaticMarkup(createElement(AudioSettingsPanel, { settings, onPatch: () => undefined, onTest: () => undefined }));
}

describe('AudioSettingsPanel', () => {
  it('draws the switch and the four volume groups with their value', () => {
    const out = html(on);
    expect(out).toMatch(/role="switch"[^>]*aria-checked="true"/);
    for (const name of ['Volumen general', 'Música', 'Efectos', 'Interfaz']) expect(out).toContain(`aria-label="${name}"`);
    // Cuatro grupos de cinco opciones; una marcada en cada uno.
    expect(out.match(/role="radio"/g)).toHaveLength(20);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(5);
    expect(out).toContain('Atajo: M');
    expect(out).toContain('Probar sonido');
  });

  it('shows the switch off and disables volumes and test while muted', () => {
    const out = html({ ...on, muted: true });
    expect(out).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(out.match(/role="radio"[^>]*disabled=""/g)).toHaveLength(20);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Probar sonido/);
  });
});

describe('audioPatchFor', () => {
  it('maps a changed segment to an audio.update patch', () => {
    expect(audioPatchFor('music', 100)).toEqual({ music: 100 });
    expect(audioPatchFor('master', 0)).toEqual({ master: 0 });
  });
});
