import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Segmented } from './Segmented';
import { nextTab, TabPanel, Tabs } from './Tabs';

const items: { key: 'a' | 'b' | 'c'; label: string; disabled?: boolean }[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B', disabled: true },
  { key: 'c', label: 'C' },
];

describe('nextTab', () => {
  it('la flecha derecha en la última vuelve a la primera', () => {
    expect(nextTab(items, 'c', 'ArrowRight')).toBe('a');
  });
  it('la flecha izquierda en la primera va a la última', () => {
    expect(nextTab(items, 'a', 'ArrowLeft')).toBe('c');
  });
  it('Home y End', () => {
    expect(nextTab(items, 'c', 'Home')).toBe('a');
    expect(nextTab(items, 'a', 'End')).toBe('c');
  });
  it('salta las deshabilitadas', () => {
    expect(nextTab(items, 'a', 'ArrowRight')).toBe('c');
  });
  it('una tecla ajena devuelve null', () => {
    expect(nextTab(items, 'a', 'x')).toBeNull();
    expect(nextTab([], 'a', 'ArrowRight')).toBeNull();
  });
});

describe('Tabs', () => {
  const html = renderToStaticMarkup(createElement(Tabs<'a' | 'b' | 'c'>, { items, active: 'a', onChange: () => undefined, label: 'Secciones', idBase: 'x' }));
  it('marca la activa y enlaza con su panel', () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Secciones"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="x-panel-a"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });
  it('el panel apunta a su pestaña', () => {
    const p = renderToStaticMarkup(createElement(TabPanel, { idBase: 'x', tabKey: 'a' }, 'hola'));
    expect(p).toContain('role="tabpanel"');
    expect(p).toContain('id="x-panel-a"');
  });
});

describe('Segmented', () => {
  it('es un radiogroup con una sola opción en el orden de tabulación', () => {
    const html = renderToStaticMarkup(
      createElement(Segmented<number>, { value: 2, options: [{ value: 1, label: 'Uno' }, { value: 2, label: 'Dos' }], onChange: () => undefined, label: 'Número' }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });
});
