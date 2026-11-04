import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServerTimer, serverTimerTotal } from './ServerTimer';

describe('serverTimerTotal', () => {
  it('un plazo nuevo toma lo que queda, redondeado al segundo, como total de la barra', () => {
    expect(serverTimerTotal(null, 50_000, 19_400)).toEqual({ deadline: 50_000, totalMs: 20_000 });
    expect(serverTimerTotal({ deadline: 10_000, totalMs: 5_000 }, 50_000, 30_000)).toEqual({ deadline: 50_000, totalMs: 30_000 });
  });
  it('con el mismo plazo el total no baja aunque pase el tiempo', () => {
    const first = serverTimerTotal(null, 50_000, 20_000);
    expect(serverTimerTotal(first, 50_000, 12_000)).toBe(first);
  });
  it('sin plazo no hay total', () => {
    expect(serverTimerTotal(null, null, 0)).toEqual({ deadline: null, totalMs: 0 });
  });
});

describe('ServerTimer', () => {
  it('pinta la placa del catálogo con la etiqueta visible y el rol de temporizador', () => {
    const html = renderToStaticMarkup(createElement(ServerTimer, { deadline: Date.now() + 12_000, serverOffset: 0, label: 'Siguiente ronda' }));
    expect(html).toContain('role="timer"');
    expect(html).toMatch(/aria-label="Siguiente ronda: 1[12] s"/);
    expect(html).toContain('>Siguiente ronda</span>');
    expect(html).toContain('role="meter"');
    expect(html).not.toMatch(/text-(berry|electric|aqua|ink)/);
  });
  it('sin plazo muestra un guion', () => {
    const html = renderToStaticMarkup(createElement(ServerTimer, { deadline: null, serverOffset: 0 }));
    expect(html).toContain('–');
    expect(html).toContain('aria-label="Tiempo: 0 s"');
  });
});
