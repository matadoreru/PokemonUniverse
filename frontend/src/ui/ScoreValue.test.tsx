import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { nextScoreState, ScoreValue, scoreValuePops, type ScoreValueState } from './ScoreValue';

const mounted: ScoreValueState = { value: 3, changes: 0, delta: 0 };

describe('ScoreValue', () => {
  it('al montar no rebota ni lanza el «+N», también con `self`', () => {
    const html = renderToStaticMarkup(createElement(ScoreValue, { value: 3, self: true, 'data-testid': 'guess-score' }, createElement('small', null, ' pts')));
    expect(html).toContain('data-testid="guess-score"');
    expect(html).toContain('3');
    expect(html).toContain('<small> pts</small>');
    expect(html).not.toContain('motion-bump');
    expect(html).not.toContain('score-pop');
    expect(scoreValuePops(mounted, true)).toBe(false);
  });

  it('cuenta un cambio solo si el valor es otro, con su diferencia', () => {
    expect(nextScoreState(mounted, 3)).toBe(mounted);
    const up = nextScoreState(mounted, 7);
    expect(up).toEqual({ value: 7, changes: 1, delta: 4 });
    expect(nextScoreState(up, 0)).toEqual({ value: 0, changes: 2, delta: -7 });
  });

  it('el «+N» sale solo al subir y solo para el propio jugador', () => {
    const up = nextScoreState(mounted, 5);
    expect(scoreValuePops(up, true)).toBe(true);
    expect(scoreValuePops(up, false)).toBe(false);
    expect(scoreValuePops(nextScoreState(up, 0), true)).toBe(false);
  });
});
