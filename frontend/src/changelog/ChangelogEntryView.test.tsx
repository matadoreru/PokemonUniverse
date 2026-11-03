import type { ChangelogEntry } from '@pokemon-universe/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChangelogEntryView } from './ChangelogEntryView';

const entry: ChangelogEntry = {
  id: 'entry-1',
  version: '0.8.0',
  title: 'Una sala más completa',
  date: '2026-09-11T00:00:00.000Z',
  published: true,
  content: [
    { type: 'NEW', text: 'Nuevo selector de minijuegos.' },
    { type: 'BUGS', text: 'Corregida la reconexión de la sala.' },
    { type: 'BUGS', text: 'Corregido el contador de jugadores.' },
  ],
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

describe('ChangelogEntryView', () => {
  it('makes version metadata and categories easy to scan', () => {
    const markup = renderToStaticMarkup(<ChangelogEntryView entry={entry} latest />);
    expect(markup).toContain('Última versión');
    expect(markup).toContain('3 cambios');
    expect(markup).toContain('2 categorías');
    expect(markup).toContain('href="#version-0.8.0-NEW"');
    expect(markup).toContain('Correcciones');
  });
});
