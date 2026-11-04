import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rememberedTotal, ServerTimer, serverTimerTotal } from './ServerTimer';

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

describe('rememberedTotal', () => {
  it('keeps the first measured total of a deadline across remounts and measures a new one', () => {
    const store = new Map<number, number>();
    expect(rememberedTotal(50_000, 19_400, store)).toEqual({ deadline: 50_000, totalMs: 20_000 });
    // Otro montaje, ya con menos tiempo: la barra no se rellena.
    expect(rememberedTotal(50_000, 8_000, store)).toEqual({ deadline: 50_000, totalMs: 20_000 });
    expect(rememberedTotal(90_000, 30_000, store)).toEqual({ deadline: 90_000, totalMs: 30_000 });
    expect(rememberedTotal(null, 0, store)).toEqual({ deadline: null, totalMs: 0 });
  });

  it('forgets the oldest deadline past its limit', () => {
    const store = new Map<number, number>();
    for (let i = 1; i <= 33; i += 1) rememberedTotal(i * 1_000, 500, store);
    expect(store.size).toBe(32);
    expect(store.has(1_000)).toBe(false);
  });
});
