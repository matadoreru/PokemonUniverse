/**
 * Reto diario de punta a punta (`npm run ui:check -- reto-diario`): el juego de hoy se fija en la BD a Higher or Lower
 * (`fijarJuegoDelDia`), así que el spec no depende del sorteo. A juega desde el panel de Jugar hasta los resultados del
 * reto (clasificación y «Compartir»); B, en otro contexto, juega el mismo reto con las mismas parejas; C empieza y
 * abandona; A abre `/daily`; un invitado ve el panel bloqueado. Al final, la BD tiene un intento por cuenta y ninguna
 * partida normal. Cuentas nuevas por tamaño (un intento por cuenta y día), borradas al terminar cada prueba.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, fijarJuegoDelDia, jugarHigherLowerHastaElFinal, loginAsGuest, nuevaCuenta, psql, registrarPorApi, SIZES, uniqueName, type CuentaE2E } from '../src/helpers.js';

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
      await expect(clasificacion(a.page).getByText(`${a.cuenta.username} (tú)`)).toBeVisible({ timeout: 30_000 });
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
      await expect(clasificacion(b.page).getByText(`${b.cuenta.username} (tú)`)).toBeVisible({ timeout: 30_000 });
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
      await expect(clasificacion(a.page).getByText(`${a.cuenta.username} (tú)`)).toBeVisible();
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
