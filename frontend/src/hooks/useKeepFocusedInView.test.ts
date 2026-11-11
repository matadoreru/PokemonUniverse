import { describe, expect, it } from 'vitest';
import { isTextEntry, KEYBOARD_MIN_INSET, keyboardViewportHeight } from './useKeepFocusedInView';

/** Elemento mínimo con lo que lee `isTextEntry` (los tests van sin DOM). */
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as Element;

describe('isTextEntry', () => {
  it('cuenta los campos que abren el teclado', () => {
    expect(isTextEntry(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTextEntry(el('INPUT', { type: 'search' }))).toBe(true);
    expect(isTextEntry(el('INPUT', { type: 'number' }))).toBe(true);
    expect(isTextEntry(el('TEXTAREA'))).toBe(true);
    expect(isTextEntry(el('DIV', { isContentEditable: true }))).toBe(true);
  });
  it('descarta botones, casillas, deslizadores y campos deshabilitados o de solo lectura', () => {
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry(el('BUTTON'))).toBe(false);
    expect(isTextEntry(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTextEntry(el('INPUT', { type: 'range' }))).toBe(false);
    expect(isTextEntry(el('INPUT', { type: 'text', disabled: true }))).toBe(false);
    expect(isTextEntry(el('TEXTAREA', { readOnly: true }))).toBe(false);
    expect(isTextEntry(el('DIV'))).toBe(false);
  });
});

describe('keyboardViewportHeight', () => {
  const base = { layoutHeight: 844, visualHeight: 844, scale: 1, editing: true };
  it('escritorio y Android (la vista entera encoge): no toca el alto', () => {
    expect(keyboardViewportHeight(base)).toBeNull();
    expect(keyboardViewportHeight({ ...base, layoutHeight: 500, visualHeight: 500 })).toBeNull();
  });
  it('iOS con el teclado abierto: la app mide lo visible', () => {
    expect(keyboardViewportHeight({ ...base, visualHeight: 520.4 })).toBe(520);
  });
  it('la barra del navegador o un zoom con dos dedos no cuentan como teclado', () => {
    expect(keyboardViewportHeight({ ...base, visualHeight: 844 - KEYBOARD_MIN_INSET + 1 })).toBeNull();
    expect(keyboardViewportHeight({ ...base, visualHeight: 400, scale: 2 })).toBeNull();
  });
  it('sin un campo enfocado, nunca', () => {
    expect(keyboardViewportHeight({ ...base, visualHeight: 400, editing: false })).toBeNull();
  });
});
