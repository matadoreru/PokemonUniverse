/**
 * Reto diario de punta a punta (`npm run ui:check -- reto-diario`): el juego de hoy se fija en la BD a Higher or Lower
 * (`fijarJuegoDelDia`), así que el spec no depende del sorteo. A juega desde el panel de Jugar hasta los resultados del
 * reto (clasificación y «Compartir»); B, en otro contexto, juega el mismo reto con las mismas parejas; C empieza y
 * abandona; A abre `/daily`; un invitado ve el panel bloqueado. Al final, la BD tiene un intento por cuenta y ninguna
 * partida normal. Cuentas nuevas por tamaño (un intento por cuenta y día), borradas al terminar cada prueba.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { borrarCuentas, capture, checkLayout, collectErrors, comprobarBdE2E, createRoom, DESKTOP, fijarJuegoDelDia, jugarHigherLowerHastaElFinal, loginAsGuest, nuevaCuenta, psql, registrarPorApi, SIZES, uniqueName, type CuentaE2E } from '../src/helpers.js';

const JUEGO = 'Higher or Lower';
const cuentas: CuentaE2E[] = [];

test.beforeAll(() => {
  comprobarBdE2E();
  fijarJuegoDelDia('higher-lower');
});

test.afterAll(() => {
  // Red de seguridad: cada prueba ya borra sus cuentas (sus filas de DailyResult caen en cascada).
  borrarCuentas(cuentas.map((c) => c.email), () => undefined);
});

interface Sesion { page: Page; errors: string[]; cerrar(): Promise<void> }

async function abrir(browser: Browser, viewport: { width: number; height: number }): Promise<Sesion> {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  return { page, errors: collectErrors(page), cerrar: () => context.close() };
}

async function conCuenta(browser: Browser, viewport: { width: number; height: number }, prefijo: string): Promise<Sesion & { cuenta: CuentaE2E }> {
  const cuenta = nuevaCuenta(prefijo);
  cuentas.push(cuenta);
  const sesion = await abrir(browser, viewport);
  await registrarPorApi(sesion.page, cuenta);
  return { ...sesion, cuenta };
}

const panel = (page: Page) => page.getByRole('region', { name: 'Reto diario' });
const titulo = (page: Page) => page.getByRole('heading', { name: `Reto diario · ${JUEGO}` });
/** El cuerpo con scroll de «Clasificación de hoy» (la sección y su cuerpo llevan el mismo nombre). */
const clasificacion = (page: Page) => page.getByRole('region', { name: 'Clasificación de hoy' }).last();
const filas = (page: Page) => clasificacion(page).getByText(/ pts$/);
/** La fila propia: el nombre entero y el chip «Tú» en la meta (no se recorta y no es solo el color). */
const filaPropia = (page: Page, nombre: string) => clasificacion(page).locator('div')
  .filter({ has: page.getByText(nombre, { exact: true }) }).filter({ has: page.getByText('Tú', { exact: true }) }).last();

