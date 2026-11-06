/**
 * Perfiles de otros jugadores de punta a punta, con tres cuentas registradas (cada una en su contexto): «Buscar
 * jugador» desde el panel «Amigos» (en mayúsculas), el perfil visible con nivel, resumen y logros desbloqueados,
 * «Añadir amigo» desde el perfil, «Ver perfil» desde la lista de amigos, el ajuste «Perfil visible para» del perfil
 * propio (Solo amigos y Nadie) con su estado privado, un nombre que no existe y un invitado, que vuelve a jugar.
 * Cuentas nuevas por tamaño: la amistad y los ajustes cambian en cada pasada.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  abrirAmigos, borrarCuentas, capture, collectErrors, comprobarBdE2E, loginAsGuest, nuevaCuenta, psql, registrarPorApi,
  SIZES, uniqueName, type CuentaE2E,
} from '../src/helpers.js';

const cuentas: CuentaE2E[] = [];

test.beforeAll(() => {
  comprobarBdE2E();
});

test.afterAll(() => {
  borrarCuentas(cuentas.map((c) => c.email), () => undefined);
});

interface Persona {
  cuenta: CuentaE2E;
  context: BrowserContext;
  page: Page;
  errors: string[];
}

async function persona(browser: Browser, prefijo: string, w: number, h: number): Promise<Persona> {
  const cuenta = nuevaCuenta(prefijo);
  cuentas.push(cuenta);
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await registrarPorApi(page, cuenta);
  return { cuenta, context, page, errors };
}

/** Partidas, puntos, experiencia (nivel 3) y dos logros, uno secreto, escritos en la BD para que el perfil tenga datos. */
function darEstadisticas(cuenta: CuentaE2E): void {
  const vars = { email: cuenta.email };
  psql(`UPDATE "UserStats" SET "gamesPlayed" = 12, "gamesWon" = 5, "totalPoints" = 340, xp = 260
        WHERE "userId" = (SELECT id FROM "User" WHERE email = :'email');`, vars);
  psql(`INSERT INTO "UserGameStats" (id, "userId", "gameId", "gamesPlayed", "gamesWon", points, metrics)
        SELECT gen_random_uuid()::text, id, 'higher-lower', 7, 3, 210, '{}'::jsonb FROM "User" WHERE email = :'email';`, vars);
  psql(`INSERT INTO "UserAchievement" ("userId", "achievementId")
        SELECT id, a FROM "User", unnest(ARRAY['general.first-game', 'secret.3']) AS a WHERE email = :'email';`, vars);
}

/** Cambia «Perfil visible para» desde el diálogo «Privacidad» del perfil propio. */
async function cambiarPrivacidad(page: Page, opcion: 'Todos' | 'Solo amigos' | 'Nadie', capturar = false): Promise<void> {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Privacidad' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Perfil visible para' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('radio', { name: opcion }).click();
  await expect(dialogo.getByRole('status')).toHaveText('Guardado.');
  await expect(dialogo.getByRole('radio', { name: opcion })).toHaveAttribute('aria-checked', 'true');
  if (capturar) await capture(page, 'perfiles-privacidad');
  await dialogo.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByText(`Perfil visible para: ${opcion}`)).toBeVisible();
}

