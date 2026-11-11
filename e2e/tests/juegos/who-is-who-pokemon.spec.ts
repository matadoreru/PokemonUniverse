/**
 * E2E de Quién es Quién — Pokémon (`who-is-who-pokemon`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { conMovimiento, crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, sinTapar, SIZES } from '../../src/helpers.js';
import { capturarTamanos, sinScorePop } from '../../src/juegos.js';

/**
 * Cambia el `pokemonId` del siguiente `GUESS_POKEMON` que envía la página (su `/ws` pasa por aquí) por uno que no está en
 * el tablero: así se fuerza un rechazo del servidor que la interfaz nunca dejaría enviar.
 */
async function adivinanzasTrucables(page: Page): Promise<{ trucarSiguiente(): void }> {
  let trucar = false;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const texto = String(message);
      if (trucar && texto.includes('"GUESS_POKEMON"')) {
        trucar = false;
        server.send(texto.replace(/"pokemonId":\s*"[^"]*"/, '"pokemonId":"missingno-e2e"'));
        return;
      }
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  return { trucarSiguiente() { trucar = true; } };
}

/**
 * Quién es Quién Pokémon con tres jugadores (el Equipo Azul tiene dos y abre la partida), el secreto elegido por cada
 * equipo sin plazo y 90 s por turno. Cada equipo elige su secreto en el diálogo; el secreto solo está en el DOM de su
 * equipo. Turno 1 (Azul): cartas bajadas y levantadas con ratón y teclado (compartidas con el compañero, nunca con el
 * rival), el cursor del compañero sobre el tablero (sin tapar las cartas ni animarse con movimiento reducido), un
 * intento que el servidor rechaza (el aviso global, el foco de vuelta en «Confirmar» y el cursor sin borrar el aviso) y
 * un fallo que pasa el turno. Turno 2 (Rojo): acierta el secreto azul, leído de la página de Azul. Se capturan los
 * ajustes, el tablero con el cursor, el diálogo, el turno del rival y la clasificación.
 */
test('who-is-who-pokemon: secretos elegidos, cartas bajadas, cursores, un rechazo, un fallo, el acierto y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Quién es Quién — Pokémon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('radio', { name: 'Por el equipo' }).click();
    await expect(host.page.getByRole('radio', { name: 'Por el equipo' })).toHaveAttribute('aria-checked', 'true');
    const plazo = host.page.getByRole('slider', { name: 'Tiempo para elegir secreto' });
    await plazo.focus();
    await plazo.press('Home');
    await plazo.blur();
    await expect(plazo).toHaveValue('0');
    await expect(host.page.getByText('Sin límite', { exact: true })).toBeVisible();
    await host.page.getByRole('radio', { name: '90 s' }).click();
    await expect(host.page.getByRole('radio', { name: '90 s' })).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('switch', { name: 'Incluir formas regionales y variantes' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.getByRole('radio', { name: '90 s' }).scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-who-is-who-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    const trucadores = new Map<Page, { trucarSiguiente(): void }>();
    for (const { page } of jugadores) {
      trucadores.set(page, await adivinanzasTrucables(page));
      await page.reload();
      await page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
      await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    }
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const secretoEn = (page: Page) => page.getByTestId('who-secret');
    const tablero = (page: Page) => page.getByTestId('who-board');
    const carta = (page: Page, nombre: string) => tablero(page).getByRole('button', { name: `Bajar ${nombre}`, exact: true });
    const placa = (page: Page) => page.locator('#social-plate-title');
    const adivinar = (page: Page) => page.getByRole('button', { name: 'Adivinar Pokémon' });
    const sinBody = (page: Page) => page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body);
    const leerSecreto = async (page: Page) => (await secretoEn(page).locator('[data-part="name"]').innerText()).trim();

    // Equipos: Azul abre la partida con dos jugadores (por el reparto alterno del motor); Rojo, con uno.
    for (const page of paginas) await expect(titulo(page)).toHaveText(/Elegid vuestro Pokémon secreto/, { timeout: 20_000 });
    const azules: Page[] = [];
    for (const page of paginas) if (await page.getByRole('heading', { name: 'Tablero del Equipo Azul' }).isVisible()) azules.push(page);
    expect(azules, 'el Equipo Azul tiene dos jugadores').toHaveLength(2);
    const [azul, companero] = azules as [Page, Page];
    const rojo = paginas.find((page) => !azules.includes(page))!;
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);

    // Cada equipo elige su secreto en el diálogo (con el buscador del tablero, sin plazo).
    const elegir = async (page: Page, indice: number) => {
      await page.getByRole('button', { name: 'Elegir nuestro Pokémon' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Elige vuestro Pokémon secreto' });
      await expect(dialogo).toBeVisible();
      await dialogo.locator('[data-candidate]').nth(indice).click();
      await dialogo.getByTestId('who-confirm').click();
      await expect(dialogo).toBeHidden({ timeout: 5_000 });
    };
    await elegir(azul, 0);
    await expect(placa(rojo)).toHaveText('Elegid vuestro Pokémon secreto');
    await expect(rojo.getByTestId('who-team-BLUE')).toContainText('Secreto elegido');
    await elegir(rojo, 1);
    await expect(titulo(azul)).toHaveText('Vuestro turno', { timeout: 10_000 });
    const secretoAzul = await leerSecreto(azul);
    const secretoRojo = await leerSecreto(rojo);
    // El compañero ve el mismo secreto; el rival solo el suyo (el secreto ajeno no está en ningún panel de su DOM).
    expect(await leerSecreto(companero)).toBe(secretoAzul);
    await expect(secretoEn(rojo)).toHaveCount(1);
    await expect(secretoEn(rojo)).not.toContainText(secretoAzul);
    await expect(secretoEn(azul)).not.toContainText(secretoRojo);
    await expect(titulo(rojo)).toHaveText('Turno del Equipo Azul');
    await expect(placa(rojo)).toHaveText('Os toca responder');
    await expect(rojo.getByRole('button', { name: 'Terminar turno' })).toHaveCount(0);
    await expect(adivinar(rojo)).toBeDisabled();
    await expect(viva(azul)).toHaveText('Turno 1: os toca a vosotros.');

    // Cartas que no son ninguno de los secretos (y un fallo para luego).
    const nombres = (await tablero(azul).locator('[data-pokemon-id] [data-part="name"]').allInnerTexts()).map((nombre) => nombre.trim());
    const libres = nombres.filter((nombre) => nombre !== secretoAzul && nombre !== secretoRojo);
    const [c1, c2, c3, fallo] = libres as [string, string, string, string];
    // Ratón: baja c1; el compañero la ve bajada; el rival, no.
    await carta(azul, c1).click();
    await expect(carta(azul, c1)).toHaveAttribute('aria-pressed', 'true');
    await expect(carta(azul, c1)).toContainText('Bajada');
    await expect(carta(companero, c1)).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await expect(carta(rojo, c1)).toHaveAttribute('aria-pressed', 'false');
    // Teclado: Tab entra en una sola carta (la última usada), las flechas se mueven y Espacio baja.
    await carta(azul, c2).focus();
    await azul.keyboard.press('Space');
    await expect(carta(azul, c2)).toHaveAttribute('aria-pressed', 'true');
    await azul.keyboard.press('End');
    await expect(tablero(azul).locator('button[data-pokemon-id]').last()).toBeFocused();
    await azul.keyboard.press('Home');
    await expect(tablero(azul).locator('button[data-pokemon-id]').first()).toBeFocused();
    await expect(tablero(azul).locator('button[data-pokemon-id][tabindex="0"]')).toHaveCount(1);
    // Ratón otra vez: levanta c2 y baja c3.
    await carta(azul, c2).click();
    await expect(carta(azul, c2)).toHaveAttribute('aria-pressed', 'false');
    await carta(azul, c3).click();
    await expect(carta(companero, c3)).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await expect(azul.getByText(`2 de ${nombres.length} bajadas`)).toBeVisible();

    // El cursor del compañero: se ve en la página de Azul con su nombre y no tapa la carta que señala.
    const cursorDe = (page: Page, nombre: string) => page.getByTestId('who-cursor').and(page.locator(`[data-player="${nombre}"]`));
    const senalar = async (page: Page, nombre: string) => {
      const caja = (await carta(page, nombre).boundingBox())!;
      await page.mouse.move(caja.x + caja.width * 0.3, caja.y + caja.height * 0.3);
      await page.mouse.move(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5, { steps: 4 });
    };
    await senalar(companero, c1);
    await expect(cursorDe(azul, nombreDe(companero))).toBeVisible({ timeout: 5_000 });
    expect(await sinTapar(carta(azul, c1)), 'el cursor no tapa la carta (no captura el puntero)').toBe(true);
    // La etiqueta va fuera de la franja del nombre de la carta señalada y, quieta 1,5 s, se apaga (queda la flecha).
    const etiqueta = cursorDe(azul, nombreDe(companero)).getByTestId('who-cursor-name');
    await expect(etiqueta).toHaveAttribute('data-quiet', 'false');
    const [cajaEtiqueta, cajaNombre] = await Promise.all([etiqueta.boundingBox(), carta(azul, c1).locator('[data-part="name"]').boundingBox()]);
    const pisa = cajaEtiqueta!.x < cajaNombre!.x + cajaNombre!.width && cajaNombre!.x < cajaEtiqueta!.x + cajaEtiqueta!.width && cajaEtiqueta!.y < cajaNombre!.y + cajaNombre!.height && cajaNombre!.y < cajaEtiqueta!.y + cajaEtiqueta!.height;
    expect(pisa, 'la etiqueta del cursor no pisa el nombre de la carta señalada').toBe(false);
    // Ni la marca «Bajada» de la carta señalada (c1 está bajada).
    const marca = await carta(azul, c1).getByText('Bajada', { exact: true }).boundingBox();
    if (marca) {
      const tapa = cajaEtiqueta!.x < marca.x + marca.width && marca.x < cajaEtiqueta!.x + cajaEtiqueta!.width && cajaEtiqueta!.y < marca.y + marca.height && marca.y < cajaEtiqueta!.y + cajaEtiqueta!.height;
      expect(tapa, 'la etiqueta del cursor no tapa la marca «Bajada»').toBe(false);
    }
    await expect(etiqueta).toHaveAttribute('data-quiet', 'true', { timeout: 3_000 });
    await senalar(companero, c1);
    // Con movimiento reducido (por defecto en la suite) no se anima; sin él, una transición corta de `transform`.
    expect(await cursorDe(azul, nombreDe(companero)).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await conMovimiento(azul);
    expect(await cursorDe(azul, nombreDe(companero)).evaluate((el) => `${getComputedStyle(el).transitionProperty} ${getComputedStyle(el).transitionDuration}`)).toBe('transform 0.08s');
    await azul.emulateMedia({ reducedMotion: 'reduce' });
    // El rival nunca recibe los cursores de Azul.
    await expect(rojo.getByTestId('who-cursor')).toHaveCount(0);
    // Tablero con el cursor a los tres tamaños (el cursor caduca a los 4 s quieto: se mueve antes de cada captura).
    const cartas: Record<number, number> = {};
    for (const { w, h } of SIZES) {
      await azul.setViewportSize({ width: w, height: h });
      await azul.evaluate(() => window.scrollTo(0, 0));
      await senalar(companero, c1);
      await expect(cursorDe(azul, nombreDe(companero))).toBeVisible({ timeout: 5_000 });
      await azul.waitForFunction(() => [...document.images].every((img) => img.complete), undefined, { timeout: 3_000 }).catch(() => undefined);
      const { id, problems } = await layoutProblems(azul, 'juego-who-is-who-tablero', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
      cartas[w] = Number(await tablero(azul).getAttribute('data-card'));
      // En escritorio el tablero de 24 cabe entero: su panel no se desplaza.
      if (w >= 1024) expect(await tablero(azul).evaluate((el) => { const cuerpo = el.closest('[role="region"]')!; return cuerpo.scrollHeight - cuerpo.clientHeight; }), `${w}: el tablero cabe sin desplazar`).toBeLessThanOrEqual(1);
    }
    test.info().annotations.push({ type: 'cartas', description: `ancho de carta a 1280: ${cartas[1280]} px; a 1920: ${cartas[1920]} px; a 390: ${cartas[390]} px` });
    expect(cartas[1920]!, 'a 1920 las cartas crecen').toBeGreaterThan(cartas[1280]! * 1.25);
    // A 390×844 sin desplazar: el tablero y las acciones del turno.
    await azul.evaluate(() => window.scrollTo(0, 0));
    await expect(tablero(azul)).toBeInViewport();
    await expect(adivinar(azul)).toBeInViewport({ ratio: 1 });
    await expect(azul.getByRole('button', { name: 'Terminar turno' })).toBeInViewport({ ratio: 1 });
    // Placa compacta: se ven al menos dos filas enteras del tablero, sin tapar.
    const columnas = Number(await tablero(azul).getAttribute('data-columns'));
    const segundaFila = tablero(azul).locator('button[data-pokemon-id]').nth(columnas);
    await expect(segundaFila).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(segundaFila), 'a 390: la segunda fila del tablero sin tapar por la placa').toBe(true);
    await azul.setViewportSize({ width: 1280, height: 720 });

    // «Adivinar Pokémon»: el diálogo del catálogo con todas las cartas (las bajadas lo dicen) y el buscador.
    await adivinar(azul).click();
    const dialogo = azul.getByRole('dialog', { name: 'Adivinar Pokémon' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.locator('[data-candidate]')).toHaveCount(nombres.length);
    await expect(dialogo.getByRole('button', { name: `${c1} (bajada)` })).toBeVisible();
    await expect(dialogo.getByRole('textbox', { name: 'Buscar en el tablero' })).toBeFocused();
    await dialogo.getByRole('textbox', { name: 'Buscar en el tablero' }).fill(fallo);
    await dialogo.getByRole('button', { name: fallo, exact: true }).click();
    await expect(dialogo.getByTestId('who-confirm')).toHaveText(`Confirmar ${fallo}`);
    await capturarTamanos(azul, 'dialogo-who-is-who-adivinar', { sigue: dialogo });
    // Un intento que el servidor rechaza: el aviso global lo dice, el diálogo sigue abierto y el foco vuelve a «Confirmar».
    trucadores.get(azul)!.trucarSiguiente();
    await dialogo.getByTestId('who-confirm').click();
    await expect(azul.getByRole('alert').filter({ hasText: 'Ese Pokémon no está en el tablero.' })).toBeVisible({ timeout: 5_000 });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByTestId('who-confirm')).toBeFocused();
    // Cerrar y mover el ratón por el tablero (cursores por su canal propio): el aviso sigue ahí.
    await azul.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await senalar(azul, c3);
    await expect(cursorDe(companero, nombreDe(azul))).toBeVisible({ timeout: 5_000 });
    await expect(azul.getByRole('alert').filter({ hasText: 'Ese Pokémon no está en el tablero.' })).toBeVisible();
    // El fallo de verdad: pasa el turno al Equipo Rojo.
    await adivinar(azul).click();
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('textbox', { name: 'Buscar en el tablero' }).fill(fallo);
    await dialogo.getByRole('button', { name: fallo, exact: true }).click();
    await dialogo.getByTestId('who-confirm').click();
    await expect(dialogo).toBeHidden({ timeout: 5_000 });
    await expect(titulo(azul)).toHaveText('Turno del Equipo Rojo', { timeout: 5_000 });
    await expect.poll(() => sinBody(azul), { timeout: 3_000 }).toBe(true);
    await expect(azul.getByText(`Tu intento con ${fallo} no era: turno terminado.`)).toBeVisible();
    await expect(viva(rojo)).toHaveText(`${nombreDe(azul)} (Equipo Azul) probó ${fallo}: no era. Turno 2: os toca a vosotros.`);
    await expect(titulo(rojo)).toHaveText('Vuestro turno');
    await expect(rojo.getByTestId('who-guess').first()).toContainText(fallo);
    await expect(rojo.getByTestId('who-guess').first()).toContainText('No era');
    await capturarTamanos(rojo, 'juego-who-is-who-turno-rival', { sigue: titulo(rojo).filter({ hasText: 'Vuestro turno' }) });

    // Turno 2: Rojo acierta el secreto azul (leído de la página de Azul) y gana.
    await adivinar(rojo).click();
    const dialogoRojo = rojo.getByRole('dialog', { name: 'Adivinar Pokémon' });
    await dialogoRojo.getByRole('textbox', { name: 'Buscar en el tablero' }).fill(secretoAzul);
    await dialogoRojo.getByRole('button', { name: new RegExp(`^${secretoAzul.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(bajada\\))?$`) }).click();
    await dialogoRojo.getByTestId('who-confirm').click();
    for (const page of paginas) await expect(page.getByRole('heading', { name: '¡Ganó el Equipo Rojo!', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByTestId('who-result-BLUE')).toContainText(`Secreto: ${secretoAzul}`);
    await expect(host.page.getByTestId('who-result-RED')).toContainText(`Secreto: ${secretoRojo}`);
    await expect(host.page.getByText('El Equipo Rojo adivinó el secreto rival: cada uno de sus jugadores suma 10 puntos.')).toBeVisible();
    await expect(host.page.getByText('1 acierto · 0 fallos')).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-who-is-who-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
