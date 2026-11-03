import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TypeDuelVersus } from './TypeDuelVersus';

const duelists = [{ id: 'p1', name: 'Ana', type: 'bug' as const }, { id: 'p2', name: 'Bruno', type: 'fighting' as const }] as const;

describe('TypeDuelVersus', () => {
  it('enters each duelist from its side with a bumping VS and the solution count below', () => {
    const html = renderToStaticMarkup(<TypeDuelVersus duelists={duelists} requiredTypes={['bug', 'fighting']} solutionCount={1} />);
    expect(html).toMatch(/motion-enter-left[^>]*>.*Ana/);
    expect(html).toMatch(/motion-enter-right[^>]*>.*Bruno/);
    expect(html).toMatch(/class="[^"]*font-display[^"]*text-4xl[^"]*motion-bump[^"]*"[^>]*>VS</);
    expect(html).toContain('1 Pokémon tiene esta combinación');
    expect(html).toContain('Objetivo exacto');
  });
  it('hides the count when the server does not publish it', () => {
    const html = renderToStaticMarkup(<TypeDuelVersus duelists={duelists} requiredTypes={['bug', 'fighting']} solutionCount={null} />);
    expect(html).not.toContain('esta combinación');
  });
});
