import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card, CARD_IMAGE_RETRIES, cardImageAfterError, cardImageSource } from './Card';

describe('cardImageSource', () => {
  it('el primer intento usa la URL tal cual', () => {
    expect(cardImageSource('/api/pokemon/ursaluna/sprite', 0)).toBe('/api/pokemon/ursaluna/sprite');
  });
  it('cada reintento pide una URL nueva para no servir el fallo de la caché del navegador', () => {
    expect(cardImageSource('/api/pokemon/ursaluna/sprite', 1)).toBe('/api/pokemon/ursaluna/sprite?reintento=1');
    expect(cardImageSource('/api/rooms/X/sprite?v=2', 2)).toBe('/api/rooms/X/sprite?v=2&reintento=2');
    expect(cardImageSource('https://cdn.test/a.png#frag', 1)).toBe('https://cdn.test/a.png?reintento=1#frag');
  });
  it('no toca las URL data: ni blob:', () => {
    expect(cardImageSource('data:image/png;base64,AAAA', 1)).toBe('data:image/png;base64,AAAA');
    expect(cardImageSource('blob:https://x/1', 2)).toBe('blob:https://x/1');
  });
  it('tras un fallo reintenta con espera creciente y, agotados los reintentos, se rinde (queda el «?»)', () => {
    expect(CARD_IMAGE_RETRIES).toBe(2);
    const first = cardImageAfterError(0);
    const second = cardImageAfterError(1);
    expect(first).not.toBe('failed');
    expect(second).not.toBe('failed');
    expect((second as { retryInMs: number }).retryInMs).toBeGreaterThan((first as { retryInMs: number }).retryInMs);
    expect(cardImageAfterError(CARD_IMAGE_RETRIES)).toBe('failed');
  });
});

describe('Card con marcas en la esquina', () => {
  const render = (props: Parameters<typeof Card>[0]) => renderToStaticMarkup(createElement(Card, props));

  it('la línea de veredicto de siempre, por defecto', () => {
    const html = render({ name: 'Mew', sprite: '/mew.png', state: 'correct' });
    expect(html).toContain('Correcta');
    expect(html).not.toContain('data-mark');
  });

  it('en la esquina: icono con el texto solo para lectores, sin línea bajo el nombre', () => {
    const ok = render({ name: 'Mew', sprite: '/mew.png', state: 'correct', marks: 'corner' });
    expect(ok).toMatch(/data-mark="correct"[\s\S]*<span class="sr-only">Correcta<\/span>/);
    const bad = render({ name: 'Mew', sprite: '/mew.png', state: 'wrong', marks: 'corner' });
    expect(bad).toMatch(/data-mark="wrong"[\s\S]*<span class="sr-only">Incorrecta<\/span>/);
    const selected = render({ name: 'Mew', sprite: '/mew.png', state: 'selected', marks: 'corner', onSelect: () => undefined });
    expect(selected).toContain('data-mark="selected"');
    expect(selected).toContain('aria-pressed="true"');
    expect(render({ name: 'Mew', sprite: '/mew.png', marks: 'corner' })).not.toContain('data-mark');
  });

  it('la capa del sprite va dentro del hueco del sprite', () => {
    const html = render({ name: 'Mew', sprite: '/mew.png', artOverlay: createElement('span', { 'data-testid': 'capa' }) });
    expect(html).toMatch(/data-part="art"[^>]*>[\s\S]*data-testid="capa"[\s\S]*data-part="name"/);
  });
});
