/**
 * Utilidades comunes de los E2E: tamaños de captura, tema, errores de consola, `capture()` (PNG de
 * revisión + sin scroll horizontal + medición de encaje y legibilidad) y entrada como invitado.
 */
import { appendFileSync } from 'node:fs';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { measureLayout } from './layout.js';

/** Tamaños de las capturas de revisión: dos de escritorio y un móvil. */
export const SIZES = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
] as const;
export const DESKTOP = SIZES.slice(0, 2);

export type Theme = 'dark' | 'light';

/** Fija el tema antes de que cargue la página (`index.html` lo lee de `localStorage`). */
export async function pinTheme(context: BrowserContext, theme: Theme): Promise<void> {
  await context.addInitScript((t) => localStorage.setItem('pokemon-universe-theme', t), theme);
}

/**
 * Mensajes exactos de herramientas (no de la app) que se permiten en consola. Cada entrada lleva
 * el motivo. Vacía mientras la línea base no muestre ninguno.
 */
const ALLOWED_CONSOLE_ERRORS: readonly string[] = [];

/** Errores de página y de consola que salen durante la prueba. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ALLOWED_CONSOLE_ERRORS.includes(m.text())) errors.push(m.text());
  });
  return errors;
}

/** La página no se desborda en horizontal (el scroll vertical sí está permitido). */
export async function expectNoHorizontalScroll(page: Page, name: string): Promise<void> {
  const over = await page.evaluate(() => {
    const vw = window.innerWidth;
    return Math.max(document.documentElement.scrollWidth - vw, document.body.scrollWidth - vw);
  });
  expect(over, `${name}: scroll horizontal de página`).toBeLessThanOrEqual(0);
}

/**
 * Captura de revisión: espera a las fuentes, comprueba que no hay scroll horizontal, guarda el PNG
 * en `e2e/screenshots/<name>-<w>x<h>.png` y mide encaje y legibilidad.
 * Con `PU_LAYOUT_LOG=<fichero>` solo anota los problemas (barrido sin cortar los specs).
 */
export async function capture(page: Page, name: string): Promise<void> {
  const vp = page.viewportSize();
  if (!vp) throw new Error('capture: la página no tiene viewport');
  const id = `${name}-${vp.width}x${vp.height}`;
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(250);
  await expectNoHorizontalScroll(page, id);
  await page.screenshot({ path: `screenshots/${id}.png`, animations: 'disabled' });
  const m = await measureLayout(page);
  const problems = [
    ...m.small.map((x) => `< 12 px: ${x}`),
    ...m.overlaps.map((x) => `solape: ${x}`),
    ...m.cuts.map((x) => `recorte sin title: ${x}`),
    ...m.clipped.map((x) => `fuera de su caja: ${x}`),
  ];
  const log = process.env.PU_LAYOUT_LOG;
  if (log) {
    if (problems.length) appendFileSync(log, `## ${id}\n${problems.map((p) => `- ${p}`).join('\n')}\n`);
    return;
  }
  expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
}

/** Entra como invitado con un nombre temporal y espera a llegar a `/play`. */
export async function loginAsGuest(page: Page, name: string): Promise<void> {
  await page.goto('/auth?mode=guest');
  await page.getByLabel('Tu nombre temporal').fill(name);
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(page).toHaveURL(/\/play$/);
}

/** Nombre único y corto (≤ 24 caracteres, solo letras, números y espacios). */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36).slice(-4)}`;
}
