import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FeedbackPage } from './FeedbackPage';

describe('FeedbackPage', () => {
  it('offers both feedback types and preserves room context', () => {
    const markup = renderToStaticMarkup(<MemoryRouter initialEntries={['/feedback?game=shiny-vote&room=PIKA42']}><FeedbackPage /></MemoryRouter>);
    expect(markup).toContain('Enviar feedback');
    expect(markup).toContain('Reportar problema');
    expect(markup).toContain('Enviar sugerencia');
    expect(markup).toContain('Sala: PIKA42');
    expect(markup).toContain('Volver a la partida');
  });
});
