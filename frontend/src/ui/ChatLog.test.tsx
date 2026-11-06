import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { becameVisible, ChatLog, isNearBottom } from './ChatLog';
import type { ChatLogItem } from './ChatLog';

const items: ChatLogItem[] = [
  { id: 'a', author: 'Misty', authorTone: 'var(--info)', time: '18:03', text: 'Hola a todos', own: false },
  { id: 'b', author: 'Ash', authorTone: 'var(--yellow)', time: '18:04', text: 'Listo para jugar', own: true },
];
const render = (extra: object = {}) => renderToStaticMarkup(createElement(ChatLog, { items, label: 'Mensajes del chat', empty: createElement('p', null, 'Sin mensajes'), ...extra }));

describe('ChatLog', () => {
  it('sin mensajes pinta el estado vacío que pase el llamador', () => {
    const html = render({ items: [] });
    expect(html).toContain('Sin mensajes');
    expect(html).not.toContain('Hola a todos');
  });

  it('es una lista con nombre y no es región viva', () => {
    const html = render();
    expect(html).toMatch(/<ol[^>]*aria-label="Mensajes del chat"/);
    expect(html).not.toContain('role="log"');
    expect(html).not.toContain('aria-live');
    expect(html).not.toContain('role="status"');
  });

  it('muestra autor con title, hora y texto', () => {
    const html = render();
    expect(html).toContain('title="Misty"');
    expect(html).toContain('18:03');
    expect(html).toContain('Hola a todos');
  });

  it('marca «Tú» solo en el mensaje propio', () => {
    const html = render();
    expect(html.match(/Tú/g)).toHaveLength(1);
    expect(html.indexOf('Tú')).toBeGreaterThan(html.indexOf('Ash'));
  });

  it('el botón de moderar solo existe con onModerate y lleva su nombre accesible', () => {
    expect(render()).not.toContain('<button');
    const html = render({ onModerate: () => undefined, moderateLabel: (i: ChatLogItem) => `Moderar el mensaje de ${i.author}` });
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Moderar el mensaje de Misty"');
    expect(html).toContain('aria-label="Moderar el mensaje de Ash"');
  });

  it('un mensaje con `moderatable: false` no lleva botón de moderar', () => {
    const html = render({ items: [{ ...items[0]!, moderatable: false }, items[1]!], onModerate: () => undefined, moderateLabel: (i: ChatLogItem) => `Moderar el mensaje de ${i.author}` });
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Moderar el mensaje de Misty"');
    expect(html).toContain('aria-label="Moderar el mensaje de Ash"');
  });

  it('«Ver mensajes nuevos» solo aparece cuando hay mensajes sin ver', () => {
    expect(render()).not.toContain('Ver mensajes nuevos');
    expect(render({ forceUnseen: true })).toContain('Ver mensajes nuevos');
    expect(render({ forceUnseen: true, newMessagesLabel: 'Hay más' })).toContain('Hay más');
  });
});

describe('becameVisible', () => {
  it('solo al pasar de oculta a visible', () => {
    expect(becameVisible(false, true)).toBe(true);
    expect(becameVisible(true, true)).toBe(false);
    expect(becameVisible(true, false)).toBe(false);
    expect(becameVisible(false, false)).toBe(false);
  });
});

describe('isNearBottom', () => {
  const m = (scrollTop: number) => ({ scrollHeight: 1000, clientHeight: 300, scrollTop });
  it('está abajo hasta a 48 px del final', () => {
    expect(isNearBottom(m(700))).toBe(true);
    expect(isNearBottom(m(652))).toBe(true);
    expect(isNearBottom(m(651))).toBe(false);
    expect(isNearBottom(m(0))).toBe(false);
  });
});
