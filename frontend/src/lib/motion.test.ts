/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { display } from '../preferences/display';
import { applyMotion, installMotion, prefersReducedMotion, reducedMotionFor } from './motion';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

describe('un solo dueño del movimiento reducido (E8)', () => {
  const all = files(src);
  it('ninguna hoja usa @media (prefers-reduced-motion): todas miran :root[data-motion="reduce"]', () => {
    const sueltas = all.filter((f) => f.endsWith('.css') && /prefers-reduced-motion/.test(readFileSync(f, 'utf8')));
    expect(sueltas.map((f) => path.relative(src, f))).toEqual([]);
  });
  it('fuera de lib/motion.ts ningún código pregunta por prefers-reduced-motion ni usa motion-safe/motion-reduce de Tailwind', () => {
    const propio = path.join(here, 'motion.ts');
    const sueltos = all.filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== propio)
      .filter((f) => /prefers-reduced-motion|\bmotion-(?:safe|reduce):/.test(readFileSync(f, 'utf8')));
    expect(sueltos.map((f) => path.relative(src, f))).toEqual([]);
  });
});

/** `<html>` de mentira: solo los atributos. */
function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => { attrs.set(k, v); },
    removeAttribute: (k: string) => { attrs.delete(k); },
  } as unknown as HTMLElement & { attrs: Map<string, string> };
}

/** `matchMedia` del sistema que se puede cambiar en la prueba, con su evento `change`. */
function fakeSystem(reduced: boolean) {
  const listeners = new Set<() => void>();
  const query = { matches: reduced, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  vi.stubGlobal('window', { matchMedia: () => query });
  return { set(value: boolean) { query.matches = value; for (const fn of listeners) fn(); }, listeners };
}

describe('ajuste de movimiento', () => {
  afterEach(() => {
    display.update({ motion: 'system' });
    vi.unstubAllGlobals();
  });

  it('Reducido siempre reduce, Completo nunca y Sistema sigue al sistema', () => {
    expect(reducedMotionFor('reduce', false)).toBe(true);
    expect(reducedMotionFor('full', true)).toBe(false);
    expect(reducedMotionFor('system', true)).toBe(true);
    expect(reducedMotionFor('system', false)).toBe(false);
  });

  it('sin matchMedia (pruebas, SSR) el sistema cuenta como no reducido', () => {
    expect(prefersReducedMotion()).toBe(false);
    display.update({ motion: 'reduce' });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('data-motion="reduce" en <html> sigue al sistema en Sistema y al ajuste en los otros dos', () => {
    const system = fakeSystem(true);
    const root = fakeRoot();
    const dispose = installMotion(root);
    expect(root.attrs.get('data-motion')).toBe('reduce');
    // El sistema deja de reducir (como `emulateMedia` en los e2e): se quita al momento.
    system.set(false);
    expect(root.attrs.has('data-motion')).toBe(false);
    display.update({ motion: 'reduce' });
    expect(root.attrs.get('data-motion')).toBe('reduce');
    system.set(true);
    display.update({ motion: 'full' });
    expect(root.attrs.has('data-motion')).toBe(false);
    dispose();
    expect(system.listeners.size).toBe(0);
    display.update({ motion: 'reduce' });
    expect(root.attrs.has('data-motion')).toBe(false);
  });

  it('applyMotion pone y quita el atributo', () => {
    const root = fakeRoot();
    applyMotion(root, true);
    expect(root.attrs.get('data-motion')).toBe('reduce');
    applyMotion(root, false);
    expect(root.attrs.size).toBe(0);
  });
});
