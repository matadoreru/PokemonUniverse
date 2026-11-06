/**
 * Logros de punta a punta con una cuenta registrada que juega sola Higher or Lower de una ronda: recuadro de logros en
 * los resultados (`AchievementNotice`), región `status` que lo anuncia, «Ver mis logros» hacia la pestaña «Logros» del
 * perfil (insignia y secretos bloqueados) y una segunda partida sin repetir el aviso. Una cuenta nueva por tamaño, porque
 * «Primera partida» solo se desbloquea una vez. La prueba ENDLESS comprueba que con racha 0 no hay récord.
 */
import { expect, test, type Page } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, createRoom, iniciarPartida, esperarPartida, nuevaCuenta, registrarPorApi, seleccionarJuego, SIZES, type CuentaE2E } from '../src/helpers.js';

const cuentas: CuentaE2E[] = [];

test.beforeAll(() => {
  comprobarBdE2E();
});

test.afterAll(() => {
  borrarCuentas(cuentas.map((c) => c.email), () => undefined);
});

/** Higher or Lower elegido en el lobby y ajustado desde «Configuración» (rondas a 1, o tiempo por ronda al mínimo). */
async function prepararSala(page: Page, ajuste: 'una-ronda' | 'racha-infinita'): Promise<void> {
  await seleccionarJuego(page, 'Higher or Lower');
  await page.getByRole('tab', { name: 'Configuración' }).click();
  if (ajuste === 'racha-infinita') {
    await page.getByRole('radio', { name: 'Racha infinita' }).click();
    await expect(page.getByRole('radio', { name: 'Racha infinita' })).toBeChecked();
    // Sin responder, el tiempo agotado elimina: la racha se queda en 0 sin depender de la respuesta correcta.
    const tiempo = page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('Home');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('10');
  } else {
    const rondas = page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
  }
}

async function entrarEnSala(page: Page, cuenta: CuentaE2E): Promise<void> {
  await registrarPorApi(page, cuenta);
  await page.goto('/play');
  await createRoom(page);
}

for (const { w, h } of SIZES) {
  test(`logros: primera partida, perfil y segunda partida sin repetir (${w}×${h})`, async ({ browser }) => {
    test.setTimeout(120_000);
    const cuenta = nuevaCuenta('logros');
    cuentas.push(cuenta);
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    const errors = collectErrors(page);
    try {
      await entrarEnSala(page, cuenta);
      await prepararSala(page, 'una-ronda');
      await iniciarPartida(page, []);
      await esperarPartida([page]);
      await page.getByRole('button', { name: 'Mayor', exact: true }).click({ timeout: 20_000 });

      // Resultados: el recuadro con los tres logros de la primera victoria jugando solo.
      const titulo = page.getByText('¡Logros desbloqueados!', { exact: true });
      await expect(titulo).toBeVisible({ timeout: 30_000 });
      for (const nombre of ['Primera partida', 'Primera victoria', 'Gana en Higher or Lower']) await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
      await capture(page, 'logros-resultados');
      await expect(page.getByRole('status').filter({ hasText: /^Logro desbloqueado:.*Primera partida/ })).toHaveCount(1);

      // «Ver mis logros»: la pestaña «Logros» del perfil, con la insignia de desbloqueados.
      await page.getByRole('link', { name: 'Ver mis logros' }).click();
      await expect(page).toHaveURL(/\/profile\?tab=logros$/);
      const pestana = page.getByRole('tab', { name: /^Logros/ });
      await expect(pestana).toHaveAttribute('aria-selected', 'true');
      await expect(pestana).toContainText(/[34]\/48/);
      await expect(page.getByText('Logro secreto').first()).toBeVisible();
      await capture(page, 'logros-perfil');

      // Vuelta a la sala: se cierra la sesión y se juega otra partida; «Primera partida» no vuelve a salir.
      await page.goBack();
      await page.getByRole('button', { name: 'Terminar sesión' }).click({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Volver al lobby' }).click({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeAttached({ timeout: 15_000 });
      await iniciarPartida(page, []);
      await esperarPartida([page]);
      await page.getByRole('button', { name: 'Mayor', exact: true }).click({ timeout: 20_000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /Continuar sesión|Ver clasificación final/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Primera partida', { exact: true })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('logros: Racha infinita con racha 0 no deja récord', async ({ browser }) => {
  test.setTimeout(120_000);
  const cuenta = nuevaCuenta('racha');
  cuentas.push(cuenta);
  const context = await browser.newContext({ viewport: { width: SIZES[0].w, height: SIZES[0].h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await entrarEnSala(page, cuenta);
    await prepararSala(page, 'racha-infinita');
    await iniciarPartida(page, []);
    await esperarPartida([page]);
    // Nadie responde: al agotarse el tiempo cae la única jugadora y llegan los resultados.
    await expect(page.getByText('¡Logros desbloqueados!', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Nuevo récord personal/)).toHaveCount(0);

    // Perfil: con la racha en 0 la métrica no sale (se esconde mientras vale 0).
    await page.getByRole('link', { name: 'Ver mis logros' }).click();
    await page.goto('/profile');
    await expect(page.getByText('Mejor racha').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Récord en Racha infinita')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
