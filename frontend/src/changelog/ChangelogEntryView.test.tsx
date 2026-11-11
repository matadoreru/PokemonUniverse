import type { ChangelogEntry } from '@pokemon-universe/shared/public';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PatchNotes, PatchPreview, splitChanges } from './ChangelogEntryView';

const entry: ChangelogEntry = {
  id: 'entry-1',
  version: '0.8.0',
  title: 'Una sala más completa',
  summary: 'La sala gana selector de minijuegos y reconexión.',
  date: '2026-09-11T00:00:00.000Z',
  published: true,
  content: [
    { type: 'NEW', text: 'Nuevo selector de minijuegos.', highlight: true },
    { type: 'BUGS', text: 'Corregida la reconexión de la sala.' },
    { type: 'BUGS', text: 'Corregido el contador de jugadores.' },
  ],
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe('splitChanges', () => {
  it('saca los destacados y no los repite en su categoría', () => {
    const { highlights, groups } = splitChanges(entry.content);
    expect(highlights.map((change) => change.text)).toEqual(['Nuevo selector de minijuegos.']);
    expect(groups).toEqual([{ type: 'BUGS', changes: entry.content.slice(1) }]);
  });
});

describe('PatchNotes', () => {
  it('enseña la portada, lo destacado y las categorías', () => {
    const markup = render(<PatchNotes entry={entry} latest />);
    expect(markup).toContain('Última versión');
    expect(markup).toContain('>0.8.0<');
    expect(markup).toContain('La sala gana selector de minijuegos y reconexión.');
    expect(markup).toContain('3 cambios');
    expect(markup).toContain('Lo destacado');
    expect(markup).toContain('id="version-0.8.0-BUGS"');
    expect(markup).not.toContain('id="version-0.8.0-NEW"');
    expect(markup).toContain('Correcciones');
  });

  it('sin destacados ni resumen no pinta esas partes', () => {
    const plain = { ...entry, content: entry.content.map(({ type, text }) => ({ type, text })) };
    delete (plain as Partial<ChangelogEntry>).summary;
    const markup = render(<PatchNotes entry={plain} />);
    expect(markup).not.toContain('Lo destacado');
    expect(markup).not.toContain('Última versión');
    expect(markup).toContain('id="version-0.8.0-NEW"');
  });
});

describe('PatchPreview', () => {
  it('pone primero los destacados y respeta el límite total', () => {
    const markup = render(<PatchPreview entry={entry} limit={2} />);
    expect(markup).toContain('Nuevo selector de minijuegos.');
    expect(markup).toContain('Corregida la reconexión de la sala.');
    expect(markup).not.toContain('Corregido el contador de jugadores.');
    expect(markup).toContain('La sala gana selector');
  });
});
