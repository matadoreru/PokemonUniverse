import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HigherLowerBars } from './HigherLowerBars';

describe('HigherLowerBars', () => {
  it('compares both values on the same scale with the catalogue Bar that grows on mount', () => {
    const html = renderToStaticMarkup(<HigherLowerBars category="HP" previous={{ name: 'Pidgey', value: 40 }} current={{ name: 'Onix', value: 80 }} />);
    expect(html).toContain('data-testid="higher-lower-bars"');
    expect(html).toContain('aria-label="Comparación de HP"');
    expect(html).toContain('--ratio:0.5');
    expect(html).toContain('--ratio:1');
    expect(html.match(/class="[^"]*grow/g)).toHaveLength(2);
    expect(html).toMatch(/data-bar="previous"/);
    expect(html).toMatch(/data-bar="current"/);
    // El valor y la diferencia van escritos: las barras son decorativas.
    expect(html).toContain('>+40<');
    expect(html).toContain('<span class="sr-only">Diferencia </span>');
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('>40<');
    expect(html).toContain('>80<');
  });
  it('handles a tie at zero without dividing by zero', () => {
    const html = renderToStaticMarkup(<HigherLowerBars previous={{ name: 'Pidgey', value: 0 }} current={{ name: 'Onix', value: 0 }} />);
    expect(html.match(/--ratio:0[;"]/g)).toHaveLength(2);
    expect(html).not.toContain('NaN');
    expect(html).toContain('>=<');
  });
  it('writes the negative difference with a real minus sign', () => {
    const html = renderToStaticMarkup(<HigherLowerBars previous={{ name: 'Onix', value: 80 }} current={{ name: 'Pidgey', value: 68 }} />);
    expect(html).toContain('>−12<');
  });
});
