import { Flame, Trophy } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';

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

  it('el host continúa o termina; el resto espera', () => {
    const host = renderToStaticMarkup(createElement(ResultsHostActions, { host: true, onLobby: () => undefined, onEnd: () => undefined }));
    expect(host).toContain('Continuar sesión');
    expect(host).toContain('Terminar sesión');
    const guest = renderToStaticMarkup(createElement(ResultsHostActions, { host: false, onLobby: () => undefined, onEnd: () => undefined, waitingText: 'Esperando a que el host continúe la sesión…' }));
    expect(guest).toContain('Esperando a que el host continúe la sesión…');
    expect(guest).not.toContain('Continuar sesión');
  });
});
