/**
 * E2E de Would You Rather Pokémon (`would-you-rather`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, capturarAnotando, sinScorePop, textoDeMain, sinMomento } from '../../src/juegos.js';

/**
 * Would You Rather con tres jugadores y una ronda: el host elige con el atajo `1`, los demás con las cartas; la mayoría es
 * A (2–1). Se comprueban el secreto de las papeletas hasta la revelación (también tras recargar con la papeleta
 * bloqueada), el foco en «Papeleta bloqueada», el dilema, la predicción y «Bloquear papeleta» a la vista a 390×844, la
 * región viva única y el recuento con quién eligió qué.
 */
test('would-you-rather: atajos, papeleta secreta, revelación y clasificación', async ({ browser }) => {
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
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const opcion = (page: Page, letra: 'A' | 'B') => page.getByTestId('choice-options').locator(`[data-choice-option="${letra}"]`).getByRole('button');
    const mayoria = (page: Page, letra: 'A' | 'B') => page.getByRole('button', { name: `Mayoría ${letra}`, exact: true });
    const confirmar = (page: Page) => page.getByTestId('wyr-confirm');
    const bloqueada = (page: Page) => page.getByRole('heading', { name: 'Papeleta bloqueada' });
    const sinPapeletasAjenas = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin elecciones ni recuentos ajenos`).not.toMatch(/Eligió [AB]|Predijo|\b\d+ votos?\b|Votos de|papeletas\./);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };

    // Papeleta: el host elige A con la tecla 1 (fuera de cualquier campo) y la mayoría A con su botón.
    await expect(titulo(host.page)).toHaveText('¿Qué preferirías?', { timeout: 20_000 });
    await expect(opcion(host.page, 'A')).toHaveAttribute('aria-keyshortcuts', '1');
    await host.page.locator('body').press('1');
    await expect(opcion(host.page, 'A')).toHaveAttribute('aria-pressed', 'true');
    await host.page.locator('body').press('2');
    await expect(opcion(host.page, 'B')).toHaveAttribute('aria-pressed', 'true');
    await host.page.locator('body').press('1');
    await expect(opcion(host.page, 'A')).toHaveAttribute('aria-pressed', 'true');
    await expect(confirmar(host.page)).toBeDisabled();
    await mayoria(host.page, 'A').click();
    await expect(mayoria(host.page, 'A')).toHaveAttribute('aria-pressed', 'true');
    await expect(confirmar(host.page)).toBeEnabled();

    // A elige A y predice B; su papeleta se bloquea y el foco va al título de la placa.
    await opcion(a.page, 'A').click();
    await mayoria(a.page, 'B').click();
    await confirmar(a.page).click();
    await expect(bloqueada(a.page)).toBeFocused({ timeout: 5_000 });
    await expect(a.page.getByTestId('choice-options').getByRole('button')).toHaveCount(0);
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Lista');
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Pensando…');
    await sinPapeletasAjenas(host.page, 'papeleta');
    // Recargar con la papeleta bloqueada: el servidor devuelve solo la propia.
    await a.page.reload();
    await a.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(bloqueada(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(a.page.getByText('Elegiste A y predijiste B.', { exact: false })).toBeVisible();
    await sinPapeletasAjenas(a.page, 'papeleta tras recargar');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'juego-would-you-rather-papeleta', { sigue: titulo(host.page).filter({ hasText: '¿Qué preferirías?' }) });
    await capturarTamanos(a.page, 'juego-would-you-rather-bloqueada', { sigue: bloqueada(a.page) });
    // A 390×844 sin desplazar: la fase, el plazo, las dos opciones, la predicción y la confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const objetivo of [b.page.locator('[aria-current="step"]'), b.page.getByRole('timer'), opcion(b.page, 'A'), opcion(b.page, 'B'), mayoria(b.page, 'A'), mayoria(b.page, 'B'), confirmar(b.page)]) {
      await expect(objetivo).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(objetivo), 'a 390: todo lo de la papeleta a la vista y sin tapar').toBe(true);
    }
    await opcion(b.page, 'B').click();
    await mayoria(b.page, 'A').click();
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await confirmar(b.page).click();
    await expect(bloqueada(b.page)).toBeVisible({ timeout: 5_000 });
    await confirmar(host.page).click();

    // Revelación: la mayoría es A (2 de 3); cada opción con su barra y quién la eligió.
    await expect(titulo(host.page)).toHaveText('La mayoría eligió A', { timeout: 15_000 });
    await expect(host.page.getByTestId('tally-summary')).toHaveText('La mayoría eligió A con 2 de 3 papeletas.');
    await expect(host.page.getByTestId('tally-row')).toHaveCount(2);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Mayoría' })).toContainText(`Votos de`);
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Eligió A · Predijo B');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    // Sin el cut-in del ganador (1,4 s): la captura muestra la revelación.
    await sinMomento(host.page);
    await capturarAnotando(host.page, 'juego-would-you-rather-revelacion', titulo(host.page).filter({ hasText: 'La mayoría eligió A' }));

    await expect(host.page.getByRole('heading', { name: 'Quien mejor leyó la sala' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 predicción · 1 en mayoría · 1\/1 papeletas · 1 ronda perfecta$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-would-you-rather-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
