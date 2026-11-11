import { describe, expect, it, vi } from 'vitest';
import { bindShortcuts, controlTarget, shortcutKey, typingTarget } from './shortcuts';

/** Un elemento con foco mínimo (sin DOM en los tests): la etiqueta, el tipo de `input` y los atributos. */
function element(tagName: string, { type, attributes = {}, isContentEditable }: { type?: string; attributes?: Record<string, string>; isContentEditable?: boolean } = {}) {
  return { tagName, ...(type ? { type } : {}), ...(isContentEditable === undefined ? {} : { isContentEditable }), getAttribute: (name: string) => attributes[name] ?? null };
}

describe('atajos: ¿se está escribiendo?', () => {
  it('los campos de texto, textarea, select y lo editable apagan los atajos', () => {
    for (const type of ['text', 'search', 'number', 'email', 'password', 'date']) expect(typingTarget(element('INPUT', { type })), type).toBe(true);
    expect(typingTarget(element('INPUT')), 'input sin tipo').toBe(true);
    expect(typingTarget(element('TEXTAREA'))).toBe(true);
    expect(typingTarget(element('SELECT'))).toBe(true);
    for (const value of ['', 'true', 'plaintext-only']) expect(typingTarget(element('DIV', { attributes: { contenteditable: value } })), `contenteditable="${value}"`).toBe(true);
    expect(typingTarget(element('SPAN', { isContentEditable: true })), 'editable heredado').toBe(true);
  });

  it('las casillas, radios, deslizadores y botones de input no son campos de texto', () => {
    for (const type of ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image']) expect(typingTarget(element('INPUT', { type })), type).toBe(false);
    expect(typingTarget(element('BUTTON'))).toBe(false);
    expect(typingTarget(element('A', { attributes: { href: '/' } }))).toBe(false);
    expect(typingTarget(element('DIV', { attributes: { contenteditable: 'false' } }))).toBe(false);
    expect(typingTarget(null)).toBe(false);
    expect(typingTarget({})).toBe(false);
  });

  it('los controles que activan Intro y Espacio; un título con foco no lo es', () => {
    for (const tag of ['BUTTON', 'SUMMARY', 'SELECT', 'TEXTAREA']) expect(controlTarget(element(tag)), tag).toBe(true);
    expect(controlTarget(element('INPUT', { type: 'checkbox' }))).toBe(true);
    expect(controlTarget(element('A', { attributes: { href: '/' } }))).toBe(true);
    expect(controlTarget(element('DIV', { attributes: { role: 'button' } }))).toBe(true);
    expect(controlTarget(element('A')), 'enlace sin href').toBe(false);
    expect(controlTarget(element('H2', { attributes: { tabindex: '-1' } }))).toBe(false);
    expect(controlTarget(element('BODY'))).toBe(false);
  });
});

describe('atajos: qué tecla cuenta', () => {
  it('con el foco en un campo de texto se ignora', () => {
    expect(shortcutKey({ key: '1', target: element('INPUT', { type: 'text' }) })).toBeNull();
    expect(shortcutKey({ key: 'a', target: element('TEXTAREA') })).toBeNull();
    expect(shortcutKey({ key: 'Enter', target: element('INPUT', { type: 'search' }) })).toBeNull();
  });

  it('con el foco en una casilla, los números y las letras sí cuentan; Espacio e Intro la activan', () => {
    const checkbox = element('INPUT', { type: 'checkbox' });
    expect(shortcutKey({ key: '2', target: checkbox })).toBe('2');
    expect(shortcutKey({ key: 'b', target: checkbox })).toBe('b');
    expect(shortcutKey({ key: ' ', target: checkbox })).toBeNull();
    expect(shortcutKey({ key: 'Enter', target: checkbox })).toBeNull();
  });

  it('con el foco en un botón o un enlace, los números funcionan; Intro y Espacio no se interceptan', () => {
    for (const target of [element('BUTTON'), element('A', { attributes: { href: '/' } })]) {
      expect(shortcutKey({ key: '3', target })).toBe('3');
      expect(shortcutKey({ key: 'Enter', target })).toBeNull();
      expect(shortcutKey({ key: ' ', target })).toBeNull();
    }
  });

  it('Intro con el foco en el título de la placa o en el body sí cuenta', () => {
    expect(shortcutKey({ key: 'Enter', target: element('H2', { attributes: { tabindex: '-1' } }) })).toBe('Enter');
    expect(shortcutKey({ key: 'Enter', target: element('BODY') })).toBe('Enter');
    expect(shortcutKey({ key: 'Enter' })).toBe('Enter');
  });

  it('con el foco dentro de un diálogo abierto, nada (la pantalla de debajo no recibe atajos)', () => {
    const inDialog = { ...element('BUTTON'), closest: (selector: string) => selector === 'dialog[open]' ? {} : null };
    const outside = { ...element('BODY'), closest: () => null };
    expect(shortcutKey({ key: '1', target: inDialog })).toBeNull();
    expect(shortcutKey({ key: '?', target: inDialog })).toBeNull();
    expect(shortcutKey({ key: '1', target: outside })).toBe('1');
  });

  it('con Ctrl, Alt o Meta, con la tecla mantenida o ya atendida, nada', () => {
    expect(shortcutKey({ key: '1', ctrlKey: true })).toBeNull();
    expect(shortcutKey({ key: '1', altKey: true })).toBeNull();
    expect(shortcutKey({ key: '1', metaKey: true })).toBeNull();
    expect(shortcutKey({ key: '1', repeat: true })).toBeNull();
    expect(shortcutKey({ key: '1', defaultPrevented: true })).toBeNull();
  });
});

describe('atajos: escucha', () => {
  function target() {
    const listeners = new Set<(event: KeyboardEvent) => void>();
    return {
      listeners,
      addEventListener: (_: 'keydown', listener: (event: KeyboardEvent) => void) => { listeners.add(listener); },
      removeEventListener: (_: 'keydown', listener: (event: KeyboardEvent) => void) => { listeners.delete(listener); },
      press(key: string, extra: Record<string, unknown> = {}) {
        const event = { key, preventDefault: vi.fn(), ...extra } as unknown as KeyboardEvent;
        for (const listener of listeners) listener(event);
        return event;
      },
    };
  }

  it('preventDefault solo en lo atendido; Intro sobre un botón ni llega ni se intercepta', () => {
    const t = target();
    const keys: string[] = [];
    const unbind = bindShortcuts(t, (key) => {
      keys.push(key);
      return key === '1' || key === 'Enter';
    });
    expect(t.press('1', { target: element('BUTTON') }).preventDefault).toHaveBeenCalled();
    expect(t.press('x').preventDefault).not.toHaveBeenCalled();
    expect(t.press('Enter', { target: element('BUTTON') }).preventDefault).not.toHaveBeenCalled();
    expect(t.press('Enter', { target: element('BODY') }).preventDefault).toHaveBeenCalled();
    expect(keys).toEqual(['1', 'x', 'Enter']);
    unbind();
    expect(t.listeners.size).toBe(0);
  });
});
