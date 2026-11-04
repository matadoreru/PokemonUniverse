import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminRecordsView, type AdminRecordsViewProps } from './AdminRecords';
import { adminUser, LEGACY, room } from './fixtures';

const noop = () => undefined;
const base: AdminRecordsViewProps = {
  tab: 'rooms', roomMode: 'active', records: { kind: 'active', items: [] }, page: 1, totalPages: 1, total: 0, loading: false, error: '', search: '', status: '',
  selectedId: null, detailOpen: false, onRoomMode: noop, onSearch: noop, onStatus: noop, onPage: noop, onRetry: noop, onOpen: noop, onBack: noop,
};
const render = (props: Partial<AdminRecordsViewProps>) => renderToStaticMarkup(<AdminRecordsView {...base} {...props} />);

describe('AdminRecordsView', () => {
  it('cargando: esqueleto con su nombre y los filtros a mano', () => {
    const html = render({ loading: true });
    expect(html).toContain('aria-label="Cargando las salas"');
    expect(html).toContain('role="radiogroup" aria-label="Tipo de salas"');
    expect(html).toContain('Buscar sala, anfitrión o jugador');
    // Las salas activas no se filtran por estado.
    expect(html).not.toContain('Filtrar estado');
  });

  it('vacío: aviso con texto', () => {
    const html = render({ tab: 'games', records: { kind: 'games', items: [] } });
    expect(html).toContain('No hay registros con estos filtros');
    expect(html).toContain('Filtrar estado');
    expect(html).toContain('Abandonadas');
  });

  it('error: alerta con el motivo y «Reintentar»', () => {
    const html = render({ error: 'Sin conexión con el servidor' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('No se pudieron cargar las salas');
    expect(html).toContain('Sin conexión con el servidor');
    expect(html).toContain('Reintentar');
  });

  it('con datos: franjas, ficha de la primera y paginación accesible', () => {
    const html = render({ records: { kind: 'active', items: [room] }, total: 41, totalPages: 3, page: 1 });
    // Código y anfitrión con su propio texto (el E2E los busca exactos).
    expect(html).toContain('>PIKA42<');
    expect(html).toMatch(/<span class="[^"]*">Ash<\/span>/);
    expect(html).toContain('aria-label="Ver Sala PIKA42"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('Sala PIKA42');
    expect(html).toContain('Participantes');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('En el lobby');
    expect(html).toContain('aria-label="Páginas de salas activas"');
    expect(html).toContain('Página 1 de 3 · 41 registros');
    expect(html).toMatch(/aria-label="Página anterior"[^>]*disabled=""|disabled=""[^>]*aria-label="Página anterior"/);
    expect(html).toContain('Volver');
  });

  it('usuarios: rol con texto y cifras en la ficha', () => {
    const html = render({ tab: 'users', records: { kind: 'users', items: [adminUser] }, total: 1 });
    expect(html).toContain('Buscar usuario o email');
    expect(html).toContain('Todos los roles');
    expect(html).toContain('Administrador');
    expect(html).toContain('brock@example.com');
    expect(html).toContain('1234');
  });

  it('solo usa el catálogo', () => {
    expect(render({ records: { kind: 'active', items: [room] }, total: 1 })).not.toMatch(LEGACY);
    expect(render({ loading: true })).not.toMatch(LEGACY);
  });
});
