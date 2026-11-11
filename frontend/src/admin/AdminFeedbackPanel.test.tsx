import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminFeedbackPanel, AdminFeedbackView, type AdminFeedbackViewProps } from './AdminFeedbackPanel';
import { LEGACY } from '../styles/legacy-classes';
import { feedback } from './fixtures';

const noop = () => undefined;
const base: AdminFeedbackViewProps = {
  items: [], overview: { newBugs: 3, newSuggestions: 2, reviewing: 1, resolved: 7 }, page: 1, totalPages: 1, total: 0, loading: false, saving: false, error: '',
  search: '', reference: '', status: 'NEW', type: '', selectedId: null, detailOpen: false,
  onSearch: noop, onReference: noop, onStatus: noop, onType: noop, onPage: noop, onRetry: noop, onOpen: noop, onBack: noop, onChangeStatus: noop,
};
const render = (props: Partial<AdminFeedbackViewProps>) => renderToStaticMarkup(<AdminFeedbackView {...base} {...props} />);

describe('AdminFeedbackPanel', () => {
  it('shows the operational inbox states while loading', () => {
    const markup = renderToStaticMarkup(<AdminFeedbackPanel />);
    expect(markup).toContain('Feedback de jugadores');
    expect(markup).toContain('Problemas nuevos');
    expect(markup).toContain('Sugerencias nuevas');
    expect(markup).toContain('Nuevos');
    expect(markup).toContain('Revisando');
    expect(markup).toContain('Solucionados');
    expect(markup).toContain('Cargando el feedback');
  });

  it('vacío y error con «Reintentar»', () => {
    expect(render({})).toContain('No hay feedback con estos filtros');
    const error = render({ error: 'Sin conexión' });
    expect(error).toContain('role="alert"');
    expect(error).toContain('Reintentar');
  });

  it('con mensajes: franjas, ficha con su estado y paginación', () => {
    const html = render({ items: [feedback], total: 1 });
    expect(html).toContain('Shiny Vote');
    expect(html).toContain('Gary');
    expect(html).toContain('El temporizador se queda a cero.');
    expect(html).toMatch(/<label[^>]*>Estado<\/label><select[^>]*><option value="NEW" selected="">Nuevo<\/option>/);
    expect(html).toContain('PIKA42');
    expect(html).toContain('Página 1 de 1 · 1 registro');
    expect(html).toContain('>3<');
    expect(html).not.toMatch(LEGACY);
  });

  it('un fallo al cambiar el estado avisa sin perder la bandeja', () => {
    const html = render({ items: [feedback], total: 1, error: 'No se pudo actualizar el estado.' });
    expect(html).toContain('No se pudo actualizar el feedback');
    expect(html).toContain('El temporizador se queda a cero.');
  });
});
