import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { clueEntryClass, GameScreen } from './GameScreen';
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
  it('la pista no entra al montar y alterna dos animaciones en cada cambio de ronda o fase', () => {
    expect(clueEntryClass(0)).toBeUndefined();
    expect(clueEntryClass(1)).toMatch(/enterOdd/);
    expect(clueEntryClass(2)).toMatch(/enterEven/);
    expect(clueEntryClass(3)).toBe(clueEntryClass(1));
    const html = renderToStaticMarkup(<GameScreen gameName="x" roundNumber={1} totalRounds={1} phase="ROUND_ACTIVE" heading="h" timer={{ deadline: null, serverOffset: 0, label: 'Tiempo' }} announcement="" clue={<p>pista</p>} side={null} bottom={null} />);
    expect(html).not.toMatch(/enter(Odd|Even)/);
  });
  it('placa: entradilla y marca dentro del título (la marca, oculta a lectores) y la franja al pie solo si hay', () => {
    const html = renderToStaticMarkup(<GameScreen gameName="Higher or Lower" roundNumber={1} totalRounds={3} heading="Ataque" headingLead="Se compara" headingMark={<i>m</i>}
      hudFoot={<p>rol</p>} timer={{ deadline: null, serverOffset: 0, label: 'Tiempo' }} announcement="" clue={null} side={null} bottom={null} />);
    expect(html).toMatch(/<h1[^>]*title="Se compara: Ataque"[^>]*><span[^>]*aria-hidden="true"><i>m<\/i><\/span><span[^>]*>Se compara <\/span>Ataque<\/h1>/);
    expect(html).toMatch(/hudFoot[^"]*"><p>rol<\/p>/);
    const plain = renderToStaticMarkup(<GameScreen gameName="x" roundNumber={1} totalRounds={1} heading="h" timer={{ deadline: null, serverOffset: 0, label: 'Tiempo' }} announcement="" clue={null} side={null} bottom={null} />);
    expect(plain).not.toMatch(/hudFoot/);
    expect(plain).toMatch(/<h1[^>]*title="h"[^>]*>h<\/h1>/);
  });
});
