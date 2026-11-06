import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DailyOverviewResponse } from '../lib/api-contract';
import { DailyPanel, type DailyPanelProps } from './DailyPanel';

const overview = (overrides: Partial<DailyOverviewResponse> = {}): DailyOverviewResponse => ({
  date: '2026-11-07', resetsAt: '2026-11-07T23:00:00Z', gameId: 'higher-lower', name: 'Higher or Lower', icon: 'trending-up',
  roundCount: 10, players: 40, status: 'AVAILABLE', result: null, ...overrides,
});
const NOW = Date.parse('2026-11-07T17:48:00Z');
const noop = () => undefined;

function render(props: Partial<DailyPanelProps>) {
  const all: DailyPanelProps = { guest: false, overview: overview(), loadError: null, playError: null, busy: false, disabled: false, now: NOW, onPlay: noop, onReload: noop, ...props };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DailyPanel, all)));
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// Cada `Row` pone su nombre en un `span` con `title`: una por franja.
const rows = (markup: string) => markup.match(/<span class="[^"]*" title="[^"]*">/g) ?? [];

describe('DailyPanel', () => {
  it('cabecera con «Reto diario» y la cuenta atrás', () => {
    const markup = text(render({}));
    expect(markup).toContain('Reto diario');
    expect(markup).toContain('Nuevo reto en 5 h 12 min');
  });

  it('disponible: una fila con el juego de hoy, su reto, cuántos han jugado y «Jugar»', () => {
    const markup = render({});
    expect(rows(markup)).toHaveLength(1);
    expect(text(markup)).toContain('Hoy toca');
    expect(text(markup)).toContain('Higher or Lower');
    expect(text(markup)).toContain('10 comparaciones');
    expect(text(markup)).toContain('40 han jugado hoy');
    expect(markup).toMatch(/<button[^>]*>.*Jugar<\/span><\/button>/);
  });

  it('en curso: «Volver al reto», hacia la sala', () => {
    const markup = render({ overview: overview({ status: 'IN_PROGRESS' }) });
    expect(rows(markup)).toHaveLength(1);
    expect(text(markup)).toContain('Hoy toca');
    expect(markup).toMatch(/<a[^>]*href="\/room"[^>]*>.*Volver al reto/);
    expect(text(markup)).not.toContain(' Jugar ');
  });

  it('terminado: el chip con puntos y puesto y «Ver resultado», hacia /daily', () => {
    const markup = render({ overview: overview({ status: 'FINISHED', result: { score: 612, correct: 7, roundCount: 10, rounds: [], position: 3, total: 40 } }) });
    expect(rows(markup)).toHaveLength(1);
    expect(text(markup)).toContain('Hoy toca');
    expect(text(markup)).toContain('612 pts · 3.º de 40');
    expect(markup).toMatch(/<a[^>]*href="\/daily"[^>]*>.*Ver resultado/);
  });

  it('abandonado: el chip «Abandonado» y «Ver clasificación», sin volver a jugar', () => {
    const markup = render({ overview: overview({ status: 'ABANDONED' }) });
    expect(rows(markup)).toHaveLength(1);
    expect(text(markup)).toContain('Hoy toca');
    expect(text(markup)).toContain('Abandonado');
    expect(markup).toMatch(/<a[^>]*href="\/daily"[^>]*>.*Ver clasificación/);
    expect(markup).not.toMatch(/<button[^>]*>.*Jugar<\/span><\/button>/);
  });

  it('invitado: bloqueado, con «Crear cuenta» hacia /auth y sin fila', () => {
    const markup = render({ guest: true, overview: null });
    expect(text(markup)).toContain('El reto diario es para cuentas registradas');
    expect(markup).toMatch(/<a[^>]*href="\/auth"[^>]*>.*Crear cuenta/);
    expect(rows(markup)).toHaveLength(0);
  });

  it('el error de «Jugar» sale traducido en el panel, encima de la fila, que sigue con su botón', () => {
    const markup = render({ playError: new Error('Daily challenge already played') });
    expect(markup).toContain('role="alert"');
    expect(text(markup)).toContain('Ya has jugado el reto de hoy.');
    expect(markup).not.toContain('Daily challenge already played');
    expect(rows(markup)).toHaveLength(1);
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf('Hoy toca'));
    expect(markup).toMatch(/<button[^>]*>.*Jugar<\/span><\/button>/);
  });

  it('«Ya has jugado el reto de hoy.» y, al recargar, el estado nuevo: sin el error y con «Ver resultado»', () => {
    const markup = render({ playError: new Error('Daily challenge already played'), overview: overview({ status: 'FINISHED', result: { score: 612, correct: 7, roundCount: 10, rounds: [], position: 3, total: 40 } }) });
    expect(markup).not.toContain('role="alert"');
    expect(text(markup)).not.toContain('Ya has jugado el reto de hoy.');
    expect(markup).toMatch(/<a[^>]*href="\/daily"[^>]*>.*Ver resultado/);
  });

  it('mientras carga, sin fila', () => {
    expect(rows(render({ overview: null }))).toHaveLength(0);
  });
});
