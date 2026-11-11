import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cutInToneMap } from '../components/RevealCutIn';
import { Cutin, CutinBand, isSkipKey } from './Cutin';

const classes = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ').map((c) => c.replace(/^_/, '').replace(/_[0-9a-z]+$/i, ''));

describe('Cutin', () => {
  it('lleva la clase del tono y el modo de movimiento', () => {
    const full = renderToStaticMarkup(createElement(Cutin, { tone: 'red', title: 'Eliminado', reducedMotion: false }));
    expect(classes(full)).toEqual(expect.arrayContaining(['cutin', 'red']));
    expect(full).toContain('data-motion="full"');
    expect(full).toContain('role="status"');
    expect(full).toContain('aria-live="assertive"');
    expect(full).toContain('data-layer="cutin"');
    const reduced = renderToStaticMarkup(createElement(Cutin, { tone: 'ok', title: 'Bien', reducedMotion: true }));
    expect(classes(reduced)).toContain('ok');
    expect(reduced).toContain('data-motion="reduced"');
  });

  it('no intercepta el puntero salvo que se pueda saltar', () => {
    const plain = renderToStaticMarkup(createElement(Cutin, { tone: 'info', title: 'Hola', reducedMotion: false }));
    expect(classes(plain)).not.toContain('skippable');
    const skip = renderToStaticMarkup(createElement(Cutin, { tone: 'info', title: 'Hola', reducedMotion: false, onSkip: () => undefined }));
    expect(classes(skip)).toContain('skippable');
  });

  it('añade la clase de quien la envuelve según el tono visible', () => {
    const html = renderToStaticMarkup(createElement(Cutin, { tone: 'yellow', title: 'Ana', reducedMotion: false, className: (tone: string) => `extra-${tone}` }));
    expect(html).toContain('extra-yellow');
  });

  it('al ocultarse deja la región status vacía, sin las clases de la banda', () => {
    const html = renderToStaticMarkup(createElement(CutinBand, { visible: false, delayedShown: false, reduced: false, tone: 'yellow', title: 'Ana', className: 'reveal-cut-in', layer: 'reveal-cut-in' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('data-layer="reveal-cut-in"');
    expect(html).not.toContain('Ana');
    expect(html).not.toMatch(/class="[^"]*reveal-cut-in/);
  });

  it('con `live={false}` se ve igual pero no es región viva, y oculta no deja nada', () => {
    const band = { delayedShown: false, reduced: false, tone: 'yellow' as const, title: 'Ana', live: false };
    const shown = renderToStaticMarkup(createElement(CutinBand, { ...band, visible: true }));
    expect(shown).toContain('Ana');
    expect(shown).toContain('data-layer="cutin"');
    expect(shown).not.toMatch(/role="status"|aria-live/);
    expect(renderToStaticMarkup(createElement(CutinBand, { ...band, visible: false }))).toBe('');
  });

  it('cambia al tono diferido junto con la línea diferida', () => {
    const before = renderToStaticMarkup(createElement(CutinBand, { visible: true, delayedShown: false, reduced: false, tone: 'yellow', delayedTone: 'red', title: 'Ana', delayedLine: '…era impostor' }));
    expect(classes(before)).toContain('yellow');
    expect(before).not.toContain('…era impostor');
    const after = renderToStaticMarkup(createElement(CutinBand, { visible: true, delayedShown: true, reduced: false, tone: 'yellow', delayedTone: 'red', title: 'Ana', delayedLine: '…era impostor' }));
    expect(classes(after)).toContain('red');
    expect(after).toContain('…era impostor');
    expect(after).toContain('motion-enter-up');
  });
});

describe('isSkipKey', () => {
  const key = (over: Partial<Parameters<typeof isSkipKey>[0]> = {}) => ({ key: ' ', code: 'Space', repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: { tagName: 'BODY' }, ...over }) as Parameters<typeof isSkipKey>[0];
  it('Espacio limpio salta', () => {
    expect(isSkipKey(key())).toBe(true);
  });
  it('ignora repetición, modificadores, otras teclas y el foco en campos, botones o enlaces', () => {
    expect(isSkipKey(key({ repeat: true }))).toBe(false);
    expect(isSkipKey(key({ shiftKey: true }))).toBe(false);
    expect(isSkipKey(key({ ctrlKey: true }))).toBe(false);
    expect(isSkipKey(key({ key: 'Enter', code: 'Enter' }))).toBe(false);
    for (const tagName of ['INPUT', 'TEXTAREA', 'BUTTON', 'A']) expect(isSkipKey(key({ target: { tagName } as never }))).toBe(false);
    expect(isSkipKey(key({ target: { tagName: 'DIV', getAttribute: () => 'button' } as never }))).toBe(false);
  });
});

describe('RevealCutIn › mapa de tonos', () => {
  it('traduce los tonos de siempre a los del cut-in', () => {
    expect(cutInToneMap).toEqual({ electric: 'yellow', berry: 'red', aqua: 'info', leaf: 'ok' });
  });
});
