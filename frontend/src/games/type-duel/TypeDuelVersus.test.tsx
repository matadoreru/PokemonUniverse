import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TypeDuelVersus } from './TypeDuelVersus';

const duelists = [{ id: 'p1', name: 'Ana', type: 'bug' as const }, { id: 'p2', name: 'Bruno', type: 'fighting' as const }] as const;

describe('TypeDuelVersus', () => {
  it('enters each duelist from its side with a bumping VS and the solution count below', () => {
    const html = renderToStaticMarkup(<TypeDuelVersus duelists={duelists} requiredTypes={['bug', 'fighting']} solutionCount={1} />);
    expect(html).toMatch(/motion-enter-left[^>]*>.*Ana.*data-type="bug"/);
    expect(html).toMatch(/motion-enter-right[^>]*>.*Bruno.*data-type="fighting"/);
    expect(html).toMatch(/class="[^"]*motion-bump[^"]*"><span class="ol">VS<\/span>/);
    expect(html).toContain('1 Pokémon tiene esta combinación');
    expect(html).toContain('Objetivo exacto');
    // Cada mitad de la losa lleva el tinte del tipo de su duelista.
    expect(html).toContain('--left-type:var(--type-bug)');
    expect(html).toContain('--right-type:var(--type-fighting)');
  });
  it('says Monotipo instead of repeating the badge when both picked the same type', () => {
    const same = [{ id: 'p1', name: 'Ana', type: 'fire' as const }, { id: 'p2', name: 'Bruno', type: 'fire' as const }] as const;
    const html = renderToStaticMarkup(<TypeDuelVersus duelists={same} requiredTypes={['fire']} solutionCount={36} />);
    expect(html).toContain('Monotipo');
    expect(html).not.toContain('Objetivo exacto');
    expect(html.match(/data-type="fire"/g)).toHaveLength(2);
    expect(html.match(/>Fuego</g)).toHaveLength(2);
  });
  it('hides the count when the server does not publish it', () => {
    const html = renderToStaticMarkup(<TypeDuelVersus duelists={duelists} requiredTypes={['bug', 'fighting']} solutionCount={null} />);
    expect(html).not.toContain('esta combinación');
  });
  it('marks an impossible combination and shows its notice instead of the count', () => {
    const html = renderToStaticMarkup(<TypeDuelVersus duelists={duelists} requiredTypes={null} solutionCount={null} impossible={<p>Sin Pokémon</p>} />);
    expect(html).toContain('data-state="impossible"');
    expect(html).toContain('Sin Pokémon');
  });
});
