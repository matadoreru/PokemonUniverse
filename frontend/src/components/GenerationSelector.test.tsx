import { GENERATIONS } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenerationSelector, toggleGeneration } from './GenerationSelector';

const render = (selected: number[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(GenerationSelector, { selected, onChange: () => undefined, ...extra }));

describe('GenerationSelector', () => {
  it('una píldora conmutadora del catálogo por generación, con `aria-pressed` y el nombre «Gen N»', () => {
    const markup = render([1, 3]);
    const buttons = markup.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(GENERATIONS.length);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(GENERATIONS.length - 2);
    for (const generation of GENERATIONS) expect(markup).toContain(`>Gen ${generation}</span>`);
    // Elegida: además del color, el ✓ (icono de lucide).
    expect(markup.match(/lucide-check/g)).toHaveLength(2);
  });

  it('un grupo con su etiqueta y la ayuda como descripción; sin clases heredadas', () => {
    const markup = render([1], { label: 'Generaciones del pool', description: 'Solo estas generaciones.' });
    expect(markup).toMatch(/role="group" aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
    expect(markup).toContain('Generaciones del pool');
    expect(markup).toContain('Solo estas generaciones.');
    expect(markup).not.toMatch(/class="[^"]*\b(label|bg-aqua|bg-electric|text-night|border-aqua)\b/);
  });

  it('añade y quita ordenando, y nunca deja la selección vacía', () => {
    expect(toggleGeneration([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleGeneration([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleGeneration([4], 4)).toBeNull();
  });

  it('acepta `accent` por compatibilidad (la elegida es siempre amarilla con ✓)', () => {
    expect(render([1], { accent: 'electric' })).toBe(render([1]));
  });
});
