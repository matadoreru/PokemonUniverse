import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminFeedbackPanel } from './AdminFeedbackPanel';

describe('AdminFeedbackPanel', () => {
  it('shows the operational inbox states while loading', () => {
    const markup = renderToStaticMarkup(<AdminFeedbackPanel />);
    expect(markup).toContain('Feedback de jugadores');
    expect(markup).toContain('Problemas nuevos');
    expect(markup).toContain('Sugerencias nuevas');
    expect(markup).toContain('Nuevos');
    expect(markup).toContain('Revisando');
    expect(markup).toContain('Solucionados');
    expect(markup).toContain('Cargando feedback');
  });
});
