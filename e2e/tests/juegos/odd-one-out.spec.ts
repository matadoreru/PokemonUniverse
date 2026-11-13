/**
 * E2E de El Intruso (`odd-one-out`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, ajustarRango, sinScorePop } from '../../src/juegos.js';

/**
 * Dos jugadores y 3 rondas: uno vota y ve «Voto bloqueado» (el otro, solo quién ha votado); al votar el segundo se revela la
 * categoría y el intruso; las otras dos rondas se votan sin más y la clasificación cierra la partida. El test no puede saber
 * quién es el intruso antes de la revelación (ese es el juego): vota la primera carta.
 */
test('el intruso: votar, revelar y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    const paginas = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'El Intruso');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await ajustarRango(host.page, 'Número de rondas', 'Home', '3');
    // Plazo largo: las capturas a tres tamaños no deben llegar al final de la ronda.
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida(paginas);

    const opcion = (page: Page, id: string) => page.locator(`[data-odd-option="${id}"]`);
    const votoBloqueado = (page: Page) => page.getByText('Voto bloqueado', { exact: true });
    const intruso = (page: Page) => page.locator('[data-intruder="true"]');
    const vivas = (page: Page) => page.locator('.content-row > p[role="status"]');
    for (const page of paginas) await expect(opcion(page, 'A')).toBeEnabled({ timeout: 20_000 });
    for (const page of paginas) await expect(page.locator('[data-odd-option]')).toHaveCount(4);
    for (const page of paginas) await expect(vivas(page)).toHaveCount(1);

    // Ronda 1: el host vota; el invitado solo ve quién ha votado, sin categoría ni intruso.
    await opcion(host.page, 'A').click();
    await expect(votoBloqueado(host.page)).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByRole('heading', { name: /Has votado/ })).toBeFocused();
    await expect(host.page.getByText('1 de 2 ha votado').first()).toBeVisible();
    await expect(invitado.page.getByText('1 de 2 ha votado').first()).toBeVisible({ timeout: 10_000 });
    for (const page of paginas) {
      await expect(page.getByText(/Categoría:/)).toHaveCount(0);
      await expect(intruso(page)).toHaveCount(0);
    }
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-odd-one-out-votar', { sigue: votoBloqueado(host.page) });

    // Vota el invitado: la ronda se revela con la categoría, el intruso y los votantes.
    await opcion(invitado.page, 'B').click();
    for (const page of paginas) {
      await expect(page.getByText(/^Categoría: .+/)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/^El intruso era .+/)).toBeVisible();
      await expect(intruso(page)).toHaveCount(1);
    }
    await expect(host.page.locator('[data-testid="odd-voters-A"]')).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-odd-one-out-revelacion', { sigue: host.page.getByText(/^Categoría: .+/) });

    // Rondas 2 y 3: un voto de cada uno y la revelación; sin esperar al reloj.
    for (const ronda of [2, 3]) {
      for (const page of paginas) await expect(page.getByText(`Ronda ${ronda}`).first()).toBeVisible({ timeout: 20_000 });
      for (const page of paginas) await expect(opcion(page, 'C')).toBeEnabled({ timeout: 20_000 });
      for (const page of paginas) await opcion(page, 'C').click();
      for (const page of paginas) await expect(page.getByText(/^El intruso era .+/)).toBeVisible({ timeout: 10_000 });
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación del intruso' })).toBeVisible({ timeout: 20_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-odd-one-out-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
