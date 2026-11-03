import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SoundToggleButton } from './SoundToggle';

describe('SoundToggle', () => {
  it('offers to turn sound on while muted', () => {
    const html = renderToStaticMarkup(createElement(SoundToggleButton, { enabled: false, onToggle: () => undefined }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Activar sonido"');
    expect(html).toContain('class="icon-button"');
  });

  it('offers to mute while sound is on', () => {
    const html = renderToStaticMarkup(createElement(SoundToggleButton, { enabled: true, onToggle: () => undefined }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Silenciar sonido"');
  });
});
