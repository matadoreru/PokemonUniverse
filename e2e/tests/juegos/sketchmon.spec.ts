/**
 * E2E de Sketchmon (`sketchmon`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, primeraVisible, buscadorRespuesta, adivinar, juegoEnTrama, sinScorePop, tramasRetenibles, comoPalabra, sinMomento } from '../../src/juegos.js';

/**
 * Sketchmon con tres jugadores y una vuelta (el motor da un dibujo por jugador: tres turnos). En el primero quien dibuja
 * traza con el ratón, cambia el color con el teclado y por nombre, deshace y rehace, borra con la goma, limpia y lo
 * recupera con Ctrl+Z; los demás ven los trazos en directo (`data-stroke-count`) y nunca el secreto. Un fallo, el acierto
 * al segundo intento y la revelación (6 s, retenida en la página de B); los otros dos turnos, a la primera; clasificación
 * con la galería. Capturas de los ajustes, del lienzo de quien dibuja, del de quien adivina, de la revelación y de la
 * clasificación a los tres tamaños.
 */
test('sketchmon: dibujar con herramientas, adivinar con un fallo, la revelación y la galería', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Sketchmon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('radio', { name: '120 s' }).click();
    await expect(host.page.getByRole('radio', { name: '120 s' })).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('slider', { name: 'Vueltas' })).toHaveValue('1');
    for (const nombre of ['Memoria de 3 segundos', 'Pistas automáticas', 'Formas compatibles']) await expect(host.page.getByRole('switch', { name: nombre })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.getByRole('slider', { name: 'Vueltas' }).scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-sketchmon-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 6 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const secretoEn = (page: Page) => page.getByTestId('sketch-secret');
    const lienzo = (page: Page) => page.getByTestId('sketch-canvas');
    const directo = (page: Page) => page.getByTestId('sketch-live');
    const herramientas = (page: Page) => page.getByRole('region', { name: 'Herramientas de dibujo' });
    const trazos = (locator: Locator) => locator.getAttribute('data-stroke-count').then(Number);
    /** Quien dibuja el turno `n`: la única página que pinta el secreto; el nombre se lee de su carta. */
    const turno = async (n: number) => {
      for (const page of paginas) await expect(page.getByText(`Dibujo ${n} de 3 · Vuelta 1 de 1`)).toBeVisible({ timeout: 20_000 });
      const dibujante = await primeraVisible(paginas, (page) => secretoEn(page));
      const secreto = (await secretoEn(dibujante).locator('[data-part="name"]').innerText()).trim();
      return { dibujante, secreto, otras: paginas.filter((page) => page !== dibujante) as [Page, Page] };
    };
    /** Un trazo con el ratón dentro del lienzo, de (x1, y1) a (x2, y2) en fracciones de su tamaño. */
    const trazar = async (page: Page, [x1, y1]: [number, number], [x2, y2]: [number, number]) => {
      const caja = (await lienzo(page).boundingBox())!;
      await page.mouse.move(caja.x + caja.width * x1, caja.y + caja.height * y1);
      await page.mouse.down();
      await page.mouse.move(caja.x + caja.width * x2, caja.y + caja.height * y2, { steps: 10 });
      await page.mouse.up();
    };

    // Turno 1: quien dibuja ve su secreto; los demás, no (ni en el DOM).
    const { dibujante, secreto, otras } = await turno(1);
    const [g1, g2] = otras;
    await expect(titulo(dibujante)).toHaveText(`Dibuja a ${secreto}`);
    await expect(titulo(g1)).toHaveText(`¿Qué Pokémon dibuja ${nombreDe(dibujante)}?`);
    for (const page of otras) {
      await expect(secretoEn(page)).toHaveCount(0);
      await expect(herramientas(page)).toHaveCount(0);
      expect(await page.content(), 'el DOM de quien adivina no tiene el secreto').not.toMatch(comoPalabra(secreto));
      await expect(page.getByText('Esperando el primer trazo…')).toBeVisible();
    }
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);

    // Dos trazos con el ratón: llegan en directo a los demás.
    await trazar(dibujante, [0.2, 0.3], [0.7, 0.35]);
    await trazar(dibujante, [0.3, 0.6], [0.5, 0.8]);
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(2);
    // El color con el teclado (flechas en la paleta) y por su nombre; el nombre del elegido se ve escrito.
    await herramientas(dibujante).getByRole('radio', { name: 'Negro' }).focus();
    await dibujante.keyboard.press('ArrowRight');
    await expect(herramientas(dibujante).getByRole('radio', { name: 'Blanco' })).toBeFocused();
    await expect(dibujante.getByTestId('sketch-color-name')).toHaveText('Color: Blanco');
    await herramientas(dibujante).getByRole('radio', { name: 'Rojo' }).click();
    await expect(dibujante.getByTestId('sketch-color-name')).toHaveText('Color: Rojo');
    await herramientas(dibujante).getByRole('radio', { name: 'Muy grueso' }).click();
    await trazar(dibujante, [0.6, 0.6], [0.85, 0.7]);
    await expect.poll(() => trazos(directo(g2)), { timeout: 5_000 }).toBe(3);
    // Deshacer y rehacer (botones con nombre).
    await herramientas(dibujante).getByRole('button', { name: 'Deshacer último trazo' }).click();
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(2);
    await herramientas(dibujante).getByRole('button', { name: 'Rehacer último trazo' }).click();
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(3);
    // La goma es un trazo más (borra lo que pisa).
    await herramientas(dibujante).getByRole('radio', { name: 'Goma' }).click();
    await expect(lienzo(dibujante)).toHaveAttribute('aria-label', /Goma: arrastra para borrar/);
    await trazar(dibujante, [0.2, 0.3], [0.45, 0.32]);
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(4);
    // Limpiar no pide confirmación (como antes) porque se deshace: Ctrl+Z lo recupera.
    await herramientas(dibujante).getByRole('button', { name: 'Limpiar lienzo' }).click();
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(0);
    await dibujante.keyboard.press('Control+z');
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(4);
    await herramientas(dibujante).getByRole('radio', { name: 'Lápiz' }).click();
    // Con el ratón encima del lienzo, quien dibuja ve un punto del color elegido (Rojo) en lugar de la cruz; al salir, se va.
    const cursor = dibujante.getByTestId('sketch-brush-cursor');
    await expect(cursor).toBeHidden();
    const caja = (await lienzo(dibujante).boundingBox())!;
    await dibujante.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await expect(cursor).toBeVisible();
    await expect(lienzo(dibujante)).toHaveCSS('cursor', 'none');
    expect(await cursor.locator('span').evaluate((punto) => getComputedStyle(punto).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(g1.getByTestId('sketch-brush-cursor')).toHaveCount(0);
    await dibujante.mouse.move(caja.x - 20, caja.y - 20);
    await expect(cursor).toBeHidden();
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);

    await capturarTamanos(dibujante, 'juego-sketchmon-dibujar', { sigue: secretoEn(dibujante) });
    // A 1920 el lienzo crece para llenar el hueco.
    const ancho = async (w: number, h: number) => { await dibujante.setViewportSize({ width: w, height: h }); return (await lienzo(dibujante).boundingBox())!.width; };
    const a1280 = await ancho(1280, 720);
    const a1920 = await ancho(1920, 1080);
    test.info().annotations.push({ type: 'lienzo', description: `ancho a 1280: ${Math.round(a1280)} px; a 1920: ${Math.round(a1920)} px` });
    expect(a1920, 'a 1920 el lienzo es mayor que a 1280').toBeGreaterThan(a1280 * 1.4);
    // El lienzo se lleva el alto de la escena (herramientas en la columna del secreto): antes medía 374 y 722 px de ancho.
    expect(a1280, 'a 1280 el lienzo de quien dibuja ocupa la escena').toBeGreaterThan(440);
    expect(a1920, 'a 1920 el lienzo de quien dibuja ocupa la escena').toBeGreaterThan(760);
    // A 390×844 sin desplazar: el lienzo y las herramientas (pegadas abajo) a la vista; con el lienzo arriba, entero y sin tapar.
    await dibujante.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await dibujante.evaluate(() => window.scrollTo(0, 0));
    await expect(lienzo(dibujante)).toBeInViewport();
    await expect(herramientas(dibujante)).toBeInViewport({ ratio: 1 });
    test.info().annotations.push({ type: 'lienzo-390', description: `sin desplazar, a la vista y sin tapar: ${await sinTapar(lienzo(dibujante))}` });
    await lienzo(dibujante).scrollIntoViewIfNeeded();
    await expect(lienzo(dibujante)).toBeInViewport({ ratio: 1 });
    await expect(herramientas(dibujante)).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(lienzo(dibujante)), 'a 390: el lienzo sin tapar por las herramientas').toBe(true);
    await dibujante.setViewportSize({ width: 1280, height: 720 });

    // Un fallo de g1: la región viva y los intentos públicos (también para g2).
    const fallo = secreto === 'Pikachu' ? 'Bulbasaur' : 'Pikachu';
    await adivinar(g1, fallo);
    await expect(viva(g1)).toContainText(`${fallo} no era.`, { timeout: 5_000 });
    await expect(g2.getByTestId('guess-attempt').filter({ hasText: fallo })).toContainText(`${nombreDe(g1)} probó`, { timeout: 5_000 });
    await expect(g1.getByText('Tu respuesta · 1 intento')).toBeVisible();
    await capturarTamanos(g2, 'juego-sketchmon-adivinar', { sigue: titulo(g2).filter({ hasText: '¿Qué Pokémon dibuja' }) });
    // Quien adivina: el lienzo en directo sin barra de título y con la placa del buscador en una fila (antes, 316 px a 1280).
    expect((await directo(g2).boundingBox())!.width, 'a 1280 el lienzo en directo ocupa la escena').toBeGreaterThan(440);
    // A 390×844 sin desplazar: el lienzo en directo y el buscador.
    await g2.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await g2.evaluate(() => window.scrollTo(0, 0));
    await expect(directo(g2)).toBeInViewport();
    await expect(buscadorRespuesta(g2)).toBeInViewport({ ratio: 1 });
    test.info().annotations.push({ type: 'directo-390', description: `lienzo entero y sin tapar sin desplazar: ${await sinTapar(directo(g2))}` });
    await g2.setViewportSize({ width: 1280, height: 720 });

    // El acierto de g1 (segundo intento); B retiene la revelación para capturarla.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'sketchmon')?.phase === 'ROUND_RESULTS');
    await expect(g1.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await adivinar(g1, secreto);
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect(b.page.getByTestId('sketch-reveal-summary')).toContainText(`${nombreDe(g1)} acertó ${secreto} en 2 intentos`);
    await expect(viva(b.page)).toContainText(`Dibujo 1 terminado. ${nombreDe(g1)} acertó ${secreto} en 2 intentos`);
    await expect.poll(() => trazos(b.page.getByTestId('sketch-final'))).toBe(4);
    // Al cambiar de fase el foco de quien acertó no cae al `body`.
    await expect(titulo(g1)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect.poll(() => g1.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), { timeout: 3_000 }).toBe(true);
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(g1) })).toContainText('Acertó · 2 intentos');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(dibujante) })).toContainText('+3');
    // Sin el cut-in del ganador (1,4 s): la captura muestra la revelación.
    await sinMomento(b.page);
    await capturarTamanos(b.page, 'juego-sketchmon-revelacion', { sigue: titulo(b.page).filter({ hasText: `¡Era ${secreto}!` }) });
    retenedor.soltar();

    // Turnos 2 y 3: un trazo y quien adivina acierta a la primera.
    for (const n of [2, 3]) {
      const siguiente = await turno(n);
      await trazar(siguiente.dibujante, [0.3, 0.3], [0.6, 0.6]);
      await adivinar(siguiente.otras[0], siguiente.secreto);
      await expect(titulo(siguiente.otras[0])).toHaveText(`¡Era ${siguiente.secreto}!`, { timeout: 10_000 });
    }

    // Clasificación: métricas en texto, sin medallas, y la galería con los tres dibujos.
    await expect(host.page.getByRole('heading', { name: 'La galería de la partida', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ adivinados? · \d+ al primer intento · 1\/1 dibujos descubiertos · \+\d+ adivinando · \+3 dibujando$/)).toHaveCount(3);
    await expect(host.page.getByTestId('sketch-gallery-item')).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-sketchmon-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
