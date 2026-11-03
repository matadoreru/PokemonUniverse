import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FeedbackPage } from './FeedbackPage';

const render = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><FeedbackPage /></MemoryRouter>);

describe('FeedbackPage', () => {
  it('offers general feedback by default', () => {
    const markup = render('/feedback');
    expect(markup).toContain('Pokémon Universe en general');
    expect(markup).toContain('¿Sobre qué nos escribes?');
    expect(markup).not.toContain('>Minijuego</label>');
    expect(markup).toContain('Volver al inicio');
  });

  it('offers both feedback types and preserves minigame and room context', () => {
    const markup = render('/feedback?game=shiny-vote&room=PIKA42');
    expect(markup).toContain('Enviar feedback');
    expect(markup).toContain('role="radiogroup" aria-label="Tipo de feedback"');
    expect(markup).toContain('>Problema<');
    expect(markup).toContain('>Sugerencia<');
    expect(markup).toContain('>Minijuego</label>');
    expect(markup).toContain('Sala: PIKA42');
    expect(markup).toContain('Volver a la partida');
  });

  it('counts the description and keeps «Enviar» off until it has 10 characters', () => {
    const markup = render('/feedback');
    expect(markup).toContain('0 / 2000');
    expect(markup).toContain('Mínimo 10 caracteres.');
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it('uses only the Arcade DS catalogue', () => {
    expect(render('/feedback?game=shiny-vote')).not.toMatch(/btn-|status-error|permission-chip|class="(label|field|panel)/);
  });
});
