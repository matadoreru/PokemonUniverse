import { expect, test, type Page } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, expectNoHorizontalScroll, loginAsGuest, nuevaCuenta, promoverAAdmin, registrarPorApi, SIZES, uniqueName, type CuentaE2E } from '../src/helpers.js';

for (const { w, h } of SIZES) {
  test(`portada a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/');
    const empezar = page.getByRole('link', { name: 'Empezar a jugar' });
    await expect(empezar).toBeVisible();
    await capture(page, 'portada', { minFontPx: 13, noPageScroll: true });

    await empezar.click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible();

    expect(errors).toEqual([]);
  });
}

/** Una versión publicada con más cambios de los que caben: el panel se desplaza por dentro y la página no. */
const NOVEDAD = {
  id: 'e2e-novedad',
  version: '0.9.0',
  title: 'Pantalla de título Arcade DS',
  date: '2026-11-03T00:00:00.000Z',
  published: true,
  content: [
    { type: 'NEW', text: 'La portada es ahora una pantalla de título con el logotipo grande y las píldoras de inicio.' },
    { type: 'NEW', text: 'Cabecera de placas con el sonido, las novedades y el perfil siempre a mano.' },
    { type: 'INTERFACE', text: 'Las pantallas entran con una transición corta que respeta la reducción de movimiento.' },
    { type: 'BUGS', text: 'Los avisos se ven por encima de los diálogos abiertos.' },
    { type: 'BUGS', text: 'El perfil del administrador vuelve a estar accesible en el móvil.' },
  ],
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
};

// Panel «Lo último en el universo» con una versión y con error (respuestas simuladas), a los tres tamaños.
for (const { w, h } of SIZES) {
  test(`portada con novedades y con error a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    let falla = false;
    await page.route('**/api/changelog', (route) => falla
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service Unavailable' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [NOVEDAD] }) }));

    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Lo último en el universo' });
    await expect(panel.getByText('Pantalla de título Arcade DS')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/changelog');
    await capture(page, 'portada-novedades', { minFontPx: 13, noPageScroll: true });

    falla = true;
    await page.reload();
    const alerta = panel.getByRole('alert');
    await expect(alerta).toContainText('No se pudieron cargar las novedades');
    await expect(alerta).not.toContainText('Service Unavailable');
    await capture(page, 'portada-error', { minFontPx: 13, noPageScroll: true });

    falla = false;
    await alerta.getByRole('button', { name: 'Reintentar' }).click();
    await expect(panel.getByText('Pantalla de título Arcade DS')).toBeVisible();

    // La consola registra el 503 simulado; no es un error de la página.
    expect(errors.filter((e) => !/503|Service Unavailable/.test(e))).toEqual([]);
  });
}

// Tema único: una preferencia de tema claro de la versión anterior se ignora.
test('ignora un tema claro guardado', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('pokemon-universe-theme', 'light'));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Empezar a jugar' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  // Fondo del body: --band (#060B22).
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(6, 11, 34)');
  expect(errors).toEqual([]);
});

/** Las dos placas de la cabecera no se pisan ni se salen de la vista. */
async function placasCaben(page: Page, id: string, w: number): Promise<void> {
  await expectNoHorizontalScroll(page, id);
  const placas = await page.locator('header > div').first().evaluate((fila) => [...fila.children].map((c) => c.getBoundingClientRect().toJSON() as DOMRect));
  expect(placas).toHaveLength(2);
  const [izq, der] = placas as [DOMRect, DOMRect];
  expect(izq.right, `${id}: las placas se pisan`).toBeLessThanOrEqual(der.left);
  expect(der.right, `${id}: la placa derecha se sale`).toBeLessThanOrEqual(w);
}

/**
 * Cabecera de placas (Arcade DS F3) a los tres tamaños, con el mínimo de 13 px del sistema. Se mide la cabecera: el
 * contenido de `/play` aún no está rediseñado, así que el `main` lleva `data-layout-ignore` durante la medición. Desde
 * 768 px Novedades y «Enviar feedback» están en la placa; por debajo, en el menú, que se abre y se captura a 390 px.
 */
