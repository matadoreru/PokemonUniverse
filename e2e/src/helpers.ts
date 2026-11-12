/**
 * Utilidades comunes de los E2E: tamaños de captura, errores de consola, `capture()` (PNG de
 * revisión + sin scroll horizontal ni de página + medición de encaje y legibilidad a 13 px), entrada como invitado y
 * cuentas registradas de prueba (con ADMIN promovido en la BD local).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { expect, type Browser, type BrowserContext, type Locator, type Page, type WebSocket } from '@playwright/test';
import { measureLayout } from './layout.js';

/** Tamaños de las capturas de revisión: dos de escritorio y un móvil. */
export const SIZES = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
] as const;
export const DESKTOP = SIZES.slice(0, 2);

/**
 * Nombre del `@keyframes` que tiene el elemento (`'none'` si no anima). Es determinista: lee el
 * estilo calculado, así que no depende de que la animación siga en curso.
 */
export async function animacionDe(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).animationName);
}

/**
 * Quita la reducción de movimiento que la suite fija por defecto para comprobar que la animación existe. Con el ajuste
 * «Sistema», la app quita `data-motion="reduce"` de `<html>` al recibir el cambio de `matchMedia` (E8): se espera a eso.
 */
export async function conMovimiento(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-motion'));
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

export interface CaptureOptions {
  /** Tamaño mínimo de letra que exige `measureLayout` (13 px por defecto: el mínimo de Arcade DS, spec §3.2). */
  minFontPx?: number;
  /**
   * Permite el scroll vertical de página (por defecto, `false`). Sin él, la página no se desplaza a ningún ancho
   * (`scrollHeight ≤ innerHeight`: el armazón mide 100dvh) y, en vistas de 1024 px o más, tampoco el `main` del armazón
   * (`main.scrollHeight ≤ main.clientHeight`; spec §2). Solo para páginas que se desplazan a propósito, con un
   * comentario que diga por qué.
   */
  allowPageScroll?: boolean;
  /** Captura de página completa en lugar de solo la vista (por defecto, `false`). */
  fullPage?: boolean;
}

/**
 * Captura de revisión: espera a las fuentes, comprueba que no hay scroll horizontal ni (salvo `allowPageScroll`) de
 * página, guarda el PNG en `e2e/screenshots/<name>-<w>x<h>.png` y mide encaje y legibilidad (13 px por defecto).
 * Con `PU_LAYOUT_LOG=<fichero>` solo anota los problemas (barrido sin cortar los specs).
 */
export async function capture(page: Page, name: string, opts: CaptureOptions = {}): Promise<void> {
  await checkLayout(page, name, true, opts);
}

/** Opciones de `capturarATresTamaños()`: las de `capture()` más un paso previo por tamaño y la vuelta a 1280×720. */
export interface CapturaATresTamanos extends CaptureOptions {
  /** Se ejecuta en cada tamaño tras cambiar la vista y antes de capturar (desplazar, comprobar que algo se ve…). */
  antes?: (tamano: (typeof SIZES)[number]) => Promise<void>;
  /** Se ejecuta en cada tamaño justo después de capturar. */
  despues?: (tamano: (typeof SIZES)[number]) => Promise<void>;
  /** Vuelve a 1280×720 al acabar (por defecto, `true`); con `false` la página se queda a 390×844. */
  restaurar?: boolean;
}

/** `capture()` a los tres tamaños de revisión (`SIZES`), en ese orden. */
export async function capturarATresTamaños(page: Page, name: string, { antes, despues, restaurar = true, ...opts }: CapturaATresTamanos = {}): Promise<void> {
  for (const tamano of SIZES) {
    await page.setViewportSize({ width: tamano.w, height: tamano.h });
    if (antes) await antes(tamano);
    await capture(page, name, opts);
    if (despues) await despues(tamano);
  }
  if (restaurar) await page.setViewportSize({ width: 1280, height: 720 });
}

/**
 * Lo mismo que `capture()`, sin guardar el PNG cuando `screenshot` es `false`: sin scroll
 * horizontal ni de página y `measureLayout` vacío (o anotado en `PU_LAYOUT_LOG`).
 */
export async function checkLayout(page: Page, name: string, screenshot = false, opts: CaptureOptions = {}): Promise<void> {
  const { id, problems } = await layoutProblems(page, name, screenshot, opts.fullPage ?? false, opts);
  const log = process.env.PU_LAYOUT_LOG;
  if (log) {
    if (problems.length) appendFileSync(log, `## ${id}\n${problems.map((p) => `- ${p}`).join('\n')}\n`);
    return;
  }
  expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
}

/**
 * Espera a las fuentes, guarda opcionalmente `e2e/screenshots/<name>-<w>x<h>.png` (de página completa con `fullPage`;
 * el nombre lleva el tamaño de la vista; antes de comprobar nada, para que un fallo deje imagen), exige que no haya
 * scroll horizontal ni (salvo `allowPageScroll`) vertical de página ni, en escritorio, del `main` y devuelve lo que
 * encuentra `measureLayout` sin fallar.
 */
export async function layoutProblems(page: Page, name: string, screenshot: boolean, fullPage = false, opts: CaptureOptions = {}): Promise<{ id: string; problems: string[] }> {
  const vp = page.viewportSize();
  if (!vp) throw new Error('layoutProblems: la página no tiene viewport');
  const id = `${name}-${vp.width}x${vp.height}`;
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(250);
  // La captura va antes de las comprobaciones de scroll: un fallo por scroll deja también su PNG para revisarlo.
  if (screenshot) await page.screenshot({ path: `screenshots/${id}.png`, animations: 'disabled', fullPage });
  await expectNoHorizontalScroll(page, id);
  if (!opts.allowPageScroll) {
    // El armazón mide 100dvh a cualquier ancho: si la página crece, algo (p. ej. un `sr-only` absoluto) se sale del `main`.
    const over = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight);
    expect(over, `${id}: scroll vertical de página`).toBeLessThanOrEqual(0);
  }
  if (!opts.allowPageScroll && vp.width >= 1024) {
    // El armazón es una rejilla de 100dvh: lo que no cabe se desplaza dentro de `main`, que tampoco debe desbordarse.
    const mainOver = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollHeight - main.clientHeight : 0;
    });
    expect(mainOver, `${id}: scroll vertical del main`).toBeLessThanOrEqual(0);
  }
  const minFontPx = opts.minFontPx ?? 13;
  const m = await measureLayout(page, minFontPx);
  const problems = [
    ...m.small.map((x) => `< ${minFontPx} px: ${x}`),
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
  const crear = page.getByRole('button', { name: '¡Crear sala!' });
  await expect(crear).toBeEnabled();
  await crear.click();
  await expect(page).toHaveURL(/\/room$/);
  const copiar = page.getByRole('button', { name: /Copiar enlace de la sala/ });
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

/**
 * «Terminar sesión» (resultados, votación) o «Finalizar sesión y ver clasificación» (lobby) y su confirmación: el
 * diálogo «¿Terminar la sesión?», con «Cancelar» primero y enfocado.
 */
export async function terminarSesion(page: Page, { boton = 'Terminar sesión', timeout = 15_000 }: { boton?: string; timeout?: number } = {}): Promise<void> {
  await page.getByRole('button', { name: boton, exact: true }).click({ timeout });
  const dialogo = page.getByRole('dialog', { name: '¿Terminar la sesión?' });
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialogo.getByRole('button', { name: 'Terminar sesión' }).click();
  await expect(dialogo).toHaveCount(0);
}

/** Un jugador de una sala: su contexto aislado (cookies propias), su página y sus errores. */
export interface Jugador {
  context: BrowserContext;
  page: Page;
  errors: string[];
  name: string;
  /** URLs de los WebSocket que ha abierto la página (el `/ws` de Java o el HMR de Vite). */
  websockets: string[];
  /** Los mismos WebSocket, para escuchar sus tramas desde el test. */
  sockets: WebSocket[];
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
export async function crearSalaConJugadores(browser: Browser, n: number, viewport = { width: 1280, height: 720 }, prefijos?: readonly string[]): Promise<SalaConJugadores> {
  const jugadores: Jugador[] = [];
  const cerrar = async () => { await Promise.all(jugadores.map((j) => j.context.close())); };
  try {
    for (let i = 0; i < n; i++) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const jugador: Jugador = { context, page, errors: collectErrors(page), name: uniqueName(prefijos?.[i] ?? (i === 0 ? 'Host' : `Inv${i}`)), websockets: [], sockets: [] };
      page.on('websocket', (ws) => { jugador.websockets.push(ws.url()); jugador.sockets.push(ws); });
      jugadores.push(jugador);
      await loginAsGuest(page, jugador.name);
    }
    const [host, ...invitados] = jugadores as [Jugador, ...Jugador[]];
    const code = await createRoom(host.page);
    for (const invitado of invitados) {
      await joinRoom(invitado.page, code);
      await expect(host.page.getByText(invitado.name, { exact: true }).first()).toBeVisible();
    }
    await expect(host.page.getByRole('region', { name: 'Jugadores' }).getByText(new RegExp(`^${n} / \\d+$`))).toBeVisible();
    return { code, host, invitados, jugadores, cerrar };
  } catch (error) {
    await cerrar();
    throw error;
  }
}

/**
 * ¿Se ve `locator` sin tapar? El elemento que hay en el centro de su caja es él o uno de sus hijos (no lo cubre una
 * barra fija, el compositor ni otra capa).
 */
export function sinTapar(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
}

/** Carta (su conmutador, no el «?» de las reglas) de un minijuego en la lista «Minijuegos» del lobby. */
export function cartaDeJuego(page: Page, nombre: string): Locator {
  return page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').filter({ has: page.getByText(nombre, { exact: true }) }).locator('button[aria-pressed]');
}

/**
 * Pone la carta en `elegida` (las cartas son conmutadores de una selección múltiple). Solo pulsa si hace falta y, tras
 * pulsar, espera 8 s a que el servidor lo refleje antes de volver a mirar: un servidor lento (más de 2 s) no recibe dos
 * conmutaciones, y un clic que se pierde de verdad (llegó antes de que el lobby tuviera el estado del `/ws`) se repite
 * una sola vez.
 */
export async function conmutarJuego(opcion: Locator, elegida: boolean): Promise<void> {
  const valor = String(elegida);
  for (let intento = 0; intento < 2; intento += 1) {
    if ((await opcion.getAttribute('aria-pressed')) === valor) return;
    await opcion.click();
    try {
      await expect(opcion).toHaveAttribute('aria-pressed', valor, { timeout: 8_000 });
      return;
    } catch {
      // Sigue igual tras 8 s: el clic se perdió; se vuelve a mirar y, si hace falta, a pulsar.
    }
  }
  await expect(opcion).toHaveAttribute('aria-pressed', valor, { timeout: 8_000 });
}

/**
 * En el lobby (host o co-host), deja `nombre` (nombre del manifest) como único minijuego elegido de la sesión: lo elige
 * primero y después quita los demás (así la selección no queda vacía por el camino).
 */
export async function seleccionarJuego(page: Page, nombre: string): Promise<void> {
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
  const opcion = cartaDeJuego(page, nombre);
  await expect(opcion).toHaveCount(1);
  await conmutarJuego(opcion, true);
  const lista = page.getByRole('list', { name: 'Minijuegos' });
  const otras = lista.getByRole('listitem').filter({ hasNot: page.getByText(nombre, { exact: true }) }).getByRole('button', { pressed: true });
  // Se quitan de una en una por su nombre (la lista de elegidas cambia tras cada clic).
  while ((await otras.count()) > 0) {
    const otra = (await otras.first().locator('[data-part="name"]').innerText()).trim();
    await conmutarJuego(cartaDeJuego(page, otra), false);
  }
  await expect(lista.getByRole('button', { pressed: true })).toHaveCount(1);
}

/** Añade minijuegos a la selección del lobby, en este orden, sin quitar los que ya hay. */
export async function anadirJuegos(page: Page, nombres: readonly string[]): Promise<void> {
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
  for (const nombre of nombres) await conmutarJuego(cartaDeJuego(page, nombre), true);
}

/**
 * Marca listos a los invitados, espera a que el lobby del host diga que la sala está lista y pulsa
 * «Empezar partida». No espera a que la partida arranque: el servidor aún puede rechazarla.
 */
export async function iniciarPartida(host: Page, invitados: readonly Page[]): Promise<void> {
  for (const page of invitados) {
    // Idempotente y con reintentos: tras recargar, el lobby se pinta antes de que llegue el estado propio por el `/ws`
    // (el botón puede cambiar de «Marcarme listo» a «Estoy listo» entre la lectura y el clic).
    await expect(async () => {
      const listo = page.getByRole('button', { name: /Marcarme listo|Estoy listo/ });
      await expect(listo).toBeVisible({ timeout: 2_000 });
      if ((await listo.getAttribute('aria-pressed')) !== 'true') await listo.click({ timeout: 2_000 });
      await expect(page.getByRole('button', { name: 'Estoy listo' })).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  }
  await expect(host.locator('#start-help')).toHaveText('La sala está lista.');
  await host.getByRole('button', { name: 'Empezar partida' }).click();
}

/**
 * Tras «Empezar partida», espera (15 s como máximo) a que cada página salga del lobby: el minijuego empieza al
 * momento, sin intro.
 */
export async function esperarPartida(pages: readonly Page[]): Promise<void> {
  for (const page of pages) await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeHidden({ timeout: 15_000 });
}

/**
 * Contenedor de PostgreSQL de `compose.local.yaml` (`npm run db:up`). Con otro nombre de proyecto,
 * `PU_E2E_PG_CONTAINER=<nombre>`.
 */
const PG_CONTAINER = process.env.PU_E2E_PG_CONTAINER ?? 'pokemonuniverse_postgres_1';

/** Programa de contenedores con el que se entra en él: `podman` en local; la CI pasa `PU_E2E_CONTAINER_CLI=docker`. */
const CONTAINER_CLI = process.env.PU_E2E_CONTAINER_CLI ?? 'podman';

let bdComprobada = false;

/**
 * Comprueba que el programa de contenedores existe y que el contenedor de PostgreSQL está en marcha, y falla al
 * momento con un mensaje que dice cómo arreglarlo. `psql()` la llama la primera vez; los specs que preparan
 * datos la llaman en `beforeAll`, antes de crear nada.
 */
export function comprobarBdE2E(): void {
  if (bdComprobada) return;
  try {
    execFileSync(CONTAINER_CLI, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error(`Los E2E necesitan \`${CONTAINER_CLI}\` en el PATH para preparar datos en PostgreSQL (\`npm run db:up\`; otro programa con PU_E2E_CONTAINER_CLI).`);
  }
  let estado = '';
  try {
    estado = execFileSync(CONTAINER_CLI, ['container', 'inspect', '--format', '{{.State.Running}}', PG_CONTAINER], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    /* contenedor inexistente: se informa abajo */
  }
  if (estado !== 'true') {
    throw new Error(
      `El contenedor de PostgreSQL «${PG_CONTAINER}» no está en marcha: arráncalo con \`npm run db:up\` ` +
        'o indica el tuyo con PU_E2E_PG_CONTAINER=<nombre>.',
    );
  }
  bdComprobada = true;
}

/**
 * Ejecuta SQL contra la BD local de desarrollo con `psql` dentro del contenedor (el host no necesita
 * `psql` ni el paquete `pg`) y devuelve la salida sin cabeceras. Solo para preparar y limpiar datos
 * de prueba: los valores van como variables de `psql` (`:'nombre'`), nunca concatenados.
 */
export function psql(sql: string, vars: Record<string, string> = {}): string {
  comprobarBdE2E();
  const args = ['exec', '-i', PG_CONTAINER, 'psql', '-U', 'pokemon', '-d', 'pokemon_universe', '-v', 'ON_ERROR_STOP=1', '-At'];
  for (const [name, value] of Object.entries(vars)) args.push('-v', `${name}=${value}`);
  return execFileSync(CONTAINER_CLI, args, { input: sql, encoding: 'utf8' }).trim();
}

/** Cuenta registrada de prueba: credenciales únicas por ejecución. */
export interface CuentaE2E {
  username: string;
  email: string;
  password: string;
}

/** Credenciales nuevas que cumplen el registro (usuario `[a-zA-Z0-9_]{3,24}`, contraseña ≥ 10). */
export function nuevaCuenta(prefijo: string): CuentaE2E {
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const username = `${prefijo}_${sufijo}`.slice(0, 24);
  return { username, email: `${username.toLowerCase()}@e2e.example.test`, password: 'contrasena-e2e-segura' };
}

/** Registra la cuenta por la API (la cookie de sesión queda en el contexto de `page`). */
export async function registrarPorApi(page: Page, cuenta: CuentaE2E): Promise<void> {
  const response = await page.request.post('/api/auth/register', { data: cuenta });
  expect(response.status(), `registro de ${cuenta.username}`).toBe(201);
}

/** Jugador con cuenta registrada en su propio contexto de navegador. */
export interface Persona {
  cuenta: CuentaE2E;
  context: BrowserContext;
  page: Page;
  errors: string[];
}

/**
 * Cuenta nueva (apuntada en `cuentas` antes de nada, para que el `afterAll` del spec la borre aunque falle lo demás),
 * registrada por la API en un contexto con la vista dada. Con `enJugar`, abre `/play` y espera a «¡Crear sala!».
 */
export async function persona(browser: Browser, cuentas: CuentaE2E[], prefijo: string, w: number, h: number, { enJugar = false }: { enJugar?: boolean } = {}): Promise<Persona> {
  const cuenta = nuevaCuenta(prefijo);
  cuentas.push(cuenta);
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await registrarPorApi(page, cuenta);
  if (enJugar) {
    await page.goto('/play');
    await expect(page.getByRole('button', { name: '¡Crear sala!' })).toBeEnabled();
  }
  return { cuenta, context, page, errors };
}

/**
 * Total de logros del catálogo según la API, con la sesión de `page`. El catálogo crece con cada minijuego nuevo, así
 * que los specs comparan la insignia «desbloqueados/total» con este número en vez de fijarlo.
 */
export async function totalDeLogros(page: Page): Promise<number> {
  const response = await page.request.get('/api/achievements');
  expect(response.status(), 'GET /api/achievements').toBe(200);
  return ((await response.json()) as { total: number }).total;
}

/**
 * Da el rol ADMIN a una cuenta ya registrada y vuelve a iniciar sesión con ella. Las rutas
 * `/api/admin/` releen el rol de la BD, pero `/api/auth/me` (y con él `RequireAdmin` de la web)
 * devuelve el del token, que solo cambia con un login nuevo.
 */
export async function promoverAAdmin(page: Page, cuenta: CuentaE2E): Promise<void> {
  psql(`UPDATE "User" SET role = 'ADMIN' WHERE email = :'email';`, { email: cuenta.email });
  const response = await page.request.post('/api/auth/login', { data: { identifier: cuenta.email, password: cuenta.password } });
  expect(response.status(), `login de ${cuenta.username} como ADMIN`).toBe(200);
}

/**
 * Borra las cuentas de prueba (categorías, dilemas, estadísticas y configuraciones caen en cascada;
 * el historial de salas queda sin anfitrión) y pasa a `quitarAvatar` el fichero de avatar
 * personalizado de cada una, para que el spec lo quite del almacenamiento. Cada cuenta se limpia por
 * separado: un fallo no deja las demás sin borrar, y al final se lanzan todos los fallos juntos.
 */
export function borrarCuentas(emails: readonly string[], quitarAvatar: (fichero: string) => void): void {
  const fallos: string[] = [];
  for (const email of emails) {
    try {
      const avatar = psql(`SELECT "avatarValue" FROM "User" WHERE email = :'email' AND "avatarType" = 'CUSTOM';`, { email });
      psql(`DELETE FROM "User" WHERE email = :'email';`, { email });
      if (avatar) quitarAvatar(avatar);
    } catch (error) {
      fallos.push(`${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (fallos.length > 0) throw new Error(`No se pudieron borrar ${fallos.length} cuentas de prueba:\n${fallos.join('\n')}`);
}

const MAILPIT = 'http://127.0.0.1:8025';

/**
 * Último correo recibido por `email` en Mailpit (`npm run db:up`). Reintenta hasta 10 s porque el backend
 * lo envía de forma asíncrona.
 */
export async function ultimoCorreoDe(email: string): Promise<{ subject: string; text: string }> {
  const limite = Date.now() + 10_000;
  let ultimoError = 'sin correo';
  while (Date.now() < limite) {
    try {
      const busqueda = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      const { messages } = (await busqueda.json()) as { messages?: { ID: string }[] };
      const id = messages?.[0]?.ID;
      if (id) {
        const mensaje = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Subject: string; Text: string };
        return { subject: mensaje.Subject, text: mensaje.Text };
      }
    } catch (error) {
      ultimoError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No llegó ningún correo a ${email} en 10 s (${ultimoError}). ¿Mailpit en :8025 y SMTP_HOST en el backend?`);
}

/** Abre el panel «Amigos» desde la placa de la cabecera y devuelve su diálogo. */
export async function abrirAmigos(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Amigos/ }).click();
  const panel = page.getByRole('dialog', { name: 'Amigos' });
  await expect(panel).toBeVisible();
  return panel;
}

/** Cierra el panel «Amigos» con su botón «Cerrar». */
export async function cerrarAmigos(page: Page): Promise<void> {
  const panel = page.getByRole('dialog', { name: 'Amigos' });
  await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(panel).toBeHidden();
}

/** Hace amigas a dos cuentas por la API: `pedida` recibe la solicitud de `quien` y la acepta (cada página, su sesión). */
export async function hacerAmigosPorApi(quien: { page: Page; cuenta: CuentaE2E }, pedida: { page: Page; cuenta: CuentaE2E }): Promise<void> {
  const envio = await quien.page.request.post('/api/friends/requests', { data: { username: pedida.cuenta.username } });
  expect(envio.status(), `solicitud de ${quien.cuenta.username}`).toBeLessThan(300);
  const resumen = (await (await pedida.page.request.get('/api/friends')).json()) as { incoming?: { id: string }[] };
  const id = resumen.incoming?.[0]?.id;
  if (!id) throw new Error(`no hay solicitud recibida por ${pedida.cuenta.username}: ${JSON.stringify(resumen)}`);
  const acepta = await pedida.page.request.post(`/api/friends/requests/${id}/accept`);
  expect(acepta.status(), `aceptar de ${pedida.cuenta.username}`).toBeLessThan(300);
}

/** Abre el chat del lobby: por debajo de 1024 px es la pestaña «Chat» (con su contador de sin leer); en escritorio ya está en la columna. */
export async function abrirChat(page: Page, { conCampo = true } = {}): Promise<Locator> {
  const ancho = page.viewportSize()?.width ?? 1280;
  if (ancho < 1024) {
    const pestana = page.getByRole('tab', { name: /^Chat/ });
    if ((await pestana.getAttribute('aria-selected')) !== 'true') await pestana.click();
    await expect(pestana).toHaveAttribute('aria-selected', 'true');
  }
  const campo = page.getByLabel('Escribe un mensaje');
  if (conCampo) await expect(campo).toBeVisible();
  return campo;
}

/** Escribe un mensaje en el chat del lobby (Intro) y espera a que el servidor lo confirme: el campo se vacía. */
export async function escribirEnChat(page: Page, texto: string): Promise<void> {
  const campo = await abrirChat(page);
  await campo.fill(texto);
  await campo.press('Enter');
  await expect(campo).toHaveValue('');
}

/**
 * Fija el juego del reto de hoy (fecha de Madrid) en `DailyChallenge`, para que el spec no dependa del sorteo: el juego
 * guardado manda. Si no hay fila, la crea con el catálogo vigente en el orden del servidor (número de Pokédex y, a
 * igualdad, id en orden binario, como `String.compareTo`) y su huella (SHA-256 de los ids unidos por `\n`); si ya la hay
 * (la BD de desarrollo puede tenerla con otro juego), solo cambia el juego.
 */
export function fijarJuegoDelDia(gameId: string): void {
  psql(`
    INSERT INTO "DailyChallenge" ("date", "gameId", "pokemonIds", "catalogFingerprint")
    SELECT (now() AT TIME ZONE 'Europe/Madrid')::date, :'gameId',
      coalesce(jsonb_agg("id" ORDER BY "nationalDexNumber", "id" COLLATE "C"), '[]'::jsonb),
      encode(sha256(convert_to(coalesce(string_agg("id", E'\\n' ORDER BY "nationalDexNumber", "id" COLLATE "C"), ''), 'UTF8')), 'hex')
    FROM "Pokemon"
    ON CONFLICT ("date") DO UPDATE SET "gameId" = EXCLUDED."gameId";`, { gameId });
}

/**
 * Juega Higher or Lower hasta que se ve `fin` (la pantalla de resultados): en cada ronda pulsa «Mayor» y anota la pareja
 * de Pokémon del duelo. Devuelve las parejas en orden de ronda («Anterior vs actual»).
 */
export async function jugarHigherLowerHastaElFinal(page: Page, fin: Locator, timeoutMs = 240_000): Promise<string[]> {
  const parejas = new Map<number, string>();
  const mayor = page.getByRole('button', { name: 'Mayor', exact: true });
  const nombre = (lado: 'previous' | 'current') => page.locator(`[data-hl-card="${lado}"] [data-part="name"]`).innerText({ timeout: 2_000 });
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await fin.isVisible()) return [...parejas.entries()].sort(([a], [b]) => a - b).map(([, pareja]) => pareja);
    if (await mayor.isVisible() && await mayor.isEnabled()) {
      const hud = await page.getByText(/^Ronda \d+ de \d+$/).first().innerText({ timeout: 2_000 }).catch(() => '');
      const ronda = Number(hud.match(/^Ronda (\d+)/)?.[1] ?? NaN);
      if (Number.isFinite(ronda) && !parejas.has(ronda)) parejas.set(ronda, `${await nombre('previous')} vs ${await nombre('current')}`);
      await mayor.click({ timeout: 2_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`jugarHigherLowerHastaElFinal: sin resultados en ${timeoutMs / 1000} s (rondas vistas: ${[...parejas.keys()].join(', ')})`);
}
