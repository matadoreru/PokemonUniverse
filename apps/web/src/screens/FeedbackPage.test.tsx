import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FeedbackPage } from './FeedbackPage';

describe('FeedbackPage', () => {
  it('offers general feedback by default', () => {
    const markup = renderToStaticMarkup(<MemoryRouter initialEntries={['/feedback']}><FeedbackPage /></MemoryRouter>);
    expect(markup).toContain('Pokémon Universe en general');
    expect(markup).toContain('¿Sobre qué nos escribes?');
    expect(markup).not.toContain('<span class="label">Minijuego</span>');
  });

  it('offers both feedback types and preserves minigame and room context', () => {
    const markup = renderToStaticMarkup(<MemoryRouter initialEntries={['/feedback?game=shiny-vote&room=PIKA42']}><FeedbackPage /></MemoryRouter>);
    expect(markup).toContain('Enviar feedback');
    expect(markup).toContain('Reportar problema');
    expect(markup).toContain('Enviar sugerencia');
    expect(markup).toContain('<span class="label">Minijuego</span>');
    expect(markup).toContain('Sala: PIKA42');
    expect(markup).toContain('Volver a la partida');
  });
});
