/**
 * Utilidades comunes de los E2E: tamaños de captura, tema, errores de consola, `capture()` (PNG de
 * revisión + sin scroll horizontal + medición de encaje y legibilidad) y entrada como invitado.
 */
import { appendFileSync } from 'node:fs';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
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
  await checkLayout(page, name, true);
}

/**
 * Lo mismo que `capture()`, sin guardar el PNG cuando `screenshot` es `false`: sin scroll
 * horizontal y `measureLayout` vacío (o anotado en `PU_LAYOUT_LOG`).
 */
export async function checkLayout(page: Page, name: string, screenshot = false): Promise<void> {
  const { id, problems } = await layoutProblems(page, name, screenshot);
  const log = process.env.PU_LAYOUT_LOG;
  if (log) {
    if (problems.length) appendFileSync(log, `## ${id}\n${problems.map((p) => `- ${p}`).join('\n')}\n`);
    return;
  }
  expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
}

/**
 * Espera a las fuentes, exige que no haya scroll horizontal, guarda opcionalmente
 * `e2e/screenshots/<name>-<w>x<h>.png` y devuelve lo que encuentra `measureLayout` sin fallar.
 */
export async function layoutProblems(page: Page, name: string, screenshot: boolean): Promise<{ id: string; problems: string[] }> {
  const vp = page.viewportSize();
  if (!vp) throw new Error('layoutProblems: la página no tiene viewport');
  const id = `${name}-${vp.width}x${vp.height}`;
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(250);
  await expectNoHorizontalScroll(page, id);
  if (screenshot) await page.screenshot({ path: `screenshots/${id}.png`, animations: 'disabled' });
  const m = await measureLayout(page);
  const problems = [
    ...m.small.map((x) => `< 12 px: ${x}`),
    ...m.overlaps.map((x) => `solape: ${x}`),
    ...m.cuts.map((x) => `recorte sin title: ${x}`),
    ...m.clipped.map((x) => `fuera de su caja: ${x}`),
  ];
  return { id, problems };
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

/**
 * En `/play`, crea una sala privada y devuelve su código. Espera a que el botón se habilite
 * (lo está solo cuando el socket ya ha conectado).
 */
export async function createRoom(page: Page): Promise<string> {
  const crear = page.getByRole('button', { name: 'Crear sala privada' });
  await expect(crear).toBeEnabled();
  await crear.click();
  await expect(page).toHaveURL(/\/room$/);
  const copiar = page.getByRole('button', { name: /Copiar código de sala/ });
  await expect(copiar).toBeVisible();
  const label = (await copiar.getAttribute('aria-label')) ?? '';
  const code = label.match(/([A-Z2-9]{6})$/)?.[1];
  if (!code) throw new Error(`createRoom: no se encuentra el código en «${label}»`);
  return code;
}

/** En `/play`, se une a la sala con ese código y espera a llegar a `/room`. */
export async function joinRoom(page: Page, code: string): Promise<void> {
  await page.locator('#room-code').fill(code);
  const unirse = page.getByRole('button', { name: 'Unirse a la sala' });
  await expect(unirse).toBeEnabled();
  await unirse.click();
  await expect(page).toHaveURL(/\/room$/);
}

/** Un jugador de una sala: su contexto aislado (cookies propias), su página y sus errores. */
export interface Jugador {
  context: BrowserContext;
  page: Page;
  errors: string[];
  name: string;
  /** URLs de los WebSocket que ha abierto la página (Socket.IO, `/ws` de Java o el HMR de Vite). */
  websockets: string[];
}

/** Sala con `n` jugadores: el primero es el host y el resto se ha unido por código. */
export interface SalaConJugadores {
  code: string;
  host: Jugador;
  invitados: Jugador[];
  jugadores: Jugador[];
  /** Cierra todos los contextos abiertos (también los de un arranque fallido). */
  cerrar(): Promise<void>;
}

/**
 * Abre `n` contextos de navegador, entra como invitado en cada uno, el primero crea una sala
 * privada y los demás se unen con su código. Espera a que el host vea a todos en la lista.
 */
export async function crearSalaConJugadores(browser: Browser, n: number, viewport = { width: 1280, height: 720 }): Promise<SalaConJugadores> {
  const jugadores: Jugador[] = [];
  const cerrar = async () => { await Promise.all(jugadores.map((j) => j.context.close())); };
  try {
    for (let i = 0; i < n; i++) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const jugador: Jugador = { context, page, errors: collectErrors(page), name: uniqueName(i === 0 ? 'Host' : `Inv${i}`), websockets: [] };
      page.on('websocket', (ws) => jugador.websockets.push(ws.url()));
      jugadores.push(jugador);
      await loginAsGuest(page, jugador.name);
    }
    const [host, ...invitados] = jugadores as [Jugador, ...Jugador[]];
    const code = await createRoom(host.page);
    for (const invitado of invitados) {
      await joinRoom(invitado.page, code);
      await expect(host.page.getByText(invitado.name, { exact: true }).first()).toBeVisible();
    }
    await expect(host.page.locator('.chip').filter({ hasText: new RegExp(`^\\s*${n}\\s*/`) })).toBeVisible();
    return { code, host, invitados, jugadores, cerrar };
  } catch (error) {
    await cerrar();
    throw error;
  }
}

/** En el lobby (host o co-host), elige el minijuego por su nombre del manifest. */
export async function seleccionarJuego(page: Page, nombre: string): Promise<void> {
  const opcion = page.locator('.lobby-game-option').filter({ has: page.locator('strong').getByText(nombre, { exact: true }) });
  await expect(opcion).toHaveCount(1);
  await opcion.click();
  await expect(opcion).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Marca listos a los invitados, espera a que el lobby del host diga que la sala está lista y pulsa
 * «Empezar partida». No espera a que la partida arranque: el servidor aún puede rechazarla.
 */
export async function iniciarPartida(host: Page, invitados: readonly Page[]): Promise<void> {
  for (const page of invitados) {
    const listo = page.getByRole('button', { name: /Marcarme listo|Estoy listo/ });
    if ((await listo.getAttribute('aria-pressed')) !== 'true') await listo.click();
    await expect(page.getByRole('button', { name: 'Estoy listo' })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(host.locator('#start-help')).toHaveText('La sala está lista.');
  await host.getByRole('button', { name: 'Empezar partida' }).click();
}
