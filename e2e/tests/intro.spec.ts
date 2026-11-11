/**
 * Intro de partida (E1, `frontend/src/room/GameIntro.tsx`) y «Cómo se juega» (Q2, `GameHelpButton.tsx`) contra el `/ws`
 * de Java (`npm run test:e2e -- intro`): antes de la primera ronda la sala enseña el juego, sus tres reglas, la cuenta
 * atrás y «¡Listo!»; empieza cuando los dos jugadores lo pulsan. Ya en partida, la píldora «?» de la placa abre las
 * reglas en el diálogo de ayuda.
 */
import { expect, test } from '@playwright/test';
import { botonListo, capturarATresTamaños, crearSalaConJugadores, iniciarPartida, seleccionarJuego, type Jugador } from '../src/helpers.js';

test('intro de partida: reglas, «¡Listo!» de los dos y «Cómo se juega» en partida', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    // Aquí la intro se mira antes de pulsar: sin el «¡Listo!» automático de los helpers.
    for (const { page } of jugadores) await page.removeLocatorHandler(botonListo(page));

    await seleccionarJuego(host.page, 'Higher or Lower');
    await iniciarPartida(host.page, [invitado.page]);

    for (const { page } of jugadores) {
      const intro = page.getByTestId('game-intro');
      await expect(intro).toBeVisible({ timeout: 15_000 });
      await expect(intro.getByRole('heading', { level: 1, name: 'Higher or Lower' })).toBeVisible();
      await expect(intro.getByRole('listitem').filter({ hasText: /^\d/ })).toHaveCount(3);
      await expect(intro.getByText('Empieza en')).toBeVisible();
      await expect(intro.getByText('0/2 listos')).toBeVisible();
      // Una sola región viva en la pantalla.
      await expect(intro.locator('[aria-live]')).toHaveCount(1);
      await expect(botonListo(page)).toBeEnabled();
    }
    await capturarATresTamaños(invitado.page, 'intro-partida');

    // El host está listo: el invitado lo ve y la intro sigue hasta que él también lo esté.
    await botonListo(host.page).click();
    await expect(host.page.getByTestId('game-intro').getByRole('button', { name: 'Listo', exact: true })).toBeDisabled();
    await expect(invitado.page.getByTestId('game-intro').getByText('1/2 listos')).toBeVisible();
    await capturarATresTamaños(host.page, 'intro-partida-listo');

    await botonListo(invitado.page).click();
    for (const { page } of jugadores) {
      await expect(page.getByTestId('game-intro')).toBeHidden({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Mayor', exact: true })).toBeVisible({ timeout: 10_000 });
    }

    // «Cómo se juega»: la píldora «?» de la placa abre el diálogo de ayuda con las reglas y los atajos de la pantalla.
    const ayuda = invitado.page.getByRole('dialog', { name: 'Cómo se juega · Higher or Lower' });
    await invitado.page.getByRole('button', { name: 'Cómo se juega' }).click();
    await expect(ayuda).toBeVisible();
    await expect(ayuda.getByRole('heading', { name: 'Reglas' })).toBeVisible();
    await expect(ayuda.getByRole('region', { name: 'Reglas' }).getByRole('listitem')).toHaveCount(3);
    // Mayor, Igual y Menor con 1, 2 y 3, y la propia «?».
    await expect(ayuda.getByRole('region', { name: 'Atajos de teclado' }).getByRole('listitem')).toHaveCount(4);
    await capturarATresTamaños(invitado.page, 'como-se-juega');
    // Con el diálogo abierto, los atajos del juego no llegan a la pantalla de debajo.
    await invitado.page.keyboard.press('1');
    await expect(ayuda).toBeVisible();
    await expect(invitado.page.getByText('0 / 2 respuestas')).toBeVisible();
    await invitado.page.keyboard.press('Escape');
    await expect(ayuda).toBeHidden();
    // La tecla «?» abre el mismo diálogo.
    await invitado.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await invitado.page.keyboard.press('?');
    await expect(ayuda).toBeVisible();
    await invitado.page.keyboard.press('Escape');
    await expect(ayuda).toBeHidden();
    await invitado.page.getByRole('button', { name: 'Cómo se juega' }).click();
    await ayuda.getByRole('button', { name: 'Entendido' }).click();
    await expect(ayuda).toBeHidden();

    // En el móvil la «?» de la placa es un objetivo táctil de 44 × 44 px, como «Salir».
    await invitado.page.setViewportSize({ width: 390, height: 844 });
    const caja = await invitado.page.getByRole('button', { name: 'Cómo se juega' }).boundingBox();
    expect(caja, '«?» visible a 390 px').not.toBeNull();
    expect(Math.min(caja!.width, caja!.height), '«?» de al menos 44 px').toBeGreaterThanOrEqual(44);
    await invitado.page.setViewportSize({ width: 1280, height: 720 });

    for (const { errors } of jugadores) expect(errors, 'sin errores de consola').toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
