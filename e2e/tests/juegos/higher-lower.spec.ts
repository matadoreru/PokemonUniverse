/**
 * E2E de Higher or Lower (`higher-lower`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, SIZES } from '../../src/helpers.js';
import { capturarTamanos, elegirModo, ajustarRango, comprobarChipDeCarta, capturarMostrando, comprobarTituloDeCabecera, comprobarAlturaDeCartas } from '../../src/juegos.js';

test('higher-lower: revelado y clasificación', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Higher or Lower');
    // Una sola ronda para llegar a la clasificación final.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // Toda imagen que pidan los navegadores durante la partida: ninguna puede llevar el número de Pokédex (la respuesta
    // de la categoría N.º Pokédex) ni la ruta numérica de los sprites de PokéAPI.
    const imagenes: string[] = [];
    for (const { page } of jugadores) page.on('request', (r) => { if (r.resourceType() === 'image') imagenes.push(r.url()); });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const proxy = /^\/api\/pokemon\/[a-z][a-z0-9-]*\/sprite$/;
    const sprites = host.page.locator('[data-hl-card] img');
    await expect(sprites).toHaveCount(2, { timeout: 20_000 });
    for (const src of await sprites.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src))) {
      expect(new URL(src).pathname, 'sprite de Higher or Lower por el proxy').toMatch(proxy);
    }
    await expect.poll(() => imagenes.filter((url) => proxy.test(new URL(url).pathname)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

    // Ronda activa: a 390×844, sin desplazar, lo necesario para responder está a la vista a la vez: las dos cartas, la
    // stat que se compara, el tiempo y las tres respuestas (en la pantalla inferior pegada abajo), sin que esta tape
    // las cartas.
    const mayor = (page: Page) => page.getByRole('button', { name: 'Mayor', exact: true });
    const movil = invitados[1]!.page;
    await expect(mayor(movil)).toBeVisible({ timeout: 20_000 });
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await movil.evaluate(() => window.scrollTo(0, 0));
    for (const nombre of ['Mayor', 'Igual', 'Menor']) await expect(movil.getByRole('button', { name: nombre, exact: true }), `${nombre} a la vista a 390×844`).toBeInViewport({ ratio: 1 });
    const cartas = [movil.locator('[data-hl-card="previous"]'), movil.locator('[data-hl-card="current"]')];
    for (const carta of cartas) await expect(carta, 'carta del duelo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('heading', { level: 1 }), 'stat comparada a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    const inferior = await movil.locator('[data-layer="screen-bottom"]').boundingBox();
    for (const carta of cartas) {
      const caja = await carta.boundingBox();
      expect(caja!.y + caja!.height, 'la pantalla inferior no tapa las cartas a 390×844').toBeLessThanOrEqual(inferior!.y + 1);
    }
    // Las barras solo existen al revelar: antes no hay ningún valor del actual en la página.
    const barras = (page: Page) => page.getByTestId('higher-lower-bars');
    await expect(barras(host.page)).toHaveCount(0);
    await expect(host.page.locator('[data-hl-card="current"]').getByText('???', { exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-higher-lower', { sigue: mayor(host.page) });

    // Todos responden: la ronda se revela en cuanto contesta el último y el revelado dura 3 s. Para que quepan los
    // tres tamaños, cada página se fija a un tamaño antes de la última respuesta y se capturan a la vez.
    const capturas = [
      { page: host.page, w: SIZES[0].w, h: SIZES[0].h },
      { page: invitados[0]!.page, w: SIZES[1].w, h: SIZES[1].h },
      { page: movil, w: SIZES[2].w, h: SIZES[2].h },
    ];
    for (const { page, w, h } of capturas) await page.setViewportSize({ width: w, height: h });
    // Cada jugador elige una respuesta distinta: exactamente uno acierta. Un observador anota si a alguien le sale el
    // «+N» (`ScorePop`), que solo dura 400 ms.
    for (const { page } of jugadores) {
      await page.evaluate(() => {
        const w = window as unknown as { scorePopVisto?: boolean };
        w.scorePopVisto = false;
        new MutationObserver(() => { if (document.querySelector('[data-testid="score-pop"]')) w.scorePopVisto = true; }).observe(document.body, { childList: true, subtree: true });
      });
    }
    // El anfitrión pulsa «Mayor»; el del móvil responde «Menor» con el atajo 3; el último, «Igual» con el teclado (Tab
    // hasta la píldora y Enter): la píldora se desmonta y el foco pasa al título de la placa, no se queda en el `body`.
    await mayor(host.page).click({ timeout: 20_000 });
    await movil.keyboard.press('3');
    await expect(movil.getByRole('heading', { name: 'Respuesta Menor bloqueada.' })).toBeVisible();
    const ultimo = invitados[0]!.page;
    await ultimo.getByRole('button', { name: 'Igual', exact: true }).focus();
    await ultimo.keyboard.press('Enter');
    await expect(ultimo.locator('[data-layer="screen-bottom"] h2')).toBeFocused();
    for (const { page } of capturas) await page.evaluate(() => window.scrollTo(0, 0));
    const revelado = (page: Page) => page.getByText(/^Respuesta: (Mayor|Igual|Menor)$/);
    for (const { page } of capturas) await expect(barras(page)).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText(/^Clasificación en \ds…$/)).toBeVisible();
    // Movimiento antes de capturar: con la reducción no anima nada; con movimiento, el relleno de la barra crece y la
    // racha del que acierta salta (solo transform).
    const barra = barras(host.page).locator('[data-bar="current"] [role="meter"] > i');
    const racha = host.page.locator('[data-streak].motion-bump');
    await expect(racha, 'solo salta la racha del que acierta').toHaveCount(1);
    expect(await animacionDe(barra), 'barra con reducción de movimiento').toBe('none');
    expect(await animacionDe(racha), 'racha con reducción de movimiento').toBe('none');
    await conMovimiento(host.page);
    expect(await animacionDe(barra), 'barra con movimiento').toMatch(/grow/);
    expect(await animacionDe(racha), 'racha con movimiento').toBe('motion-bump');
    await host.page.emulateMedia({ reducedMotion: 'reduce' });
    // Resultado con texto, no solo con color o glifo: un acierto (con su racha) y dos fallos.
    await expect(host.page.locator('[data-outcome="hit"]')).toHaveCount(1);
    await expect(host.page.locator('[data-outcome="hit"]')).toHaveText(/^\+\d+ acierto$/);
    await expect(host.page.locator('[data-outcome="miss"]')).toHaveText(['Fallo', 'Fallo']);
    await expect(host.page.locator('[data-outcome-line]', { hasText: /^Racha 1( · \+\d+ rapidez)?$/ })).toHaveCount(1);
    const nombre = 'juego-higher-lower-revelacion';
    const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, nombre, true)));
    for (const { page } of capturas) await expect(revelado(page), 'el revelado sigue en pantalla tras la captura').toBeVisible({ timeout: 500 });
    for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    const vistos = await Promise.all(jugadores.map(({ page }) => page.evaluate(() => (window as unknown as { scorePopVisto?: boolean }).scorePopVisto === true)));
    expect(vistos.filter(Boolean), 'el «+N» sale solo a quien acierta').toHaveLength(1);
    for (const { page } of capturas) await page.setViewportSize({ width: 1280, height: 720 });

    const clasificacion = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower' });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    // Plurales de las estadísticas: nunca «1 aciertos» ni «1 iguales».
    await expect(host.page.getByText(/\d+ aciertos? · \d+ igual(es)? · mejor racha/).first()).toBeVisible();
    await expect(host.page.getByText(/(^|\D)1 (aciertos|iguales)/)).toHaveCount(0);
    await capturarTamanos(host.page, 'juego-higher-lower-clasificacion', { sigue: clasificacion });
    // Celebración común (con reducción de movimiento): solo quien acertó gana; los otros dos, a cero, sin podio; nunca confeti.
    const celebraciones = await Promise.all(jugadores.map(async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Clasificación Higher or Lower' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('confetti')).toHaveCount(0);
      return page.locator('[data-celebration]').getAttribute('data-celebration', { timeout: 500 }).catch(() => null);
    }));
    expect(celebraciones.filter((c) => c === 'win'), 'una sola victoria').toHaveLength(1);
    expect(celebraciones.filter((c) => c === 'podium'), 'sin podio a cero puntos').toHaveLength(0);
    // Con movimiento, el confeti cae solo para quien gana, en una capa fija a toda la ventana.
    const ganador = jugadores[celebraciones.indexOf('win')]!.page;
    await conMovimiento(ganador);
    await expect(ganador.getByTestId('confetti')).toHaveCount(1);
    const capa = await ganador.getByTestId('confetti').boundingBox();
    const ventana = ganador.viewportSize();
    expect(capa && ventana && Math.round(capa.width) === ventana.width && Math.round(capa.height) === ventana.height, 'confeti a toda la ventana').toBe(true);
    for (const { page } of jugadores.filter(({ page }) => page !== ganador)) {
      await conMovimiento(page);
      await expect(page.getByTestId('confetti')).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await ganador.emulateMedia({ reducedMotion: 'reduce' });
    const delatoras = imagenes.filter((url) => /githubusercontent|\/sprites\/pokemon\/|\/\d+\.(png|gif|webp|svg)(\?|$)|\/pokemon\/\d+(\/|$)/.test(url));
    expect(delatoras, 'ninguna imagen de la partida delata el número de Pokédex').toEqual([]);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('higher-lower: panel de visibilidad', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, jugadores } = sala;
    const page = host.page;
    await seleccionarJuego(page, 'Higher or Lower');
    await page.getByRole('tab', { name: 'Configuración' }).click();
    const alRevelar = page.getByRole('radio', { name: 'Al revelar', exact: true });
    const enDirecto = page.getByRole('radio', { name: 'En directo', exact: true });
    const aviso = page.getByText('Permite copiar: los demás ven tu elección al momento.');
    await expect(alRevelar).toHaveAttribute('aria-checked', 'true');
    await expect(enDirecto).toHaveAttribute('aria-checked', 'false');
    await expect(aviso).toHaveCount(0);
    // El grupo de visibilidad queda bajo las categorías y la dificultad: captura de página completa desde arriba (con la
    // página desplazada, la cabecera fija taparía las categorías y el medidor lo cuenta como solape).
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-config-higher-lower', { completa: true });

    await enDirecto.click();
    await expect(enDirecto).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toBeVisible();
    // El aviso de copia a 390×844, donde el texto se parte en varias líneas.
    await page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await enDirecto.blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    const { id, problems } = await layoutProblems(page, 'lobby-config-higher-lower-en-directo', true, true);
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await alRevelar.click();
    await expect(aviso).toHaveCount(0);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('higher-lower: modo Racha infinita, fallos que eliminan y clasificación por racha', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Higher or Lower');
    await elegirModo(host.page, 'Racha infinita');
    // Sin número de rondas en este modo.
    await expect(host.page.getByRole('slider', { name: 'Número de rondas' })).toHaveCount(0);
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    const carta = await comprobarChipDeCarta(host.page, 'Higher or Lower', 'Racha infinita');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-racha-infinita', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const boton = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });
    await expect(boton(host.page, 'Mayor')).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('Racha infinita', { exact: true }).first()).toBeVisible();
    await expect(host.page.getByText('Ronda 1', { exact: true }).first()).toBeVisible();
    await comprobarTituloDeCabecera(host.page, 'Higher or Lower · Racha infinita');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-racha-infinita', { sigue: boton(host.page, 'Mayor') });

    // Cada uno responde distinto: Igual casi nunca acierta, así que cae al menos uno en cada ronda hasta que no quede nadie.
    const respuestas = ['Mayor', 'Menor', 'Igual'];
    const fin = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower' });
    let capturadaRonda2 = false;
    for (let ronda = 1; ronda <= 40 && !(await fin.isVisible()); ronda += 1) {
      await expect.poll(async () => {
        if (await fin.isVisible()) return true;
        for (const { page } of jugadores) if (await boton(page, 'Mayor').isVisible()) return true;
        return false;
      }, { timeout: 30_000 }).toBe(true);
      if (await fin.isVisible()) break;
      // A partir de la segunda ronda queda alguien con racha: su columna «N racha» a los tres tamaños.
      if (ronda === 2 && !capturadaRonda2) {
        capturadaRonda2 = true;
        const vivo = (await Promise.all(jugadores.map(async ({ page }) => (await boton(page, 'Mayor').isVisible()) ? page : null))).find(Boolean)!;
        await expect(vivo.locator('[data-streak]').filter({ hasText: /^\d+ racha$/ }).first()).toBeVisible();
        await capturarMostrando(vivo, 'juego-modo-racha-infinita-racha', vivo.locator('[data-streak]').filter({ hasText: /^\d+ racha$/ }).first(), { sigue: boton(vivo, 'Mayor') });
      }
      for (const [i, { page }] of jugadores.entries()) {
        if (await boton(page, 'Mayor').isVisible()) await boton(page, respuestas[i]!).click().catch(() => undefined);
      }
    }
    await expect(fin).toBeVisible({ timeout: 30_000 });
    await expect(host.page.getByText(/Higher or Lower · Racha infinita · \d+ rondas?/)).toBeVisible();
    await expect(host.page.getByText(/^Racha \d+$/).first()).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-racha-infinita-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
