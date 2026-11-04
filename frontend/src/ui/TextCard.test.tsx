import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextCard } from './TextCard';

describe('TextCard', () => {
  it('con onSelect es un conmutador con aria-pressed y nombre accesible; el texto entero', () => {
    const html = renderToStaticMarkup(<TextCard name="Respuesta 1" text="Un texto muy largo que no se recorta nunca." ariaLabel="Respuesta 1" selected onSelect={() => undefined} />);
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Respuesta 1"');
    expect(html).toContain('Un texto muy largo que no se recorta nunca.');
  });

  it('sin onSelect es una caja fija, sin aria-pressed; la imagen es decorativa', () => {
    const html = renderToStaticMarkup(<TextCard name="Aqua" media={<img src="/a.png" alt="" />} detail="Eres tú">nota</TextCard>);
    expect(html).toMatch(/<div class=/);
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Eres tú');
    expect(html).toContain('nota');
  });
});
