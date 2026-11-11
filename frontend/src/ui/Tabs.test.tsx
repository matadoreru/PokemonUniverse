import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Segmented, type SegmentedProps } from './Segmented';
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
    expect(p).not.toContain('hidden');
  });
  it('un panel inactivo puede quedarse montado y oculto', () => {
    expect(renderToStaticMarkup(createElement(TabPanel, { idBase: 'x', tabKey: 'b', hidden: true }, 'hola'))).toContain('hidden=""');
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
  const options = [{ value: 1, label: 'Uno' }, { value: 2, label: 'Dos' }];
  const render = (props: Partial<SegmentedProps<number>>) => renderToStaticMarkup(
    createElement(Segmented<number>, { value: 2, options, onChange: () => undefined, label: 'Número', className: 'extra', ...props }),
  );
  it('sin etiqueta visible ni ayuda es el grupo solo, con su nombre en aria-label y la clase en él', () => {
    const html = render({});
    expect(html).toMatch(/^<div class="[^"]*extra[^"]*" role="radiogroup" aria-label="Número">/);
    expect(html).not.toContain('aria-labelledby');
    expect(html).not.toContain('aria-describedby');
  });
  it('con etiqueta visible, el grupo se nombra con ella y la clase va en el envoltorio', () => {
    const html = render({ showLabel: true });
    const id = /<span id="([^"]+)"[^>]*>Número<\/span>/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(/^<div class="[^"]*extra[^"]*"><span/);
    expect(html).toContain(`role="radiogroup" aria-labelledby="${id}"`);
    expect(html).not.toContain('aria-label="Número"');
    expect(html).not.toContain('aria-describedby');
  });
  it('la ayuda queda debajo y el grupo la lee como descripción', () => {
    const html = render({ showLabel: true, hint: 'Elige uno.' });
    const id = /<p id="([^"]+)"[^>]*>Elige uno\.<\/p>/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`aria-describedby="${id}"`);
  });
  it('con ayuda y sin etiqueta visible conserva aria-label', () => {
    const html = render({ hint: 'Elige uno.' });
    expect(html).toContain('role="radiogroup" aria-label="Número" aria-describedby=');
  });
});
