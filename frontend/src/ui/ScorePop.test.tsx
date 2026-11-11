import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScorePop, scorePopLabel } from './ScorePop';

const classes = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ').map((c) => c.replace(/^_/, '').replace(/_[0-9a-z]+$/i, ''));

describe('ScorePop', () => {
  it('pone el signo más delante de los puntos', () => {
    expect(scorePopLabel(0)).toBe('+0');
    expect(scorePopLabel(4)).toBe('+4');
  });

  it('anima solo sin reducción de movimiento, lleva el color y es decorativo', () => {
    const animated = renderToStaticMarkup(createElement(ScorePop, { points: 3, color: 'var(--ok)', reducedMotion: false }));
    expect(classes(animated)).toEqual(expect.arrayContaining(['pop', 'anim']));
    expect(animated).toContain('--player:var(--ok)');
    expect(animated).toContain('aria-hidden="true"');
    expect(animated).toContain('data-testid="score-pop"');
    expect(animated).toContain('+3');
    expect(classes(renderToStaticMarkup(createElement(ScorePop, { points: 3, reducedMotion: true })))).not.toContain('anim');
  });

  it('con `placement="before"` flota a la izquierda de la cifra', () => {
    expect(classes(renderToStaticMarkup(createElement(ScorePop, { points: 1, placement: 'before', reducedMotion: true })))).toContain('before');
    expect(classes(renderToStaticMarkup(createElement(ScorePop, { points: 1, reducedMotion: true })))).not.toContain('before');
  });
});
