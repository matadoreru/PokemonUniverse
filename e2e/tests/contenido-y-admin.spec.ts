/**
 * Contenido de cuenta y administración (etapa 2C) contra el backend Java
 * (`npm run test:e2e -- contenido-y-admin`). Un USER registrado sube un avatar PNG y lo ve en su sala, crea, edita y borra una
 * categoría y un dilema desde la configuración del lobby; un ADMIN (promovido en la BD local) abre el
 * panel y ve la sala activa. Las dos cuentas y el fichero del avatar se borran al acabar.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, createRoom, nuevaCuenta, promoverAAdmin, registrarPorApi, seleccionarJuego, SIZES } from '../src/helpers.js';

/** Almacén de avatares de desarrollo del backend Java (`application-dev.yml`). */
const AVATAR_DIR = fileURLToPath(new URL('../../apps/server/.data/avatars/', import.meta.url));

/** PNG válido de `lado`×`lado` (RGB, degradado) con CRC y zlib reales: sharp no acepta un PNG roto. */
function png(lado: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const filas = Buffer.alloc(lado * (1 + lado * 3));
  for (let y = 0; y < lado; y++) {
    const fila = y * (1 + lado * 3);
    for (let x = 0; x < lado; x++) filas.set([Math.round((x / lado) * 255), 80, Math.round((y / lado) * 255)], fila + 1 + x * 3);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filas)), chunk('IEND', Buffer.alloc(0))]);
}

/** Abre la pestaña «Configuración» del lobby tras elegir el juego. */
async function configurar(page: Page, juego: string): Promise<void> {
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
  await seleccionarJuego(page, juego);
  await page.getByRole('tab', { name: 'Configuración' }).click();
  await expect(page.getByRole('heading', { name: `Ajustes de ${juego}` })).toBeVisible();
}

/** Acepta el `window.confirm` del siguiente borrado. */
function aceptarConfirmacion(page: Page): void {
  page.once('dialog', (dialog) => void dialog.accept());
}

// Antes de registrar cuentas: sin podman o sin el contenedor de PostgreSQL no se podrían promover ni borrar.
test.beforeAll(() => {
  comprobarBdE2E();
});

