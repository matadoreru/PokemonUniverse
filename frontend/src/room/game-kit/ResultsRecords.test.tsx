import { Flame, Trophy } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResultsHostActions, ResultsRecords, resultsContinueLabel, resultsCountdownText, resultsCountedDouble, type ResultsSession } from './ResultsRecords';

describe('ResultsRecords', () => {
  it('pinta cada récord con quién, el valor y el contexto; sin nadie, lo dice', () => {
    const markup = renderToStaticMarkup(createElement(ResultsRecords, { id: 'r', records: [
      { key: 'a', title: 'Mejor ronda', icon: Trophy, names: ['Misty', 'Ash'], value: '+12', unit: 'puntos en una sola ronda' },
      { key: 'b', title: 'Mejor racha', icon: Flame, names: null, value: '', unit: '' },
    ] }));
    expect(markup).toContain('aria-labelledby="r"');
    expect(markup).toContain('Récords de la partida');
    expect(markup).toContain('Misty, Ash');
    expect(markup).toContain('+12');
    expect(markup).toContain('puntos en una sola ronda');
    expect(markup).toContain('Nadie lo consiguió en esta partida.');
    expect(markup).not.toContain('aria-hidden="true">+12');
  });

  it('con valueInHelp el valor va en la ayuda y el grande queda oculto a los lectores', () => {
    const markup = renderToStaticMarkup(createElement(ResultsRecords, { id: 'r', records: [{ key: 'a', title: 'Mejor racha', icon: Flame, names: ['Misty'], value: '3', unit: 'aciertos seguidos', valueInHelp: true }] }));
    expect(markup).toContain('3 aciertos seguidos');
    expect(markup).toMatch(/aria-hidden="true">3</);
  });

  const open: ResultsSession = { sessionMode: { type: 'INFINITE' }, gamesPlayed: 3, sessionStandings: [] };

  it('el host continúa o termina; el resto espera', () => {
    const host = renderToStaticMarkup(createElement(ResultsHostActions, { room: open, host: true, onLobby: () => undefined, onEnd: () => undefined }));
    expect(host).toContain('Continuar sesión');
    expect(host).toContain('Terminar sesión');
    const guest = renderToStaticMarkup(createElement(ResultsHostActions, { room: open, host: false, onLobby: () => undefined, onEnd: () => undefined, waitingText: 'Esperando a que el host continúe la sesión…' }));
    expect(guest).toContain('Esperando a que el host continúe la sesión…');
    expect(guest).not.toContain('Continuar sesión');
  });

  it('si queda sesión, host y resto ven la cuenta atrás hasta que sigue sola; sin plazo, nada', () => {
    const now = Date.now();
    const timed: ResultsSession = { ...open, resultsEndsAt: now + 12_000, serverNow: now };
    for (const host of [true, false]) {
      const markup = renderToStaticMarkup(createElement(ResultsHostActions, { room: timed, host, onLobby: () => undefined, onEnd: () => undefined }));
      expect(markup).toMatch(/role="timer"[^>]*>Siguiente partida en 1[12] s</);
      // Fuera de una región viva: la única de los resultados es la de los logros.
      expect(markup).not.toContain('aria-live');
    }
    const untimed = renderToStaticMarkup(createElement(ResultsHostActions, { room: { ...open, resultsEndsAt: null, serverNow: now }, host: false, onLobby: () => undefined, onEnd: () => undefined }));
    expect(untimed).not.toContain('Siguiente partida');
    expect(resultsCountdownText(12)).toBe('Siguiente partida en 12 s');
    expect(resultsCountdownText(0)).toBe('Empieza la siguiente partida…');
  });

  it('la insignia «Última partida: vale doble» sale solo si la partida que terminó valió doble', () => {
    const summary = { gameNumber: 3, gameId: 'shiny-vote', winnerIds: [], points: {} };
    const doubled: ResultsSession = { sessionMode: { type: 'GAME_COUNT', target: 3, doubleLastGame: true }, gamesPlayed: 3, sessionStandings: [], sessionHistory: [{ ...summary, pointsMultiplier: 2 }] };
    expect(resultsCountedDouble(doubled)).toBe(true);
    expect(resultsCountedDouble({ ...doubled, sessionHistory: [summary] })).toBe(false);
    expect(resultsCountedDouble({ ...doubled, gamesPlayed: 4 })).toBe(false);
    expect(resultsCountedDouble(open)).toBe(false);
    for (const host of [true, false]) {
      expect(renderToStaticMarkup(createElement(ResultsHostActions, { room: doubled, host, onLobby: () => undefined, onEnd: () => undefined }))).toContain('Última partida: vale doble');
    }
    expect(renderToStaticMarkup(createElement(ResultsHostActions, { room: open, host: true, onLobby: () => undefined, onEnd: () => undefined }))).not.toContain('vale doble');
  });

  it('con la sesión terminada (partidas o puntos objetivo), «Ver clasificación final» en todos los juegos', () => {
    expect(resultsContinueLabel(open)).toBe('Continuar sesión');
    expect(resultsContinueLabel({ sessionMode: { type: 'GAME_COUNT', target: 3 }, gamesPlayed: 2, sessionStandings: [] })).toBe('Continuar sesión');
    expect(resultsContinueLabel({ sessionMode: { type: 'GAME_COUNT', target: 3 }, gamesPlayed: 3, sessionStandings: [] })).toBe('Ver clasificación final');
    const done = renderToStaticMarkup(createElement(ResultsHostActions, { room: { sessionMode: { type: 'GAME_COUNT', target: 1 }, gamesPlayed: 1, sessionStandings: [] }, host: true, onLobby: () => undefined, onEnd: () => undefined }));
    expect(done).toContain('Ver clasificación final');
    expect(done).not.toContain('Continuar sesión');
  });
});
