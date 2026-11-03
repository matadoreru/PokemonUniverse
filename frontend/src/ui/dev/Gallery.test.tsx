import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Gallery } from './Gallery';

describe('Gallery', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Gallery)));
  const sections = [...html.matchAll(/data-gallery-section="([^"]+)"/g)].map((m) => m[1]);
  const figures = [...html.matchAll(/<figure[^>]*data-gallery="([^"]+)"/g)].map((m) => m[1]);

  it('tiene al menos 15 secciones y 60 figuras', () => {
    expect(sections.length).toBeGreaterThanOrEqual(15);
    expect(figures.length).toBeGreaterThanOrEqual(60);
  });

  it('no repite secciones ni figuras', () => {
    expect(new Set(sections).size).toBe(sections.length);
    expect(figures.filter((id, i) => figures.indexOf(id) !== i)).toEqual([]);
  });

  it('cada figura lleva su pie', () => {
    expect(html.match(/<figcaption/g)?.length).toBe(figures.length);
  });

  it('muestra los 18 tipos y los 5 estados de carta', () => {
    expect(figures.filter((id) => id!.startsWith('typebadge-'))).toHaveLength(18);
    for (const state of ['idle', 'selected', 'correct', 'wrong', 'revealing']) expect(figures).toContain(`card-${state}`);
  });
});
