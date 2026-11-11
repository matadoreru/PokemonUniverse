import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { keyLabel, shortcutEntries, type ShortcutSource } from './shortcut-help';
import { ShortcutList } from './ShortcutList';

function control(attributes: Record<string, string>, { text = '', visible = true } = {}): ShortcutSource {
  return { getAttribute: (name) => attributes[name] ?? null, textContent: text, visible };
}

describe('ayuda de atajos', () => {
  it('una fila por control visible (también los deshabilitados), con su nombre accesible o su texto', () => {
    expect(shortcutEntries([
      control({ 'aria-keyshortcuts': 'A 1', 'aria-label': 'Opción A: Pikachu' }),
      control({ 'aria-keyshortcuts': 'Enter' }, { text: '  Confirmar\n voto ' }),
      control({ 'aria-keyshortcuts': '2', 'aria-label': 'Oculta' }, { visible: false }),
      control({ 'aria-keyshortcuts': '3', 'aria-label': 'Confirmar' }),
      control({ 'aria-keyshortcuts': '', 'aria-label': 'Sin teclas' }),
      control({ 'aria-keyshortcuts': 'A 1', 'aria-label': 'Opción A: Pikachu' }),
    ])).toEqual([
      { keys: ['A', '1'], label: 'Opción A: Pikachu' },
      { keys: ['Enter'], label: 'Confirmar voto' },
      { keys: ['3'], label: 'Confirmar' },
    ]);
  });

  it('las teclas con nombre se escriben en español', () => {
    expect(keyLabel('Enter')).toBe('Intro');
    expect(keyLabel(' ')).toBe('Espacio');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('a')).toBe('A');
    expect(keyLabel('?')).toBe('?');
  });

  it('la lista pinta cada tecla como <kbd>, «o» entre alternativas y la propia «?» al final', () => {
    const html = renderToStaticMarkup(createElement(ShortcutList, { entries: [{ keys: ['A', '1'], label: 'Opción A' }, { keys: ['Enter'], label: 'Confirmar' }] }));
    expect(html.match(/<kbd/g)).toHaveLength(4);
    expect(html).toContain('>o<');
    expect(html).toContain('>Intro</kbd>');
    expect(html).toMatch(/>\?<\/kbd>.*Esta ayuda/);
    expect(html).toContain('aria-label="Atajos de esta pantalla"');
  });
});
