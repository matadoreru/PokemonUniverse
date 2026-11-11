import { CheckCircle2 } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionPlate } from './ActionPlate';

const base = { titleId: 'x-plate-title', icon: CheckCircle2, tone: 'ok' as const, kicker: 'Acertado', title: '¡Era Pikachu!' };

describe('ActionPlate', () => {
  it('es una sección con nombre: el h2 con su id, enfocable por programa', () => {
    const html = renderToStaticMarkup(createElement(ActionPlate, base));
    expect(html).toMatch(/^<section[^>]*aria-labelledby="x-plate-title"/);
    expect(html).toContain('<h2 id="x-plate-title" tabindex="-1"');
    expect(html).toMatch(/class="[^"]*tone_ok/);
  });

  it('sin ayuda ni aside ni cuerpo no deja cajas vacías', () => {
    const html = renderToStaticMarkup(createElement(ActionPlate, { ...base, body: false }));
    expect(html).not.toMatch(/<p[ >]/);
    expect(html).not.toMatch(/class="[^"]*_aside_/);
    expect(html).not.toMatch(/class="[^"]*_search_/);
  });

  it('pone los ganchos data-* en la fila y el aside, y la caja del buscador con `search`', () => {
    const html = renderToStaticMarkup(createElement(ActionPlate, {
      ...base, text: 'Ayuda', aside: '+3', search: true, compact: true, body: 'campo',
      rowAttrs: { 'data-testid': 'fila', 'data-idle': undefined }, asideAttrs: { 'data-testid': 'lado' },
    }));
    expect(html).toMatch(/<div class="[^"]*_row_[^"]*" data-testid="fila">/);
    expect(html).not.toContain('data-idle');
    expect(html).toMatch(/_aside_[^"]*" data-testid="lado">\+3</);
    expect(html).toMatch(/<div class="[^"]*_search_[^"]*">campo<\/div>/);
    expect(html).toMatch(/class="[^"]*_plateSearch_/);
    expect(html).toMatch(/^<section class="[^"]*_compact_/);
    expect(html).toContain('Ayuda</p>');
  });
});
