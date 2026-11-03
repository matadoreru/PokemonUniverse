import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HigherLowerBars } from './HigherLowerBars';

describe('HigherLowerBars', () => {
  it('scales each bar on its wrapper, grows the fill and paints the leader in leaf', () => {
    const html = renderToStaticMarkup(<HigherLowerBars previous={{ name: 'Pidgey', value: 40 }} current={{ name: 'Onix', value: 80 }} />);
    expect(html).toContain('transform:scaleX(0.5)');
    expect(html).toContain('transform:scaleX(1)');
    expect(html.match(/motion-grow-x/g)).toHaveLength(2);
    expect(html).toMatch(/motion-grow-x bg-ink\/30/);
    expect(html).toMatch(/motion-grow-x bg-leaf/);
    expect(html).toContain('>+40<');
    expect(html).toContain('<span class="sr-only">Diferencia </span>');
    expect(html).not.toContain('aria-label');
  });
  it('paints both bars electric on a tie and never divides by zero', () => {
    const html = renderToStaticMarkup(<HigherLowerBars previous={{ name: 'Pidgey', value: 0 }} current={{ name: 'Onix', value: 0 }} />);
    expect(html.match(/motion-grow-x bg-electric/g)).toHaveLength(2);
    expect(html).toContain('transform:scaleX(0)');
    expect(html).not.toContain('NaN');
    expect(html).toContain('>=<');
  });
});
