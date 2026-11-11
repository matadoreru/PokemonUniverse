/**
 * E2E de Pokémon Team Auction (`pokemon-team-auction`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, sinTapar, SIZES } from '../../src/helpers.js';
import { capturarTamanos, sinScorePop } from '../../src/juegos.js';

/**
 * Cambia la cantidad de la siguiente `RAISE_BID` que envía la página (su `/ws` pasa por aquí): así se fuerza un
 * rechazo del servidor que la interfaz nunca dejaría enviar (más monedas de las que se tienen).
 */
async function pujasTrucables(page: Page): Promise<{ trucarSiguiente(cantidad: number): void }> {
  let cantidad: number | null = null;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const texto = String(message);
      if (cantidad !== null && texto.includes('"RAISE_BID"')) {
        const nueva = cantidad;
        cantidad = null;
        server.send(texto.replace(/"amount":\s*\d+/, `"amount":${nueva}`));
        return;
      }
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  return { trucarSiguiente(nueva) { cantidad = nueva; } };
}

/**
 * Pokémon Team Auction con tres jugadores, 2 monedas cada uno y 120 s por turno. Lote 1: el título es el lote (sin
 * BST), el turno va en el reloj y quien no tiene el turno ve «Le toca a …» sin controles; quien abre puja 1 (con los
 * atajos) y espera («Tú vas ganando con 1 moneda»), el siguiente intenta una puja que el servidor rechaza (trucada a
 * 999: el aviso global y el foco de vuelta en «Pujar») y luego puja 2; los demás no llegan a 3 y el motor los pasa: se
 * adjudica. Lote 2: la línea del lote anterior, «Sin presupuesto» del ganador y el equipo de un rival en su diálogo.
 * Después, cada turno puja todo hasta agotar las monedas y la clasificación. Se capturan el lote, la espera, la puja, la
 * adjudicación y la clasificación.
 */
