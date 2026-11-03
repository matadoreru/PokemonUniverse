import { describe, expect, it } from 'vitest';
import { routeFocusStep } from './ScreenTransition';

describe('routeFocusStep', () => {
  it('lleva el foco al h1 de la pantalla nueva si la pantalla no lo ha puesto en otro sitio', () => {
    expect(routeFocusStep({ focused: null, activeInside: false, activeIsBody: false })).toBe('focus');
    expect(routeFocusStep({ focused: null, activeInside: false, activeIsBody: true })).toBe('focus');
  });

  it('respeta el foco que la pantalla ya ha puesto en uno de sus campos', () => {
    expect(routeFocusStep({ focused: null, activeInside: true, activeIsBody: false })).toBe('stop');
  });

  it('mientras el h1 enfocado sigue en la página, solo vigila', () => {
    expect(routeFocusStep({ focused: { isConnected: true }, activeInside: false, activeIsBody: false })).toBe('wait');
  });

  it('si el h1 de carga desaparece y el foco cae al body, enfoca el nuevo; si el foco está en otro sitio, para', () => {
    expect(routeFocusStep({ focused: { isConnected: false }, activeInside: false, activeIsBody: true })).toBe('focus');
    expect(routeFocusStep({ focused: { isConnected: false }, activeInside: true, activeIsBody: false })).toBe('stop');
  });
});