async function esperarPrivado(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Este perfil es privado' })).toBeVisible();
  // Sin nivel, resumen, pestañas ni fecha de alta.
  await expect(page.getByTestId('level-meter')).toHaveCount(0);
  await expect(page.getByText('Resumen', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText(/^Miembro desde/)).toHaveCount(0);
}

for (const { w, h } of SIZES) {
  test(`perfiles: buscar, ver, añadir, privacidad y no encontrado (${w}×${h})`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await persona(browser, 'pfa', w, h);
    const beto = await persona(browser, 'pfb', w, h);
    const cris = await persona(browser, 'pfc', w, h);
    darEstadisticas(beto.cuenta);
    try {
      // Ana busca a Beto desde el panel «Amigos», con el nombre en mayúsculas.
      await ana.page.goto('/play');
      const panel = await abrirAmigos(ana.page);
      await panel.getByRole('button', { name: 'Buscar jugador' }).click();
      const buscar = ana.page.getByRole('dialog', { name: 'Buscar jugador' });
      await buscar.getByLabel('Nombre de usuario').fill(beto.cuenta.username.toUpperCase());
      await buscar.getByRole('button', { name: 'Ver perfil' }).click();
      await expect(ana.page).toHaveURL(new RegExp(`/u/${beto.cuenta.username.toUpperCase()}$`));
      await expect(ana.page.getByRole('dialog', { name: 'Amigos' })).toBeHidden();

      // Perfil visible: nombre canónico, nivel 3, resumen y la lista de juegos; logros solo los desbloqueados.
      await expect(ana.page.getByRole('heading', { level: 1, name: beto.cuenta.username })).toBeVisible();
      await expect(ana.page.getByText('Nivel 3', { exact: true })).toBeVisible();
      await expect(ana.page.getByText(/^Miembro desde el /)).toBeVisible();
      await expect(ana.page.getByRole('button', { name: 'Añadir amigo' })).toBeVisible();
      await expect(ana.page.getByRole('button', { name: 'Ocultar estadísticas de Higher or Lower' })).toBeVisible();
      await capture(ana.page, 'perfiles-visible');
      await ana.page.getByRole('tab', { name: /^Logros/ }).click();
      await expect(ana.page.getByRole('tab', { name: /^Logros/ })).toContainText('2/48');
      await expect(ana.page.getByText('Búho nocturno')).toBeVisible();
      await expect(ana.page.getByText('Logro secreto')).toHaveCount(0);
      await capture(ana.page, 'perfiles-logros');

      // «Añadir amigo» desde el perfil: pasa a «Solicitud enviada»; Beto la acepta desde el suyo (Ana no es privada).
      await ana.page.getByRole('button', { name: 'Añadir amigo' }).click();
      await expect(ana.page.getByRole('button', { name: 'Solicitud enviada' })).toBeDisabled();
      await expect(ana.page.getByRole('status').filter({ hasText: `Solicitud enviada a ${beto.cuenta.username}.` })).toBeVisible();
      await beto.page.goto(`/u/${ana.cuenta.username}`);
      await beto.page.getByRole('button', { name: 'Aceptar solicitud' }).click();
      await expect(beto.page.getByRole('button', { name: 'Ya sois amigos' })).toBeVisible();
      await expect(ana.page.getByRole('button', { name: 'Ya sois amigos' })).toBeVisible();

      // Solo amigos: Cris (sin amistad) ve el estado privado; Ana, el perfil completo.
      await cambiarPrivacidad(beto.page, 'Solo amigos');
      await cris.page.goto(`/u/${beto.cuenta.username}`);
      await esperarPrivado(cris.page);
      await expect(cris.page.getByText('Solo sus amigos pueden ver su nivel, sus estadísticas y sus logros.')).toBeVisible();
      await expect(cris.page.getByRole('button', { name: 'Añadir amigo' })).toBeVisible();
      await capture(cris.page, 'perfiles-privado');
      await ana.page.reload();
      await expect(ana.page.getByText('Nivel 3', { exact: true })).toBeVisible();

      // Nadie: también Ana (amiga) lo ve privado, entrando desde «Ver perfil» de su lista de amigos.
      await cambiarPrivacidad(beto.page, 'Nadie', true);
      await ana.page.goto('/play');
      const lista = await abrirAmigos(ana.page);
      await expect(lista.getByRole('link', { name: `Ver perfil de ${beto.cuenta.username}` })).toBeVisible();
      await capture(ana.page, 'perfiles-amigos');
      await lista.getByRole('link', { name: `Ver perfil de ${beto.cuenta.username}` }).click();
      await expect(ana.page).toHaveURL(new RegExp(`/u/${beto.cuenta.username}$`));
      await esperarPrivado(ana.page);
      await expect(ana.page.getByText('Ha decidido no mostrar su nivel, sus estadísticas ni sus logros a nadie.')).toBeVisible();
      await expect(ana.page.getByRole('button', { name: 'Ya sois amigos' })).toBeVisible();

      // El dueño en su propia ruta vuelve a su perfil completo.
      await beto.page.goto(`/u/${beto.cuenta.username}`);
      await expect(beto.page).toHaveURL(/\/profile$/);
      await expect(beto.page.getByText('Nivel 3', { exact: true })).toBeVisible();

      // Un nombre que no es de nadie.
      await cris.page.goto('/u/nadie_con_este_nombre');
      await expect(cris.page.getByText('No hay ningún jugador con ese nombre.')).toBeVisible();
      await capture(cris.page, 'perfiles-no-encontrado');

      // El nombre inexistente da (a propósito) un 404 que Chromium registra como error de consola sin URL; en desarrollo,
      // StrictMode monta dos veces y lo pide dos. Se descuentan solo esos, y solo en Cris.
      const mensaje404 = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
      cris.errors.splice(0, cris.errors.length, ...cris.errors.filter((e) => e !== mensaje404));
      for (const p of [ana, beto, cris]) expect(p.errors, p.cuenta.username).toEqual([]);
    } finally {
      for (const p of [ana, beto, cris]) await p.context.close();
    }
  });
}

test('perfiles: un invitado no ve perfiles y vuelve a jugar', async ({ browser }) => {
  const dueno = nuevaCuenta('pfd');
  cuentas.push(dueno);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await registrarPorApi(page, dueno);
    await context.clearCookies();
    await loginAsGuest(page, uniqueName('Inv'));
    const res = await page.request.get(`/api/users/${dueno.username}/profile`);
    expect(res.status()).toBe(401);
    await page.goto(`/u/${dueno.username}`);
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('button', { name: /^Amigos/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