test('pokemon-team-auction: pujas que compiten, una rechazada, la adjudicación, los equipos y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Team Auction');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('spinbutton', { name: 'Presupuesto personalizado' }).fill('2');
    await expect(host.page.getByRole('radio', { name: 'Otro' })).toHaveAttribute('aria-checked', 'true');
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por turno' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('120');
    await expect(host.page.getByRole('switch', { name: 'Incluir formas alternativas' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await tiempo.scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-pokemon-team-auction-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    // Todas las páginas pasan su `/ws` por el trucador (quién puja segundo sale del sorteo) y vuelven a la sala.
    const trucadores = new Map<Page, { trucarSiguiente(cantidad: number): void }>();
    for (const { page } of jugadores) {
      trucadores.set(page, await pujasTrucables(page));
      await page.reload();
      await page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
      await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    }
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const viva = (page: Page) => page.getByTestId('auction-screen').locator('[aria-live]');
    const pujar = (page: Page) => page.getByTestId('bid-submit');
    const placa = (page: Page) => page.locator('#bid-controls-title');
    /** La página con el turno: la única con «Pujar» activo (sin turno no hay controles; se cuenta, no se espera al botón). */
    const turno = async (otras: readonly Page[] = paginas) => {
      let encontrada: Page | undefined;
      await expect.poll(async () => {
        for (const page of otras) if (await pujar(page).and(page.locator(':enabled')).count() > 0) { encontrada = page; return true; }
        return false;
      }, { timeout: 20_000 }).toBe(true);
      return encontrada!;
    };
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const reloj = (page: Page) => page.getByRole('timer');

    // Lote 1: el título es el lote, el lote en una carta sin su BST, sin pujas; una sola región viva en cada página.
    for (const page of paginas) {
      await expect(titulo(page)).toHaveText(/^Lote 1 de 18 · \S/, { timeout: 20_000 });
      await expect(page.getByText('Pujas a la vista', { exact: true })).toBeVisible();
      await expect(page.getByText(/^BST \d+$/)).toHaveCount(0);
      await expect(viva(page)).toHaveCount(1);
    }
    const p1 = await turno();
    // El turno vive en el reloj (y marcado en el orden de turno), no en el título.
    await expect(reloj(p1)).toHaveAccessibleName(/^Tu turno: \d+ s$/);
    await expect(placa(p1)).toHaveText('Tu turno');
    await expect(p1.getByTestId('auction-current-bid')).toHaveText('Sin pujas');
    await expect(p1.getByTestId('turn-order-entry')).toHaveCount(3);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="turn"]')).toContainText(`${nombreDe(p1)} (Tú)`);
    await expect(p1.getByTestId('bid-budget')).toContainText('2');
    await expect(p1.getByTestId('bid-step')).toContainText(['Mínima: 1', 'Todo: 2']);
    for (const page of paginas.filter((page) => page !== p1)) {
      await expect(reloj(page)).toHaveAccessibleName(new RegExp(`^Turno de ${nombreDe(p1)}: \\d+ s$`));
      // Sin tu turno: el mensaje, sin controles grises, y el presupuesto a la vista.
      await expect(placa(page)).toHaveText(`Le toca a ${nombreDe(p1)}`);
      await expect(page.getByTestId('bid-controls')).toContainText('Aún no hay pujas en este lote.');
      await expect(pujar(page)).toHaveCount(0);
      await expect(page.getByTestId('bid-budget')).toContainText('2');
    }
    await capturarTamanos(p1, 'juego-pokemon-team-auction-lote', { sigue: placa(p1).filter({ hasText: 'Tu turno' }) });
    // La regla de «Presupuestos y equipos» se lee entera en los tres tamaños (al pie del panel, fuera del desplazamiento).
    const regla = p1.getByText(/^Quien pasa vuelve a participar/);
    for (const { w, h } of SIZES) {
      await p1.setViewportSize({ width: w, height: h });
      await regla.scrollIntoViewIfNeeded();
      expect(await regla.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const panel = el.closest('section')!.getBoundingClientRect();
        return r.height > 0 && r.top >= panel.top && r.bottom <= panel.bottom + 0.5 && el.scrollHeight <= el.clientHeight + 1;
      }), `${w}x${h}: la regla del panel lateral sin recortar`).toBe(true);
    }
    await p1.setViewportSize({ width: 1280, height: 720 });
    // A 390×844 sin desplazar: el lote, la puja actual y los controles.
    await p1.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await p1.evaluate(() => window.scrollTo(0, 0));
    await expect(p1.getByTestId('auction-pokemon')).toBeInViewport();
    await expect(p1.getByTestId('auction-current-bid')).toBeInViewport({ ratio: 1 });
    await expect(pujar(p1)).toBeInViewport({ ratio: 1 });
    await expect(p1.getByTestId('bid-pass')).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(p1.getByTestId('auction-current-bid')), 'a 390: la puja actual sin tapar por los controles').toBe(true);
    expect(await sinTapar(p1.getByTestId('turn-order-entry').last()), 'a 390: el orden de turno sin tapar por los controles').toBe(true);
    await p1.setViewportSize({ width: 1280, height: 720 });

    // Atajos (fuera del campo): 2 pone «Todo», 1 vuelve a la mínima. Escribiendo en el campo no se disparan.
    const campo = p1.getByRole('spinbutton', { name: 'Tu puja (monedas)' });
    await placa(p1).focus();
    await p1.keyboard.press('2');
    await expect(campo).toHaveValue('2');
    await p1.keyboard.press('1');
    await expect(campo).toHaveValue('1');
    await campo.focus();
    await p1.keyboard.press('2');
    await expect(campo).toHaveValue('12');
    await expect(pujar(p1)).toBeDisabled();
    await expect(p1.getByText('No te llega: máximo 2 monedas.')).toBeVisible();
    await campo.fill('1');
    await pujar(p1).click();
    await expect(placa(p1)).toHaveText(/^Le toca a /, { timeout: 5_000 });
    await expect(p1.getByTestId('bid-controls')).toContainText('Tú vas ganando con 1 moneda.');
    await expect(pujar(p1)).toHaveCount(0);
    await expect(p1.getByTestId('auction-leader')).toContainText(nombreDe(p1));

    // La puja que compite: el siguiente turno.
    const p2 = await turno(paginas.filter((page) => page !== p1));
    // Quien va ganando espera: a quién le toca y que va ganando, sin botones grises (captura del estado sin turno).
    await expect(placa(p1)).toHaveText(`Le toca a ${nombreDe(p2)}`);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="leading"]')).toContainText(`${nombreDe(p1)} (Tú)`);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="turn"]')).toContainText(nombreDe(p2));
    await capturarTamanos(p1, 'juego-pokemon-team-auction-espera', { sigue: placa(p1).filter({ hasText: `Le toca a ${nombreDe(p2)}` }) });
    await expect(p2.getByTestId('auction-current-bid')).toContainText('1');
    await expect(p2.getByTestId('auction-leader')).toContainText(nombreDe(p1));
    await expect(p2.getByTestId('bid-history-row').first()).toContainText('Pujó 1 moneda');
    await expect(viva(p2)).toContainText(`${nombreDe(p1)} puja 1 moneda por`);
    await expect(pujar(p2)).toHaveText('Pujar 2');
    await capturarTamanos(p2, 'juego-pokemon-team-auction-puja', { sigue: placa(p2).filter({ hasText: 'Tu turno' }) });

    // Rechazo forzado (999 monedas): el aviso global, el foco de vuelta en «Pujar» y el turno sigue siendo suyo.
    trucadores.get(p2)!.trucarSiguiente(999);
    await pujar(p2).click();
    await expect(p2.getByRole('alert').filter({ hasText: /monedas/ })).toBeVisible({ timeout: 5_000 });
    await expect(pujar(p2)).toBeFocused();
    await expect(placa(p2)).toHaveText('Tu turno');
    // El aviso global tapa la píldora: se puja con el teclado desde el foco devuelto.
    await p2.keyboard.press('Enter');

    // Los demás no llegan a 3: el motor los pasa y adjudica el lote 1. La línea del lote anterior lo dice en el lote 2.
    for (const page of paginas) await expect(titulo(page)).toHaveText(/^Lote 2 de 18 · \S/, { timeout: 10_000 });
    const anterior = p2.getByTestId('auction-previous');
    await expect(anterior).toContainText('Lote 1');
    await expect(anterior).toContainText(nombreDe(p2));
    await expect(anterior).toContainText('2 monedas');
    await expect(placa(p2)).toHaveText('Sin presupuesto');
    await expect(pujar(p2)).toHaveCount(0);
    await expect(p2.getByTestId('budget-row').filter({ hasText: nombreDe(p2) })).toContainText('Equipo 1/6');
    await expect(viva(p2)).toContainText(`Lote 1:`);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
    await capturarTamanos(p2, 'juego-pokemon-team-auction-adjudicacion', { sigue: anterior.filter({ hasText: 'Lote 1' }) });
    // A 390×844, arriba del todo, la placa pegada al fondo no tapa el pie de la tarjeta del estado (el medidor trata esa
    // placa como capa permitida y no lo vería).
    await p2.setViewportSize({ width: 390, height: 844 });
    await p2.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => p2.evaluate(() => {
      const ultima = document.querySelector('[data-testid="auction-status"] > :last-child');
      const placaFija = document.querySelector('[data-layer="screen-bottom"]');
      if (!ultima || !placaFija) return Number.NaN;
      return Math.round(placaFija.getBoundingClientRect().top - ultima.getBoundingClientRect().bottom);
    }), 'la placa no tapa el estado de la puja a 390').toBeGreaterThanOrEqual(0);
    await p2.setViewportSize({ width: 1280, height: 720 });

    // El equipo de un rival en su diálogo; Esc lo cierra y el foco vuelve a su botón.
    const ver = p1.getByRole('button', { name: `Ver equipo de ${nombreDe(p2)}` });
    await ver.click();
    const dialogo = p1.getByRole('dialog', { name: `Equipo de ${nombreDe(p2)}` });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByTestId('team-dialog-summary')).toContainText('Equipo 1/6');
    await expect(dialogo.getByTestId('team-dialog-summary')).toContainText('0 monedas');
    await p1.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(ver).toBeFocused();

    // Cada turno puja todo lo que tiene (el último incremento) hasta que no quedan monedas: la clasificación.
    const final = host.page.getByRole('heading', { name: 'La mesa final', level: 1 });
    while (!(await final.isVisible())) {
      let actual: Page | undefined;
      await expect.poll(async () => {
        if (await final.isVisible()) return true;
        // Contar (no `isEnabled`, que espera al botón y se cuelga si la clasificación ya lo desmontó).
        for (const page of paginas) if (await pujar(page).and(page.locator(':enabled')).count() > 0) { actual = page; return true; }
        return false;
      }, { timeout: 20_000 }).toBe(true);
      if (!actual) break;
      await actual.getByTestId('bid-step').last().click();
      await pujar(actual).click();
      await expect(pujar(actual).and(actual.locator(':enabled'))).toHaveCount(0, { timeout: 5_000 });
    }

    await expect(final).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^BST \d+ · \d+ Pokémon · \d+ legendarios? · \d+ míticos? · 0 monedas · \d+ lotes? ganados?$/)).toHaveCount(3);
    await expect(host.page.getByRole('heading', { name: 'Pokémon sin dueño' })).toBeVisible();
    await expect(host.page.getByText(/🏆|🥇/u)).toHaveCount(0);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-team-auction-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
