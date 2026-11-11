import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminSyncView, type AdminSyncViewProps } from './AdminSyncPanel';
import { LEGACY } from '../styles/legacy-classes';
import { syncItem } from './fixtures';

const noop = () => undefined;
const base: AdminSyncViewProps = { items: [], loading: false, error: '', syncing: '', onSync: noop, onRetry: noop };
const render = (props: Partial<AdminSyncViewProps>) => renderToStaticMarkup(<AdminSyncView {...base} {...props} />);

describe('AdminSyncView', () => {
  it('cargando, vacío y error sin fuentes', () => {
    expect(render({ loading: true })).toContain('aria-label="Cargando las fuentes de datos"');
    expect(render({})).toContain('No hay fuentes de datos');
    const error = render({ error: 'Sin conexión' });
    expect(error).toContain('No se pudieron cargar las fuentes de datos');
    expect(error).toContain('Reintentar');
  });

  it('con fuentes: cifras, estado con texto, su error y su píldora', () => {
    const html = render({ items: [syncItem, { ...syncItem, source: 'TCGDEX', status: 'COMPLETED', error: null }] });
    expect(html).toContain('PokéAPI');
    expect(html).toContain('TCGdex');
    expect(html).toContain('Error');
    expect(html).toContain('Disponible');
    expect(html).toContain('PokéAPI no responde');
    expect(html).toContain('1025');
    expect(html).toContain('1.5 s');
    expect(html).toContain('Sincronizar Pokémon');
    expect(html).toContain('Sincronizar TCG');
    expect(html).toContain('Forzar Full Sync');
    expect(html).not.toMatch(LEGACY);
  });

  it('un fallo con fuentes cargadas avisa encima y las deja a la vista', () => {
    const html = render({ items: [syncItem], error: 'No se pudo iniciar la sincronización' });
    expect(html).toContain('No se pudo completar la acción');
    expect(html).toContain('Sincronizar Pokémon');
  });

  it('con una sincronización en marcha, las acciones se desactivan', () => {
    const html = render({ items: [{ ...syncItem, status: 'RUNNING' }] });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Sincronizar todo/);
  });
});
