/**
 * «Siguiente» en los revelados (E2): cuando todos los jugadores conectados lo pulsan, al revelado le queda 1 s. Se prueba
 * en Would You Rather (revelado de 8 s, tres jugadores) y en el reto diario (Higher or Lower, un jugador), con capturas a
 * los tres tamaños del botón con su recuento «N/M».
 */
import { expect, test, type Page } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, crearSalaConJugadores, esperarPartida, fijarJuegoDelDia, iniciarPartida, nuevaCuenta, pasarIntro, registrarPorApi, seleccionarJuego, SIZES, type CuentaE2E, type Jugador } from '../src/helpers.js';
import { capturarTamanos } from '../src/juegos.js';

const siguiente = (page: Page) => page.getByTestId('reveal-next').getByRole('button');

test('siguiente: en Would You Rather, cuando los tres lo pulsan, la ronda siguiente llega antes de los 8 s', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Would You Rather Pokémon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.press('ArrowRight');
    await rondas.blur();
    await expect(rondas).toHaveValue('2');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const opcion = (page: Page) => page.getByTestId('choice-options').locator('[data-choice-option="A"]').getByRole('button');
    await expect(titulo(host.page)).toHaveText('¿Qué preferirías?', { timeout: 20_000 });
    // En la ronda no hay «Siguiente»: solo en los revelados.
    await expect(siguiente(host.page)).toHaveCount(0);
    for (const { page } of jugadores) {
      await opcion(page).click();
      await page.getByRole('button', { name: 'Mayoría A', exact: true }).click();
      await page.getByTestId('wyr-confirm').click();
    }

    // Revelado: «Siguiente 0/3» para cada jugador; A y B lo pulsan y el recuento sube (el host lo ve en vivo).
    await expect(titulo(host.page)).toHaveText('La mayoría eligió A', { timeout: 15_000 });
    const revelado = Date.now();
    await expect(siguiente(host.page)).toContainText('0/3');
    await siguiente(a.page).click();
    await siguiente(b.page).click();
    await expect(siguiente(host.page)).toContainText('2/3');
    await expect(siguiente(a.page)).toHaveAttribute('aria-pressed', 'true');
    await expect(siguiente(a.page)).toBeDisabled();
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'siguiente-revelado', { sigue: siguiente(host.page) });
    await capturarTamanos(a.page, 'siguiente-revelado-pulsado', { sigue: siguiente(a.page) });

    // El último lo pulsa: la ronda 2 empieza en 1 s, mucho antes de los 8 s del revelado.
    await siguiente(host.page).click();
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('¿Qué preferirías?', { timeout: 4_000 });
    expect(Date.now() - revelado, 'la ronda 2 llega antes de que venza el revelado de 8 s').toBeLessThan(8_000);
    await expect(siguiente(host.page)).toHaveCount(0);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test.describe('reto diario', () => {
  const cuentas: CuentaE2E[] = [];
  test.beforeAll(() => {
    comprobarBdE2E();
    fijarJuegoDelDia('higher-lower');
  });
  test.afterAll(() => borrarCuentas(cuentas.map((c) => c.email), () => undefined));

  test('siguiente: también en el reto diario, sin «Saltar minijuego», a los tres tamaños', async ({ browser }) => {
    test.setTimeout(180_000);
    const cuenta = nuevaCuenta('sigue');
    cuentas.push(cuenta);
    const context = await browser.newContext({ viewport: { width: SIZES[0].w, height: SIZES[0].h } });
    const page = await context.newPage();
    const errors = collectErrors(page);
    try {
      await registrarPorApi(page, cuenta);
      await page.goto('/play');
      await page.getByRole('region', { name: 'Reto diario' }).getByRole('button', { name: 'Jugar', exact: true }).click();
      await expect(page).toHaveURL(/\/room$/);
      await expect(page.getByTestId('game-intro')).toBeVisible({ timeout: 15_000 });
      await pasarIntro([page]);
      const mayor = page.getByRole('button', { name: 'Mayor', exact: true });
      // Una ronda por tamaño: el revelado dura 3 s, así que cada captura va en su propio revelado.
      for (const { w, h } of SIZES) {
        await expect(mayor).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width: w, height: h });
        await mayor.click();
        await expect(siguiente(page)).toBeVisible({ timeout: 5_000 });
        await expect(siguiente(page)).toContainText('0/1');
        await expect(page.getByRole('button', { name: /saltar el minijuego/i })).toHaveCount(0);
        // En el móvil Higher or Lower lleva «Siguiente» con «Saltar minijuego», bajo el marcador: se llega desplazando.
        await siguiente(page).scrollIntoViewIfNeeded();
        await expect(siguiente(page), `${w}×${h}: «Siguiente» a la vista`).toBeInViewport({ ratio: 1 });
        await capture(page, 'siguiente-reto-diario');
      }
      // Con un solo jugador, pulsarlo deja el revelado en 1 s.
      await expect(mayor).toBeVisible({ timeout: 15_000 });
      await mayor.click();
      await siguiente(page).click();
      await expect(mayor).toBeVisible({ timeout: 2_500 });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