/** En Jugar, pulsa «Jugar» del reto y espera la partida: sin lobby y con la placa «Reto diario». */
async function empezarReto(page: Page): Promise<void> {
  await page.goto('/play');
  const jugar = panel(page).getByRole('button', { name: 'Jugar', exact: true });
  await expect(jugar).toBeEnabled();
  await jugar.click();
  await expect(page).toHaveURL(/\/room$/);
  await expect(page.getByRole('button', { name: 'Mayor', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toHaveCount(0);
  // La placa lleva «Reto diario» (a menos de 640 px oculta el texto de toda placa y deja solo «Salir»).
  await expect(page.getByText('Reto diario', { exact: true }).first()).toBeAttached();
  await expect(page.getByRole('button', { name: /Copiar código de sala/ })).toHaveCount(0);
}

function finishedHoy(): number {
  return Number(psql(`SELECT count(*) FROM "DailyResult" WHERE "date" = (now() AT TIME ZONE 'Europe/Madrid')::date AND status = 'FINISHED';`));
}

for (const { w, h } of SIZES) {
  test(`reto diario: Jugar, partida, resultados, abandono y /daily (${w}×${h})`, async ({ browser }) => {
    test.setTimeout(420_000);
    const viewport = { width: w, height: h };
    const sesiones: Sesion[] = [];
    const propias: CuentaE2E[] = [];
    try {
      // 1. A ve el panel con una sola franja, «Hoy toca» Higher or Lower, en «Jugar».
      const a = await conCuenta(browser, viewport, 'retoa');
      sesiones.push(a); propias.push(a.cuenta);
      await a.page.goto('/play');
      await expect(panel(a.page).getByText('Hoy toca', { exact: true })).toHaveCount(1);
      await expect(panel(a.page).getByText(JUEGO, { exact: true })).toBeVisible();
      await expect(panel(a.page).getByText(/(han jugado hoy|ha jugado hoy|Nadie ha jugado todavía)$/)).toBeVisible();
      await expect(panel(a.page).getByText(/^Nuevo reto en /)).toBeVisible();
      await expect(panel(a.page).getByRole('button', { name: 'Jugar', exact: true })).toBeEnabled();
      await capture(a.page, 'reto-diario-jugar');

      // 2. A juega hasta el final: resultados del reto con su fila en la clasificación y «Compartir» al portapapeles.
      const antes = finishedHoy();
      await empezarReto(a.page);
      await capture(a.page, 'reto-diario-partida');
      const parejasA = await jugarHigherLowerHastaElFinal(a.page, titulo(a.page));
      expect(parejasA).toHaveLength(10);
      await expect(a.page.getByText(/^\d+\/10 aciertos?$/)).toBeVisible();
      // Cada respuesta llegó al servidor: ninguna ronda sin responder (⌛) y ningún aviso de acción rechazada.
      await expect(a.page.getByText(/^[✅❌]{10}$/u)).toBeVisible();
      await expect(a.page.getByText('No hay un minijuego activo.')).toHaveCount(0);
      // «Guardando tu resultado…» se resuelve sola: llega la fila propia.
      await expect(filaPropia(a.page, a.cuenta.username)).toBeVisible({ timeout: 30_000 });
      await expect(clasificacion(a.page).getByText('Guardando tu resultado…')).toHaveCount(0);
      await expect(filas(a.page)).toHaveCount(antes + 1);
      await capture(a.page, 'reto-diario-resultado');
      await a.page.getByRole('button', { name: 'Compartir' }).click();
      await expect(a.page.getByRole('status').filter({ hasText: 'Resultado copiado' })).toBeVisible();
      const copiado = await a.page.evaluate(() => navigator.clipboard.readText());
      expect(copiado).toContain(`📈 ${JUEGO}`);

      // 3. B juega el mismo reto en otro contexto: las mismas parejas y una fila más en la clasificación.
      const b = await conCuenta(browser, viewport, 'retob');
      sesiones.push(b); propias.push(b.cuenta);
      await empezarReto(b.page);
      const parejasB = await jugarHigherLowerHastaElFinal(b.page, titulo(b.page));
      expect(parejasB).toEqual(parejasA);
      await expect(b.page.getByText(/^[✅❌]{10}$/u)).toBeVisible();
      await expect(filaPropia(b.page, b.cuenta.username)).toBeVisible({ timeout: 30_000 });
      await expect(clasificacion(b.page).getByText(a.cuenta.username, { exact: true })).toBeVisible();
      await expect(filas(b.page)).toHaveCount(antes + 2);

      // A vuelve a Jugar: la sala del reto se cierra y la franja muestra su resultado y «Ver resultado».
      await a.page.getByRole('button', { name: 'Volver a Jugar' }).click();
      await expect(a.page).toHaveURL(/\/play$/);
      await expect(panel(a.page).getByText(/ pts · \d+\.º de \d+$/)).toBeVisible();
      await expect(panel(a.page).getByRole('button', { name: 'Jugar', exact: true })).toHaveCount(0);
      await capture(a.page, 'reto-diario-terminado');

      // 4. C empieza, sale con «Abandonar el reto» y confirma: en Jugar, «Abandonado» y sin «Jugar».
      const c = await conCuenta(browser, viewport, 'retoc');
      sesiones.push(c); propias.push(c.cuenta);
      await empezarReto(c.page);
      await c.page.getByRole('button', { name: 'Salir de la sala' }).click();
      const dialogo = c.page.getByRole('dialog', { name: '¿Abandonar el reto?' });
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByText(/cuenta como jugado y no entrarás en la clasificación/)).toBeVisible();
      await dialogo.getByRole('button', { name: 'Abandonar el reto' }).click();
      await expect(c.page).toHaveURL(/\/play$/, { timeout: 15_000 });
      await expect(panel(c.page).getByText('Abandonado', { exact: true })).toBeVisible();
      await expect(panel(c.page).getByRole('button', { name: 'Jugar', exact: true })).toHaveCount(0);
      await expect(panel(c.page).getByRole('link', { name: 'Ver clasificación' })).toBeVisible();
      await capture(c.page, 'reto-diario-jugado');

      // 5. A abre «Ver resultado» y llega a /daily.
      await panel(a.page).getByRole('link', { name: 'Ver resultado' }).click();
      await expect(a.page).toHaveURL(/\/daily$/);
      await expect(titulo(a.page)).toBeVisible();
      await expect(filaPropia(a.page, a.cuenta.username)).toBeVisible();
      await expect(filas(a.page)).toHaveCount(antes + 2);
      await capture(a.page, 'reto-diario-pagina');

      // 6. Un invitado ve el panel bloqueado.
      const invitado = await abrir(browser, viewport);
      sesiones.push(invitado);
      await loginAsGuest(invitado.page, uniqueName('Inv'));
      await expect(panel(invitado.page).getByText('El reto diario es para cuentas registradas')).toBeVisible();
      await expect(panel(invitado.page).getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
      await capture(invitado.page, 'reto-diario-invitado');

      // 7. En la BD: un intento por cuenta (A terminado, C abandonado) y ninguna partida normal.
      const intentos = (cuenta: CuentaE2E) => psql(
        `SELECT r.status || ' ' || r."gameId" FROM "DailyResult" r JOIN "User" u ON u.id = r."userId" WHERE u.email = :'email';`,
        { email: cuenta.email });
      expect(intentos(a.cuenta)).toBe('FINISHED higher-lower');
      expect(intentos(b.cuenta)).toBe('FINISHED higher-lower');
      expect(intentos(c.cuenta)).toBe('ABANDONED higher-lower');
      for (const cuenta of [a.cuenta, b.cuenta, c.cuenta]) {
        const partidas = psql(`SELECT count(*) FROM "PlayerGameResult" p JOIN "User" u ON u.id = p."userId" WHERE u.email = :'email';`, { email: cuenta.email });
        expect(partidas, `PlayerGameResult de ${cuenta.username}`).toBe('0');
      }
      for (const sesion of sesiones) expect(sesion.errors).toEqual([]);
    } finally {
      await Promise.all(sesiones.map((s) => s.cerrar()));
      borrarCuentas(propias.map((c) => c.email), () => undefined);
      for (const cuenta of propias) cuentas.splice(cuentas.indexOf(cuenta), 1);
    }
  });
}

for (const { w, h } of DESKTOP) {
  test(`reto diario: la clasificación larga se desplaza dentro de su panel (${w}×${h})`, async ({ browser }) => {
    const sesion = await abrir(browser, { width: w, height: h });
    const propias = Array.from({ length: 15 }, (_, i) => nuevaCuenta(`retol${i}`));
    cuentas.push(...propias);
    try {
      // Quince cuentas con su resultado de hoy ya guardado (la última queda con la sesión abierta).
      for (const cuenta of propias) await registrarPorApi(sesion.page, cuenta);
      psql(`
        INSERT INTO "DailyResult" (id, "userId", "date", "gameId", status, score, correct, rounds, "startedAt", "finishedAt")
        SELECT gen_random_uuid()::text, u.id, (now() AT TIME ZONE 'Europe/Madrid')::date, 'higher-lower', 'FINISHED', 1, 1,
          '[1,0,0,0,0,0,0,0,0,0]'::jsonb, now(), now()
        FROM "User" u WHERE u.email = ANY(string_to_array(:'emails', ','));`, { emails: propias.map((c) => c.email).join(',') });
      await sesion.page.goto('/daily');
      await expect(titulo(sesion.page)).toBeVisible();
      await expect(filas(sesion.page)).toHaveCount(finishedHoy());
      const desborda = await clasificacion(sesion.page).evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(desborda, 'la clasificación se desplaza dentro de su panel').toBe(true);
      // Sin scroll de página ni del `main`: lo que no cabe se queda dentro del panel.
      await checkLayout(sesion.page, 'reto-diario-clasificacion-larga');
      expect(sesion.errors).toEqual([]);
    } finally {
      await sesion.cerrar();
      borrarCuentas(propias.map((c) => c.email), () => undefined);
      for (const cuenta of propias) cuentas.splice(cuentas.indexOf(cuenta), 1);
    }
  });
}

test('reto diario: el fallo de «Jugar» sale traducido en su panel', async ({ browser }) => {
  const d = await conCuenta(browser, { width: 1280, height: 720 }, 'retod');
  const otra = await abrir(browser, { width: 1280, height: 720 });
  try {
    await d.page.goto('/play');
    const jugar = panel(d.page).getByRole('button', { name: 'Jugar', exact: true });
    await expect(jugar).toBeEnabled();
    // La misma cuenta crea una sala en otro contexto: «Jugar» se rechaza antes de escribir nada (sigue disponible).
    const login = await otra.page.request.post('/api/auth/login', { data: { identifier: d.cuenta.email, password: d.cuenta.password } });
    expect(login.status()).toBe(200);
    await otra.page.goto('/play');
    await createRoom(otra.page);
    await jugar.click();
    const error = panel(d.page).getByText('No se pudo empezar el reto');
    await expect(error).toBeVisible();
    await expect(panel(d.page).getByText(/Leave your current room first/)).toHaveCount(0);
    await expect(d.page).toHaveURL(/\/play$/);
    await expect(jugar).toBeVisible();
    // Un solo dueño: la única alerta es la del panel (el aviso global de la sala no lo repite).
    await expect(d.page.getByRole('alert')).toHaveCount(1);
    await expect(panel(d.page).getByRole('alert')).toContainText('No se pudo empezar el reto');
    await otra.page.getByRole('button', { name: 'Salir de la sala' }).first().click();
    await expect(otra.page).toHaveURL(/\/play$/);
    expect(d.errors).toEqual([]);
  } finally {
    await Promise.all([d.cerrar(), otra.cerrar()]);
    borrarCuentas([d.cuenta.email], () => undefined);
    cuentas.splice(cuentas.indexOf(d.cuenta), 1);
  }
});
