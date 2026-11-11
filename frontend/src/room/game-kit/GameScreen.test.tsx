import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameScreen } from './GameScreen';
import { expectSingleLiveRegion } from '../test-support/live-regions';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

describe('game-kit: marco', () => {
  it('marco: una sola región viva (siempre montada) con el anuncio, la ronda, el juego y el título', () => {
    const html = renderToStaticMarkup(<GameScreen gameName="¿Quién es ese Pokémon?" roundNumber={2} totalRounds={5} heading="Reconoce su silueta"
      timer={{ deadline: 30_000, serverOffset: 0, label: 'Tiempo' }} announcement="Ronda 2 terminada: era Lucario."
      clue={<p>pista</p>} side={<p>lado</p>} bottom={<p>abajo</p>} />);
    expectSingleLiveRegion(html);
    expect(html).toContain('aria-live="polite">Ronda 2 terminada: era Lucario.</p>');
    expect(html).toContain('Ronda 2 de 5');
    expect(html).toMatch(/<h1[^>]*>Reconoce su silueta<\/h1>/);
    const silent = renderToStaticMarkup(<GameScreen gameName="x" roundNumber={1} totalRounds={1} heading="h" timer={{ deadline: null, serverOffset: 0, label: 'Tiempo' }} announcement="" clue={null} side={null} bottom={null} />);
    expectSingleLiveRegion(silent);
  });
});
