import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, playerColor } from './player-color';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import { expectSingleLiveRegion } from './test-support/live-regions';

const STANDINGS: ResultsStanding[] = [
  { id: 'a', position: 1, name: 'Misty', points: 12, color: 'var(--info)', meta: '3 aciertos' },
  { id: 'b', position: 2, name: 'Ash', points: 9, color: 'var(--yellow)' },
  { id: 'c', position: 3, name: 'Brock', points: 4 },
  { id: 'd', position: 4, name: 'Gary', points: 0 },
];
const shell = (props: Partial<Parameters<typeof ResultsShell>[0]> = {}) => renderToStaticMarkup(createElement(ResultsShell, { title: 'Resultado de la partida', subtitle: 'Pokédex Distance · Partida 1', children: createElement('p', null, 'Acciones'), ...props }));

describe('ResultsShell', () => {
  it('fillLarge solo cambia la pantalla ancha (con aside): sin aside no hace nada', () => {
    expect(shell({ aside: createElement('p', null, 'Métricas'), fillLarge: true })).toMatch(/class="[^"]*fillLarge/);
    expect(shell({ aside: createElement('p', null, 'Métricas') })).not.toMatch(/fillLarge/);
    expect(shell({ fillLarge: true })).not.toMatch(/fillLarge/);
  });
  it('sin clasificación: título h1, subtítulo e hijos, sin las clases antiguas', () => {
    const html = shell();
    expect(html).toContain('<h1');
    expect(html).toContain('Resultado de la partida');
    expect(html).toContain('Pokédex Distance · Partida 1');
    expect(html).toContain('<p>Acciones</p>');
    expect(html).not.toMatch(/class="[^"]*\b(card|label|text-berry)\b/);
    expect(html).not.toContain('Clasificación');
  });
  it('con clasificación: lista ordenada con puesto, nombre, puntos y color; podio y ganador con insignia y «+N»', () => {
    const html = shell({ standings: STANDINGS, selfId: 'b' });
    expect(html).toContain('aria-label="Clasificación"');
    expect(html.match(/<li/g)).toHaveLength(4);
    for (const name of ['Misty', 'Ash', 'Brock', 'Gary']) expect(html).toContain(`title="${name}"`);
    expect(html).toContain('--player:var(--info)');
    expect(html).toContain('3 aciertos');
    expect(html.match(/Ganador/g)).toHaveLength(1);
    expect(html).toContain('+12');
    expect(html).toContain('12 pts');
    expect(html.match(/data-podium/g)).toHaveLength(3);
    expect(html).toContain('Avatar de Gary');
  });
  it('empate en cabeza: todos los primeros llevan la insignia', () => {
    const html = shell({ standings: [{ id: 'a', position: 1, name: 'A', points: 5 }, { id: 'b', position: 1, name: 'B', points: 5 }] });
    expect(html.match(/Ganador/g)).toHaveLength(2);
  });
  it('hasExactlyOneLiveRegion', () => {
    const html = shell({ standings: STANDINGS, aside: createElement('p', null, 'Métricas') });
    expectSingleLiveRegion(html);
    expect(html).toContain('<p class="sr-only" role="status" aria-live="polite"></p>');
  });
  it('puntos con etiqueta propia', () => {
    expect(shell({ standings: STANDINGS.slice(0, 1), pointsLabel: (points) => `${points} puntos` })).toContain('12 puntos');
  });
});

describe('playerColor', () => {
  it('reparte los colores de los tokens por orden de llegada y vuelve a empezar', () => {
    expect(playerColor(0)).toBe(PLAYER_COLORS[0]);
    expect(playerColor(PLAYER_COLORS.length)).toBe(PLAYER_COLORS[0]);
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length);
    for (const color of PLAYER_COLORS) expect(color).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });
  it('un índice desconocido (-1) no rompe', () => {
    expect(PLAYER_COLORS).toContain(playerColor(-1));
  });
});
