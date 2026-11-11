/**
 * E2E de Pokémon Bluff Auction (`pokemon-bluff-auction`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, primeraVisible, juegoEnTrama, sinScorePop, tramasRetenibles } from '../../src/juegos.js';

/**
 * Pokémon Bluff Auction con tres jugadores, 5 rondas, 30 s para demostrar y 120 s por turno. Ronda 1: quien abre puja 1
 * (con el atajo), el segundo puja 2, el tercero abre el `Dialog` de pasar (los atajos no cambian el campo con él abierto)
 * y pasa, y el primero pasa también: el segundo demuestra. Nombra Pikachu dos veces (la segunda, «Ya utilizado»): con
 * una apuesta de 2 nunca llega, así que la ronda acaba por tiempo («no lo consiguió»), sea Pikachu válido o no. B retiene
 * ese resultado (dura 5 s) para capturarlo. Ronda 2: quien abre puja el máximo (el pool entero, siempre imposible); los
 * demás ven «Puja máxima» con «Pasar» activo (arreglo del kit) y pasan: «Apuesta imposible». Las rondas 3–5 igual, hasta
 * la clasificación. Se capturan los ajustes, la subasta, la puja máxima, la búsqueda, la demostración, el resultado y la
 * clasificación.
 */
test('pokemon-bluff-auction: pujas, un pase confirmado, la demostración, el resultado de la ronda, la puja máxima y la clasificación', async ({ browser }) => {
  test.setTimeout(300_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokémon Bluff Auction');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('radiogroup', { name: 'Rondas' }).getByRole('radio', { name: '5', exact: true });
    await rondas.click();
    await expect(rondas).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('radiogroup', { name: 'Tiempo inicial para demostrar' }).getByRole('radio', { name: '30 s' })).toHaveAttribute('aria-checked', 'true');
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por puja' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('120');
    await expect(host.page.getByText('Solo especies normales')).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await tiempo.scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-pokemon-bluff-auction-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (el resultado de la ronda dura 5 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('auction-screen').locator('[aria-live]');
    const pujar = (page: Page) => page.getByTestId('bid-submit');
    const pasar = (page: Page) => page.getByTestId('bid-pass');
    const placa = (page: Page) => page.locator('#bid-controls-title');
    const campo = (page: Page) => page.getByRole('spinbutton', { name: 'Tu puja (Pokémon)' });
    const dialogoPasar = (page: Page) => page.getByRole('dialog', { name: '¿Pasar esta ronda?' });
    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon para demostrar la apuesta' });
    /** La página (de las dadas) en la que el botón se activa: la que tiene el turno. */
    const activa = async (boton: (page: Page) => Locator, otras: readonly Page[] = paginas) => primeraVisible(otras, (page) => boton(page).and(page.locator(':enabled')));
    const pasarConfirmando = async (page: Page) => {
      await pasar(page).click();
      await expect(dialogoPasar(page)).toBeVisible();
      await dialogoPasar(page).getByRole('button', { name: 'Pasar', exact: true }).click();
      await expect(dialogoPasar(page)).toBeHidden();
    };

    // Ronda 1, subasta: la condición, sin pujas; una sola región viva en cada página.
    for (const page of paginas) {
      await expect(page.getByText('Ronda 1 de 5 · Subasta', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(viva(page)).toHaveCount(1);
      await expect(page.getByTestId('bluff-condition')).toBeVisible();
    }
    const p1 = await activa(pujar);
    // El título es la ronda; el turno va en el reloj, el orden de turno y la placa de abajo.
    await expect(titulo(p1)).toHaveText('Ronda 1 de 5');
    await expect(p1.getByRole('timer')).toHaveAccessibleName(/^Tu turno: \d+ s$/);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="turn"]')).toContainText(`${nombreDe(p1)} (Tú)`);
    await expect(placa(p1)).toHaveText('Tu turno');
    await expect(p1.getByTestId('auction-current-bid')).toHaveText('Sin pujas');
    await expect(p1.getByTestId('bid-step')).toContainText(['Mínima: 1', '+2: 3', '+5: 6']);
    await expect(p1.getByTestId('bid-step')).toHaveCount(3);
    for (const page of paginas.filter((page) => page !== p1)) {
      await expect(page.getByRole('timer')).toHaveAccessibleName(new RegExp(`^Turno de ${nombreDe(p1)}: \\d+ s$`));
      await expect(placa(page)).toHaveText(`Le toca a ${nombreDe(p1)}`);
      await expect(page.getByTestId('bid-submit')).toHaveCount(0);
    }
    await capturarTamanos(p1, 'juego-pokemon-bluff-auction-subasta', { sigue: placa(p1).filter({ hasText: 'Tu turno' }) });
    // A 390×844 sin desplazar: la condición, la puja actual y los controles.
    await p1.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await p1.evaluate(() => window.scrollTo(0, 0));
    await expect(p1.getByTestId('bluff-condition')).toBeInViewport();
    await expect(p1.getByTestId('auction-current-bid')).toBeInViewport({ ratio: 1 });
    await expect(pujar(p1)).toBeInViewport({ ratio: 1 });
    await expect(pasar(p1)).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(p1.getByTestId('auction-current-bid')), 'a 390: la puja actual sin tapar por los controles').toBe(true);
    await p1.setViewportSize({ width: 1280, height: 720 });

    // Atajo fuera del campo: 2 pone «+2», 1 vuelve a la mínima; puja 1.
    await placa(p1).focus();
    await p1.keyboard.press('2');
    await expect(campo(p1)).toHaveValue('3');
    await p1.keyboard.press('1');
    await expect(campo(p1)).toHaveValue('1');
    await pujar(p1).click();
    await expect(placa(p1)).toHaveText(/^Le toca a /, { timeout: 5_000 });
    await expect(p1.getByTestId('bid-controls')).toContainText('Tú vas ganando con 1 Pokémon.');

    // El segundo ve la puja y el historial, y puja 2.
    const p2 = await activa(pujar, paginas.filter((page) => page !== p1));
    await expect(p2.getByTestId('auction-leader')).toContainText(nombreDe(p1));
    await expect(p2.getByTestId('bid-history-row').first()).toContainText('Pujó 1 Pokémon');
    await expect(viva(p2)).toContainText(`${nombreDe(p1)} puja 1 Pokémon.`);
    await expect(pujar(p2)).toHaveText('Pujar 2');
    await pujar(p2).click();
    await expect(placa(p2)).toHaveText(/^Le toca a /, { timeout: 5_000 });

    // El tercero pasa con el diálogo; con él abierto, los atajos no cambian el campo.
    const p3 = paginas.find((page) => page !== p1 && page !== p2)!;
    await expect(pujar(p3)).toBeEnabled({ timeout: 10_000 });
    await expect(campo(p3)).toHaveValue('3');
    await pasar(p3).click();
    await expect(dialogoPasar(p3)).toBeVisible();
    await expect(dialogoPasar(p3).getByRole('button', { name: 'Seguir pujando' })).toBeFocused();
    await p3.keyboard.press('2');
    await expect(campo(p3)).toHaveValue('3');
    await dialogoPasar(p3).getByRole('button', { name: 'Pasar', exact: true }).click();
    await expect(placa(p3)).toHaveText('Has pasado', { timeout: 5_000 });
    await expect(p3.getByTestId('budget-row').filter({ hasText: nombreDe(p3) })).toContainText('Fuera de la ronda');
    // El primero también pasa: el segundo demuestra su apuesta de 2.
    await expect(pasar(p1)).toBeEnabled({ timeout: 10_000 });
    await pasarConfirmando(p1);

    // Demostración: solo p2 tiene el buscador; los demás ven quién busca.
    for (const page of paginas) await expect(page.getByText('Ronda 1 de 5 · Demostración', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(titulo(p2)).toHaveText('Demuestra tu apuesta');
    await expect(buscador(p2)).toBeVisible();
    for (const page of [p1, p3]) {
      await expect(page.getByText(`${nombreDe(p2)} está buscando`)).toBeVisible();
      await expect(buscador(page)).toHaveCount(0);
    }
    // Al cambiar de fase el foco no cae al `body`.
    await expect.poll(() => p1.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), { timeout: 3_000 }).toBe(true);
    await buscador(p2).fill('Pikachu');
    await p2.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    for (const page of paginas) await expect(page.getByTestId('bluff-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(viva(p3)).toContainText(`${nombreDe(p2)}: Pikachu,`);
    await expect(p3.locator('[data-testid="bluff-metric"][data-metric="correct"]')).toContainText(/[01] de 2/);
    await capturarTamanos(p2, 'juego-pokemon-bluff-auction-busqueda', { sigue: buscador(p2) });
    await p2.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await p2.evaluate(() => window.scrollTo(0, 0));
    await expect(buscador(p2)).toBeInViewport({ ratio: 1 });
    await p2.setViewportSize({ width: 1280, height: 720 });
    await capturarTamanos(p3, 'juego-pokemon-bluff-auction-demostracion', { sigue: p3.getByText(`${nombreDe(p2)} está buscando`) });

    // B retiene el resultado; el repetido no cuenta y la apuesta de 2 acaba por tiempo.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'pokemon-bluff-auction')?.phase === 'ROUND_RESULTS');
    await buscador(p2).fill('Pikachu');
    await p2.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    await expect(p2.getByTestId('bluff-attempt').filter({ hasText: 'Ya utilizado' })).toHaveCount(1, { timeout: 5_000 });
    await expect.poll(() => retenedor.retenida(), { timeout: 45_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText(`${nombreDe(p2)} no lo consiguió`, { timeout: 5_000 });
    await expect(b.page.getByText('Ronda 1 de 5 · Resultado', { exact: true })).toBeVisible();
    await expect(b.page.getByTestId('bluff-reason')).toContainText('Se agotó el tiempo');
    await expect(b.page.getByTestId('bluff-round-row')).toHaveCount(3);
    await expect(b.page.getByTestId('bluff-round-row').filter({ hasText: nombreDe(p2) })).toContainText('Farol');
    await expect(b.page.getByTestId('bluff-round-row').filter({ hasText: 'Gana la ronda' })).toHaveCount(2);
    await expect(viva(b.page)).toContainText('no lo consiguió');
    await capturarTamanos(b.page, 'juego-pokemon-bluff-auction-resultado', { sigue: titulo(b.page).filter({ hasText: 'no lo consiguió' }) });
    retenedor.soltar();

    // Ronda 2: quien abre puja el máximo (el pool entero); el siguiente ve «Puja máxima» y puede pasar.
    for (const page of paginas) await expect(page.getByText('Ronda 2 de 5 · Subasta', { exact: true })).toBeVisible({ timeout: 20_000 });
    const q1 = await activa(pujar);
    const maximo = await campo(q1).getAttribute('max');
    await campo(q1).fill(maximo!);
    await pujar(q1).click();
    await expect(placa(q1)).toHaveText(/^Le toca a /, { timeout: 5_000 });
    const q2 = await activa(pasar, paginas.filter((page) => page !== q1));
    await expect(placa(q2)).toHaveText('Puja máxima');
    await expect(q2.getByTestId('auction-status')).toContainText('Puja máxima alcanzada');
    await expect(q2.getByTestId('auction-status')).not.toContainText('Mínimo para superarla');
    // Solo «Pasar esta ronda»: sin campo con un valor imposible ni «Pujar» gris.
    await expect(pujar(q2)).toHaveCount(0);
    await expect(campo(q2)).toHaveCount(0);
    await expect(pasar(q2)).toBeEnabled();
    await capturarTamanos(q2, 'juego-pokemon-bluff-auction-puja-maxima', { sigue: placa(q2).filter({ hasText: 'Puja máxima' }) });
    await pasarConfirmando(q2);
    const q3 = await activa(pasar, paginas.filter((page) => page !== q1 && page !== q2));
    await pasarConfirmando(q3);
    await expect(titulo(host.page)).toHaveText('Apuesta imposible', { timeout: 10_000 });
    await expect(host.page.getByTestId('bluff-reason')).toContainText(`apostó ${maximo}, pero solo existían`);

    // Rondas 3–5 igual, hasta la clasificación.
    const final = host.page.getByRole('heading', { name: 'La mesa final', level: 1 });
    while (!(await final.isVisible())) {
      let actual: Page | undefined;
      let accion: 'pujar' | 'pasar' | undefined;
      await expect.poll(async () => {
        if (await final.isVisible()) return true;
        // Contar (no `isEnabled`, que espera al botón): en el resultado de la ronda no hay controles.
        for (const page of paginas) {
          if (await pujar(page).and(page.locator(':enabled')).count() > 0) { actual = page; accion = 'pujar'; return true; }
          if (await pasar(page).and(page.locator(':enabled')).count() > 0) { actual = page; accion = 'pasar'; return true; }
        }
        return false;
      }, { timeout: 30_000 }).toBe(true);
      if (!actual) break;
      if (accion === 'pujar') {
        await campo(actual).fill((await campo(actual).getAttribute('max'))!);
        await pujar(actual).click();
        await expect(pujar(actual).and(actual.locator(':enabled'))).toHaveCount(0, { timeout: 5_000 });
      } else {
        await pasarConfirmando(actual);
        // Deshabilitado o, si cerró la subasta, ya sin controles (el resultado de la ronda).
        await expect(pasar(actual).and(actual.locator(':enabled'))).toHaveCount(0, { timeout: 5_000 });
      }
    }

    await expect(final).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ rondas? ganadas? · \d+\/\d+ apuestas cumplidas · récord \d+ · \d+ correctos? · \d+ imposibles?$/)).toHaveCount(3);
    await expect(host.page.getByRole('heading', { name: 'Mayor apuesta cumplida' })).toBeVisible();
    await expect(host.page.getByText(/🏆|🥇|🥈|🥉/u)).toHaveCount(0);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-bluff-auction-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
