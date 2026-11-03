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

  it('keeps the delayed line out of the DOM (and the live region) until the 1 s pause ends', () => {
    const markup = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'aqua', title: 'Ana', delayedLine: '…era inocente', reducedMotion: false }));
    expect(markup).toContain('Ana');
    expect(markup).not.toContain('…era inocente');
  });

  it('renders the delayed line at once with reduced motion', () => {
    const markup = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'aqua', title: 'Ana', delayedLine: '…era inocente', reducedMotion: true }));
    expect(markup).toContain('…era inocente');
  });

  it('switches to the delayed tone only together with the delayed line', () => {
    const before = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'electric', delayedTone: 'berry', title: 'Ana', delayedLine: '…era impostor', reducedMotion: false }));
    expect(before).toContain('reveal-cut-in-electric');
    expect(before).not.toContain('berry');
    const reduced = renderToStaticMarkup(createElement(RevealCutIn, { tone: 'electric', delayedTone: 'berry', title: 'Ana', delayedLine: '…era impostor', reducedMotion: true }));
    expect(reduced).toContain('reveal-cut-in-berry');
  });

  it('builds the class name from the tone and the motion preference', () => {
    expect(revealCutInClassName('leaf', false)).toBe('reveal-cut-in reveal-cut-in-leaf reveal-cut-in-enter');
    expect(revealCutInClassName('leaf', true)).toBe('reveal-cut-in reveal-cut-in-leaf');
  });
});
