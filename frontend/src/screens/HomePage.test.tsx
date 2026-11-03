import type { ChangelogEntry } from '@pokemon-universe/shared/public';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomeNews } from './HomePage';

const entry: ChangelogEntry = {
  id: 'entry-1',
  version: '0.8.0',
  title: 'Una sala más completa',
  date: '2026-09-11T00:00:00.000Z',
  published: true,
  content: [
    { type: 'NEW', text: 'Nuevo selector de minijuegos.' },
    { type: 'BUGS', text: 'Corregida la reconexión de la sala.' },
  ],
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

function render(props: Partial<Parameters<typeof HomeNews>[0]> = {}): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <HomeNews entries={[]} loading={false} error="" onRetry={() => undefined} {...props} />
    </MemoryRouter>,
  );
}

describe('HomeNews (panel «Lo último en el universo»)', () => {
  it('sin versiones muestra el StateBox vacío, que invita a jugar', () => {
    const markup = render();
    expect(markup).toContain('Lo último en el universo');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Aún no hay novedades');
    expect(markup).toContain('crea una sala');
    expect(markup).not.toContain('Ver todas');
  });

  it('con error muestra el StateBox de error en español y «Reintentar», sin el texto del servidor', () => {
    const markup = render({ error: 'Failed to fetch' });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No se pudieron cargar las novedades');
    expect(markup).toContain('Reintentar');
    expect(markup).not.toContain('Failed to fetch');
  });

  it('mientras carga muestra el esqueleto', () => {
    const markup = render({ loading: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Cargando la última versión');
  });

  it('con versiones enseña la última y enlaza a todas', () => {
    const markup = render({ entries: [entry] });
    expect(markup).toContain('v0.8.0');
    expect(markup).toContain('Una sala más completa');
    expect(markup).toContain('Nuevo selector de minijuegos.');
    expect(markup).toContain('href="/changelog"');
    expect(markup).toContain('Ver todas');
  });
});
