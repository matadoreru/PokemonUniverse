import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RevealCutIn, revealCutInClassName } from './RevealCutIn';

describe('RevealCutIn', () => {
  it('uses the enter animation only without reduced motion', () => {
    const animated = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'electric', title: '¡Acierto exacto!', reducedMotion: false }));
    expect(animated).toContain('reveal-cut-in-enter');
    expect(animated).toContain('reveal-cut-in-electric');
    const reduced = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'electric', title: '¡Acierto exacto!', reducedMotion: true }));
    expect(reduced).not.toContain('reveal-cut-in-enter');
    expect(reduced).toContain('reveal-cut-in-electric');
    expect(reduced).toContain('data-motion="reduced"');
  });

  it('is a non-blocking status layer', () => {
    const markup = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'berry', title: 'Eliminado', subtitle: 'Ash', reducedMotion: false }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain('data-layer');
    expect(markup).toContain('Ash');
  });

  it('renders the delayed line with the 1 s delay class', () => {
    const markup = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'aqua', title: 'Era…', delayedLine: '…inocente', reducedMotion: false }));
    expect(markup).toMatch(/class="[^"]*motion-delay-1s[^"]*"[^>]*>…inocente/);
  });

  it('builds the class name from the tone and the motion preference', () => {
    expect(revealCutInClassName('leaf', false)).toBe('reveal-cut-in reveal-cut-in-leaf reveal-cut-in-enter');
    expect(revealCutInClassName('leaf', true)).toBe('reveal-cut-in reveal-cut-in-leaf');
  });
});