async function capturarCabecera(page: Page, nombre: string, { perfil, admin = false }: { perfil?: string; admin?: boolean } = {}): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await expect(page.getByRole('link', { name: 'Pokémon Universe, inicio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajustes de sonido' })).toBeVisible();
    if (perfil) await expect(page.getByRole('link', { name: `Abrir perfil de ${perfil}` })).toBeVisible();
    const menu = page.getByRole('button', { name: /^Más opciones/ });
    if (w >= 768) {
      await expect(menu).toBeHidden();
      await expect(page.getByRole('link', { name: /^Novedades/ })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Enviar feedback' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Abrir panel de administración' })).toHaveCount(admin ? 1 : 0);
    } else {
      await expect(menu).toBeVisible();
    }
    await page.locator('main').evaluate((main) => main.setAttribute('data-layout-ignore', ''));
    await capture(page, nombre, { minFontPx: 13 });
    await placasCaben(page, `${nombre}-${w}`, w);
    if (w < 768) {
      await menu.click();
      const dialogo = page.getByRole('dialog', { name: 'Más opciones' });
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByRole('link', { name: /^Novedades/ })).toBeVisible();
      await expect(dialogo.getByRole('link', { name: 'Enviar feedback' })).toBeVisible();
      await expect(dialogo.getByRole('link', { name: 'Abrir panel de administración' })).toHaveCount(admin ? 1 : 0);
      await capture(page, `${nombre}-menu`, { minFontPx: 13 });
      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();
      await expect(menu).toBeFocused();
    }
  }
}

test('cabecera de invitado', async ({ page }) => {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('Sonido'));
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await capturarCabecera(page, 'cabecera-invitado');
  expect(errors).toEqual([]);
});

// Cuentas registradas: necesitan el contenedor de PostgreSQL para promover al ADMIN y borrar las cuentas al acabar.
test.describe('cabecera con cuenta', () => {
  const cuentas: CuentaE2E[] = [];
  test.beforeAll(() => {
    comprobarBdE2E();
  });
  test.afterAll(() => {
    borrarCuentas(cuentas.map((c) => c.email), () => undefined);
  });

  test('cabecera de USER', async ({ page }) => {
    const errors = collectErrors(page);
    const cuenta = nuevaCuenta('e2e_cab');
    cuentas.push(cuenta);
    await page.goto('/auth');
    await registrarPorApi(page, cuenta);
    await page.goto('/play');
    await expect(page.getByRole('link', { name: `Abrir perfil de ${cuenta.username}` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir panel de administración' })).toHaveCount(0);
    await capturarCabecera(page, 'cabecera-user', { perfil: cuenta.username });
    expect(errors).toEqual([]);
  });

  test('cabecera de ADMIN', async ({ page }) => {
    const errors = collectErrors(page);
    const cuenta = nuevaCuenta('e2e_cabadm');
    cuentas.push(cuenta);
    await page.goto('/auth');
    await registrarPorApi(page, cuenta);
    await promoverAAdmin(page, cuenta);
    await page.goto('/play');
    await expect(page.getByRole('link', { name: 'Abrir panel de administración' })).toBeVisible();
    await capturarCabecera(page, 'cabecera-admin', { perfil: cuenta.username, admin: true });
    // Bordes de los saltos (640, 768, 1024 y 1280 px): el perfil sigue a mano y las placas caben.
    for (const w of [640, 767, 768, 1023, 1024, 1279]) {
      await page.setViewportSize({ width: w, height: 900 });
      await expect(page.getByRole('link', { name: `Abrir perfil de ${cuenta.username}` })).toBeVisible();
      await placasCaben(page, `cabecera-admin-${w}`, w);
    }
    // Desde el menú del móvil se llega a «Enviar feedback» y el menú se cierra al navegar.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /^Más opciones/ }).click();
    await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('link', { name: 'Enviar feedback' }).click();
    await expect(page).toHaveURL(/\/feedback$/);
    await expect(page.getByRole('dialog', { name: 'Más opciones' })).toBeHidden();
    expect(errors).toEqual([]);
  });
});
