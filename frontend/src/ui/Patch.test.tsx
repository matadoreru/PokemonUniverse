import { Sparkles } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HighlightCard, PatchHero, SectionRule, Timeline, TimelineLink } from './Patch';

describe('PatchHero', () => {
  it('lleva el ticket con la versión, el título como encabezado y el resumen solo si existe', () => {
    const markup = renderToStaticMarkup(<PatchHero version="0.9.0" title="Pantalla de título" date="3 de noviembre de 2026" dateTime="2026-11-03" changes="7 cambios" summary="Portada nueva." latest headingLevel={2} />);
    expect(markup).toContain('Parche');
    expect(markup).toContain('>0.9.0<');
    expect(markup).toMatch(/<h2[^>]*>Pantalla de título<\/h2>/);
    expect(markup).toContain('Portada nueva.');
    expect(markup).toContain('Última versión');
    expect(markup).toContain('dateTime="2026-11-03"');
    const plain = renderToStaticMarkup(<PatchHero version="0.9.0" title="T" date="d" dateTime="x" changes="1 cambio" />);
    expect(plain).not.toContain('Última versión');
    expect(plain).toMatch(/<h3/);
  });
});

describe('HighlightCard y SectionRule', () => {
  it('pintan el acento con un token y escriben siempre el nombre de la categoría', () => {
    const card = renderToStaticMarkup(<HighlightCard tone="ok" icon={Sparkles} kind="Nuevo">Algo</HighlightCard>);
    expect(card).toContain('--accent:var(--ok)');
    expect(card).toContain('Nuevo');
    const rule = renderToStaticMarkup(<SectionRule tone="red" icon={Sparkles} label="Correcciones" count={2} id="r" />);
    expect(rule).toContain('--accent:var(--red)');
    expect(rule).toMatch(/<h4 id="r"/);
    expect(rule).toContain('aria-label="2 cambios"');
  });
});

describe('Timeline', () => {
  it('marca la parada abierta con aria-current y lista las versiones en orden', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Timeline label="Versiones"><TimelineLink to="/a" version="0.9.0" title="Uno" date="d" dateTime="x" current /><TimelineLink to="/b" version="0.8.0" title="Dos" date="d" dateTime="y" /></Timeline></MemoryRouter>);
    expect(markup).toContain('aria-label="Versiones"');
    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
    expect(markup.indexOf('v0.9.0')).toBeLessThan(markup.indexOf('v0.8.0'));
    expect(markup).toContain('title="Uno"');
  });
});
