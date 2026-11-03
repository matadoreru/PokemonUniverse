import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScorePop, scorePopLabel } from './ScorePop';

describe('ScorePop', () => {
  it('labels the points with a plus sign', () => {
    expect(scorePopLabel(0)).toBe('+0');
    expect(scorePopLabel(4)).toBe('+4');
  });

  it('animates only without reduced motion and stays hidden from assistive tech', () => {
    const animated = renderToStaticMarkup(createElement(ScorePop, { points: 3, tone: 'leaf', reducedMotion: false }));
    expect(animated).toContain('score-pop-anim');
    expect(animated).toContain('aria-hidden="true"');
    expect(animated).toContain('+3');
    const reduced = renderToStaticMarkup(createElement(ScorePop, { points: 3, reducedMotion: true }));
    expect(reduced).not.toContain('score-pop-anim');
    expect(reduced).toContain('score-pop');
  });
});
