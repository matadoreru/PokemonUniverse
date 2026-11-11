/**
 * E2E de Higher or Lower: Cartas (`tcg-higher-lower`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, SIZES } from '../../src/helpers.js';
import { UNAVAILABLE, capturarTamanos, sinScorePop, textoDeMain } from '../../src/juegos.js';

/**
 * Higher or Lower: Cartas con 5 rondas (el mínimo del contrato). En la primera: el duelo con «¿? €», las tres píldoras
 * a la vista a 390×844, una respuesta distinta por jugador (clic, atajo 3 y teclado con el foco en la placa) y el
 * revelado con los dos precios y qué eligió cada uno, capturado a los tres tamaños a la vez (dura 3 s). Las demás se
 * responden con «Más» hasta la clasificación. Las imágenes de las cartas vienen de TCGdex, como en el test genérico: no
 * se interceptan ni se comprueban (si no cargan, la carta queda sin imagen y el test no depende de ello).
 */
test('tcg-higher-lower: el duelo de precios, el revelado con lo que eligió cada uno y la clasificación', async ({ browser }) => {
  test.setTimeout(150_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Higher or Lower: Cartas');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('5');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    // Sin cartas TCG en la BD local el servidor lo declara no disponible, como en el test genérico.
    const outcome = await Promise.race([
      host.page.getByRole('heading', { name: 'Lobby de la sala' }).waitFor({ state: 'hidden', timeout: 15_000 }).then(() => 'started' as const),
      host.page.getByRole('alert').filter({ hasText: UNAVAILABLE['tcg-higher-lower']! }).first().waitFor({ timeout: 15_000 }).then(() => 'unavailable' as const),
    ]);
    test.skip(outcome === 'unavailable', 'Sin cartas TCG en la BD local');
    await esperarPartida(jugadores.map((j) => j.page));

    const pildora = (page: Page, nombre: 'Más' | 'Igual' | 'Menos') => page.getByRole('button', { name: nombre, exact: true });
    const movil = invitados[1]!.page;
    const ultimo = invitados[0]!.page;
    await expect(host.page.getByText('Ronda 1 de 5', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(pildora(host.page, 'Más')).toBeVisible({ timeout: 10_000 });
    // Antes de revelar: el precio de la nueva carta es «¿? €» y no hay franja de precios.
    await expect(host.page.locator('[data-tcg-price="current"]')).toHaveText(/^¿\? \S+$/);
    await expect(host.page.getByTestId('tcg-prices')).toHaveCount(0);
    const antes = await textoDeMain(host.page);
    await capturarTamanos(host.page, 'juego-tcg-higher-lower-duelo', { sigue: pildora(host.page, 'Más') });

    // A 390×844 sin desplazar: las dos cartas, el tiempo y las tres respuestas, sin que la placa tape las cartas.
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await movil.evaluate(() => window.scrollTo(0, 0));
    for (const nombre of ['Más', 'Igual', 'Menos'] as const) await expect(pildora(movil, nombre), `${nombre} a la vista a 390×844`).toBeInViewport({ ratio: 1 });
    const cartas = [movil.locator('[data-tcg-card="previous"]'), movil.locator('[data-tcg-card="current"]')];
    for (const carta of cartas) await expect(carta, 'carta del duelo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    const inferior = await movil.locator('[data-layer="screen-bottom"]').boundingBox();
    for (const carta of cartas) {
      const caja = await carta.boundingBox();
      expect(caja!.y + caja!.height, 'la placa no tapa las cartas a 390×844').toBeLessThanOrEqual(inferior!.y + 1);
    }

    // Cada página a su tamaño antes de la última respuesta: el revelado dura 3 s y se captura a la vez.
    const capturas = [
      { page: host.page, w: SIZES[0].w, h: SIZES[0].h },
      { page: ultimo, w: SIZES[1].w, h: SIZES[1].h },
      { page: movil, w: SIZES[2].w, h: SIZES[2].h },
    ];
    for (const { page, w, h } of capturas) await page.setViewportSize({ width: w, height: h });
    // Tres respuestas distintas: exactamente una acierta. El anfitrión pulsa «Más»; el del móvil, el atajo 3 («Menos»);
    // el último, «Igual» con el teclado: la píldora se desmonta y el foco pasa al título de la placa.
    await pildora(host.page, 'Más').click();
    await expect(host.page.getByRole('heading', { name: 'Respuesta Más bloqueada.' })).toBeVisible();
    await expect(movil.getByText('Respondió').first()).toBeVisible();
    await movil.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await movil.keyboard.press('3');
    await expect(movil.getByRole('heading', { name: 'Respuesta Menos bloqueada.' })).toBeVisible();
    await pildora(ultimo, 'Igual').focus();
    await ultimo.keyboard.press('Enter');
    await expect(ultimo.locator('[data-layer="screen-bottom"] h2')).toBeFocused();
    for (const { page } of capturas) await page.evaluate(() => window.scrollTo(0, 0));
    for (const { page } of capturas) await expect(page.getByTestId('tcg-prices')).toBeVisible({ timeout: 10_000 });
    const revelado = (page: Page) => page.getByText(/^Respuesta: (Más|Igual|Menos)$/);
    const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, 'juego-tcg-higher-lower-revelacion', true)));
    for (const { page } of capturas) await expect(revelado(page), 'el revelado sigue en pantalla tras la captura').toBeVisible({ timeout: 500 });
    for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    // Qué eligió cada uno, con texto: un acierto y dos fallos; y los dos precios en la franja.
    await expect(host.page.locator('[data-outcome="hit"]')).toHaveCount(1);
    await expect(host.page.locator('[data-outcome="miss"]')).toHaveCount(2);
    for (const eleccion of ['Eligió Más', 'Eligió Igual', 'Eligió Menos']) await expect(host.page.getByText(eleccion)).toHaveCount(1);
    const franja = await host.page.getByTestId('tcg-prices').innerText();
    const anterior = (await host.page.locator('[data-tcg-strip="previous"]').innerText()).trim();
    const nueva = (await host.page.locator('[data-tcg-strip="current"]').innerText()).trim();
    test.info().annotations.push({ type: 'tcg', description: `ronda 1: ${franja.replace(/\s+/g, ' ')}` });
    expect(nueva, 'precio de la nueva carta en la franja').toMatch(/\d/);
    if (nueva !== anterior) expect(antes, 'el precio de la nueva carta no estaba en la página antes de revelar').not.toContain(nueva);
    await expect(host.page.locator('[data-tcg-price="current"]')).toHaveText(nueva);
    for (const { page } of capturas) await page.setViewportSize({ width: 1280, height: 720 });

    // Las rondas 2 a 5: todos responden «Más» y la ronda se revela en el acto.
    for (const ronda of [2, 3, 4, 5]) {
      await expect(host.page.getByText(`Ronda ${ronda} de 5`, { exact: true })).toBeVisible({ timeout: 15_000 });
      for (const { page } of jugadores) await pildora(page, 'Más').click({ timeout: 10_000 });
      await expect(host.page.getByTestId('tcg-prices')).toBeVisible({ timeout: 10_000 });
    }

    const clasificacion = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower: Cartas' });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/^\d+ aciertos? de 5 · \d+ igual(es)? · mejor racha \d+ · \d+%$/)).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-tcg-higher-lower-clasificacion', { sigue: clasificacion });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