/** Capturas de revisión de la página a los tres tamaños, sin scroll de página en escritorio; vuelve a 1280×720. */
async function capturarPagina(page: Page, nombre: string): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await capture(page, nombre, { minFontPx: 13, noPageScroll: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** Capturas de revisión del diálogo abierto a los tres tamaños; vuelve a 1280×720 al acabar. */
async function capturarDialogo(page: Page, nombre: string, dialogo: Locator): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await expect(dialogo).toBeVisible();
    await capture(page, nombre, { minFontPx: 13 });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test('un USER gestiona categorías, dilemas y avatar; un ADMIN ve su sala activa', async ({ browser }) => {
  test.setTimeout(120_000);
  const usuario = nuevaCuenta('e2e_user');
  const admin = nuevaCuenta('e2e_admin');
  const contextos: BrowserContext[] = [];
  try {
    // Registro del USER por la interfaz.
    const userContext = await browser.newContext();
    contextos.push(userContext);
    const page = await userContext.newPage();
    const errors = collectErrors(page);
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Registro' }).click();
    await page.getByLabel('Nombre de usuario').fill(usuario.username);
    await page.getByLabel('Email').fill(usuario.email);
    await page.getByLabel('Contraseña').fill(usuario.password);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/play$/);

    // Avatar: PNG elegido en el perfil; el editor lo recorta y sube un WebP (`PUT /api/auth/profile/avatar/custom`).
    await page.goto('/profile');
    // Perfil recién creado: placa, resumen a cero y el vacío de «Estadísticas por juego» que lleva a jugar.
    await expect(page.getByRole('heading', { name: usuario.username, level: 1 })).toBeVisible();
    await expect(page.getByText('Todavía no has jugado ninguna partida')).toBeVisible();
    await capturarPagina(page, 'perfil');
    await page.getByRole('button', { name: 'Cambiar avatar' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Elige tu avatar' });
    await expect(dialogo).toBeVisible();
    // Capturas del diálogo abierto, sin avatares predefinidos y luego con el recorte.
    await capturarDialogo(page, 'dialogo-avatar', dialogo);
    await dialogo.locator('input[type="file"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png(160) });
    await expect(dialogo.getByAltText('Previsualización del recorte')).toBeVisible();
    await capturarDialogo(page, 'dialogo-avatar-recorte', dialogo);
    const [subida] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/profile/avatar/custom' && r.request().method() === 'PUT'),
      dialogo.getByRole('button', { name: 'Recortar y guardar' }).click(),
    ]);
    expect(subida.status()).toBe(200);
    await expect(dialogo).toBeHidden();

    // Perfil con partidas (respuesta real con estadísticas añadidas): las franjas abren las métricas del juego.
    await page.route('**/api/auth/profile', async (route) => {
      const respuesta = await route.fetch();
      const json = (await respuesta.json()) as { profile: { globalStats: Record<string, number>; games: { stats: Record<string, unknown> }[] } };
      json.profile.games = json.profile.games.map((juego, i) => i < 4 ? { ...juego, stats: { ...juego.stats, gamesPlayed: 6 - i, gamesWon: 3 - Math.min(i, 2), points: 140 - i * 35, metrics: {} } } : juego);
      json.profile.globalStats = { gamesPlayed: 18, gamesWon: 8, totalPoints: 350 };
      await route.fulfill({ response: respuesta, json });
    });
    await page.reload();
    const primera = page.getByRole('button', { name: /^Ocultar estadísticas de / });
    await expect(primera).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Winrate', { exact: true }).last()).toBeVisible();
    await capturarPagina(page, 'perfil-con-partidas');
    await primera.click();
    await expect(page.getByRole('button', { name: /^Ocultar estadísticas de / })).toHaveCount(0);
    await page.unroute('**/api/auth/profile');

    // El avatar sale en la lista de jugadores de la sala y la imagen carga.
    await page.goto('/play');
    const code = await createRoom(page);
    // `:visible`: la cabecera lleva dos variantes del perfil (redonda < 1024 px y con nombre), una siempre oculta.
    const avatar = page.locator('img[src*="/api/auth/avatars/"]:visible').first();
    await expect(avatar).toBeVisible();
    await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Categoría personal: crear, editar y borrar desde la configuración de One of Us Is Fake.
    await configurar(page, 'One of Us Is Fake');
    const categorias = page.locator('section[aria-labelledby="custom-categories-title"]');
    await expect(categorias.getByText('Todavía no has creado categorías personales.')).toBeVisible();
    const categoria = `Pokémon de prueba ${code}`;
    await categorias.getByPlaceholder('Pokémon que llevarías al gimnasio').fill(categoria);
    await categorias.getByRole('button', { name: 'Añadir' }).click();
    await expect(categorias.getByText(categoria, { exact: true })).toBeVisible();
    await expect(categorias.getByText('1 activas')).toBeVisible();
    await categorias.getByRole('button', { name: `Editar ${categoria}` }).click();
    const editada = `${categoria} editada`;
    await categorias.getByLabel('Editar categoría').fill(editada);
    await categorias.getByRole('button', { name: 'Guardar' }).click();
    await expect(categorias.getByText(editada, { exact: true })).toBeVisible();
    aceptarConfirmacion(page);
    await categorias.getByRole('button', { name: `Eliminar ${editada}` }).click();
    await expect(categorias.getByText('Todavía no has creado categorías personales.')).toBeVisible();

    // Dilema personal: crear, editar y borrar desde la configuración de Would You Rather.
    await configurar(page, 'Would You Rather Pokémon');
    const dilemas = page.locator('section[aria-labelledby="custom-wyr-title"]');
    await expect(dilemas.getByText('Todavía no has creado dilemas personales.')).toBeVisible();
    await dilemas.getByLabel('Nueva opción A').fill(`Volar sobre Charizard ${code}`);
    await dilemas.getByLabel('Nueva opción B').fill(`Bucear con Lapras ${code}`);
    await dilemas.getByRole('button', { name: 'Añadir' }).click();
    await expect(dilemas.getByText(`Volar sobre Charizard ${code}`)).toBeVisible();
    await expect(dilemas.getByText('1 activos')).toBeVisible();
    await dilemas.getByRole('button', { name: 'Editar dilema' }).click();
    await dilemas.getByLabel('Editar opción A').fill(`Surcar el cielo con Rayquaza ${code}`);
    await dilemas.getByRole('button', { name: 'Guardar' }).click();
    await expect(dilemas.getByText(`Surcar el cielo con Rayquaza ${code}`)).toBeVisible();
    aceptarConfirmacion(page);
    await dilemas.getByRole('button', { name: 'Eliminar dilema' }).click();
    await expect(dilemas.getByText('Todavía no has creado dilemas personales.')).toBeVisible();

    // ADMIN: cuenta nueva promovida en la BD; el panel lista la sala del USER como activa.
    const adminContext = await browser.newContext();
    contextos.push(adminContext);
    const adminPage = await adminContext.newPage();
    const adminErrors = collectErrors(adminPage);
    await adminPage.goto('/auth');
    await registrarPorApi(adminPage, admin);
    await promoverAAdmin(adminPage, admin);
    const [activas] = await Promise.all([
      adminPage.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/active-rooms'),
      adminPage.goto('/admin'),
    ]);
    expect(activas.status()).toBe(200);
    await expect(adminPage.getByRole('heading', { name: 'Administración de Pokémon Universe' })).toBeVisible();
    await expect(adminPage.getByRole('tab', { name: 'Salas' })).toHaveAttribute('aria-selected', 'true');
    await expect(adminPage.getByText(code, { exact: true }).first()).toBeVisible();
    await expect(adminPage.getByText(usuario.username, { exact: true }).first()).toBeVisible();

    expect(errors).toEqual([]);
    expect(adminErrors).toEqual([]);
  } finally {
    // allSettled: tras un timeout los contextos ya están cerrados y la limpieza de la BD debe correr igual.
    await Promise.allSettled(contextos.map((c) => c.close()));
    borrarCuentas([usuario.email, admin.email], (fichero) => {
      if (/^[0-9a-f-]{36}\.webp$/.test(fichero)) rmSync(`${AVATAR_DIR}${fichero}`, { force: true });
    });
  }
});
