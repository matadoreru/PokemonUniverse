/**
 * E2E de Shiny Quiz (`shiny-vote`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, elegirModo, ajustarRango, comprobarChipDeCarta, capturarMostrando, comprobarTituloDeCabecera, comprobarAlturaDeCartas } from '../../src/juegos.js';

test('shiny-vote: votos al revelar', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Shiny Quiz');
    // Panel del catálogo: seis opciones (el peor encaje a 1280×720), una sola ronda (para llegar a los resultados) y la
    // revelación de 6 s (la máxima): caben las capturas de la revelación.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const seis = host.page.getByRole('radiogroup', { name: 'Número de opciones' }).getByRole('radio', { name: '6', exact: true });
    await seis.click();
    await expect(seis).toHaveAttribute('aria-checked', 'true');
    const alRevelar = host.page.getByRole('radio', { name: 'Al revelar', exact: true });
    await expect(alRevelar).toHaveAttribute('aria-checked', 'true');
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    const revelacion = host.page.getByRole('slider', { name: 'Duración de la revelación' });
    await expect(revelacion).toHaveValue('4');
    await revelacion.focus();
    await revelacion.press('End');
    await revelacion.blur();
    await expect(revelacion).toHaveValue('6');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    // El modo de candidatos (cartas seleccionables) a la vista: está arriba del panel, que se ha desplazado hasta los deslizadores.
    await host.page.getByRole('group', { name: 'Opciones de Pokémon' }).scrollIntoViewIfNeeded();
    await capturarTamanos(host.page, 'lobby-config-shiny-vote', { completa: true });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida([host.page, invitado.page]);
    const normales: string[] = [];
    for (const { page } of jugadores) page.on('request', (r) => { if (/^\/api\/pokemon\/[^/]+\/sprite$/.test(new URL(r.url()).pathname)) normales.push(r.url()); });
    const opcionA = (page: Page) => page.locator('[data-shiny-option="A"]');
    for (const { page } of jugadores) await expect(opcionA(page)).toBeEnabled({ timeout: 20_000 });
    await expect(host.page.locator('[data-shiny-option]')).toHaveCount(6);
    const votantes = (page: Page) => page.locator('[data-testid^="shiny-voters-"]');

    // El host vota: el invitado ve que ha votado, pero ninguna carta muestra votantes hasta el revelado.
    await opcionA(host.page).click();
    await host.page.getByRole('button', { name: 'Confirmar voto' }).click();
    await expect(host.page.getByText('Voto confirmado:')).toBeVisible({ timeout: 10_000 });
    // La píldora y las cartas-botón desaparecen al confirmar: el foco no cae en `body`, va al título de la placa.
    await expect(host.page.getByRole('heading', { name: /Voto confirmado/ })).toBeFocused();
    expect(await host.page.evaluate(() => document.activeElement !== document.body && Boolean(document.activeElement?.closest('main'))), 'foco dentro de la pantalla del juego').toBe(true);
    await expect(invitado.page.getByText('Votó', { exact: true })).toHaveCount(1, { timeout: 10_000 });
    for (const { page } of jugadores) await expect(votantes(page)).toHaveCount(0);
    await expect(invitado.page.getByText('Votos al revelar')).toBeVisible();
    // El invitado elige con el teclado (B) sin confirmar: su carta queda seleccionada.
    await invitado.page.locator('body').press('b');
    await expect(invitado.page.locator('[data-shiny-option="B"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(invitado.page.getByText('Has seleccionado')).toBeVisible();
    await invitado.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(invitado.page, 'juego-shiny-vote-votos-al-revelar', { sigue: invitado.page.getByRole('button', { name: 'Confirmar voto' }) });
    // El host, con el voto ya bloqueado: cartas fijas y su elección en la pantalla inferior.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-shiny-vote-voto-confirmado', { sigue: host.page.getByText('Voto confirmado:') });

    // Antes de revelar nadie ha pedido el sprite normal: daría la respuesta.
    expect(normales).toEqual([]);

    // Vota el invitado: la ronda se revela y aparecen los votantes en las cartas. El host ve la animación.
    await conMovimiento(host.page);
    const spriteNormal = invitado.page.waitForResponse((r) => /^\/api\/pokemon\/[^/]+\/sprite$/.test(new URL(r.url()).pathname), { timeout: 15_000 });
    await opcionA(invitado.page).click();
    await invitado.page.getByRole('button', { name: 'Confirmar voto' }).click();
    const franja = (page: Page) => page.locator('[data-testid="shiny-before-after"]:visible');
    for (const { page } of jugadores) await expect(franja(page)).toBeVisible({ timeout: 10_000 });
    expect((await spriteNormal).status()).toBe(200);
    for (const { page } of jugadores) {
      await expect(votantes(page).first()).toBeVisible();
      await expect(franja(page).getByText('Normal', { exact: true })).toBeVisible();
      await expect(franja(page).getByText('Shiny', { exact: true })).toBeVisible();
    }
    await expect(votantes(host.page).filter({ hasText: '2 votos' })).toHaveCount(1);
    // La correcta gira (la animación del catálogo, `Card` con `flip`) solo con movimiento.
    const correcta = (page: Page) => page.locator('[data-shiny-option][data-correct="true"]');
    expect(await animacionDe(correcta(host.page))).toMatch(/reveal/);
    expect(await animacionDe(correcta(invitado.page))).toBe('none');
    // Un solo antes y después en cada tamaño: bajo las cartas en el móvil y en la columna lateral, a su derecha, en lg.
    const rejilla = (page: Page) => page.getByRole('group', { name: 'Opciones de Pokémon' });
    for (const { w, h } of SIZES) {
      await invitado.page.setViewportSize({ width: w, height: h });
      await expect(franja(invitado.page), `antes y después visibles a ${w}×${h}`).toHaveCount(1);
      const tira = await franja(invitado.page).boundingBox();
      const cartas = await rejilla(invitado.page).boundingBox();
      expect(tira && cartas, 'cajas del antes y después y de las cartas').toBeTruthy();
      if (w >= 1024) expect(tira!.x, `antes y después en la columna lateral a ${w}×${h}`).toBeGreaterThanOrEqual(cartas!.x + cartas!.width);
      else expect(tira!.y, `antes y después bajo las cartas a ${w}×${h}`).toBeGreaterThanOrEqual(cartas!.y + cartas!.height);
    }
    await invitado.page.setViewportSize({ width: 1280, height: 720 });
    await invitado.page.evaluate(() => window.scrollTo(0, 0));
    // Página completa: en el móvil el antes y después y el marcador quedan bajo las cartas.
    await capturarTamanos(invitado.page, 'juego-shiny-vote-revelacion', { sigue: franja(invitado.page), completa: true });

    // Una sola ronda: llegan los resultados con la clasificación del catálogo.
    for (const { page } of jugadores) await expect(page.getByRole('heading', { name: 'Clasificación shiny' })).toBeVisible({ timeout: 15_000 });
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion.getByRole('listitem')).toHaveCount(2);
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-shiny-vote-resultados', { sigue: clasificacion, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('shiny-vote: modo Supervivencia, un fallo elimina y clasificación por rondas', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Shiny Quiz');
    await elegirModo(host.page, 'Supervivencia');
    await ajustarRango(host.page, 'Duración de la revelación', 'Home', '3');
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    const carta = await comprobarChipDeCarta(host.page, 'Shiny Quiz', 'Supervivencia');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-supervivencia', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const opcion = (page: Page, letra: string) => page.locator(`[data-shiny-option="${letra}"]`);
    await expect(opcion(host.page, 'A')).toBeEnabled({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ candidatos$/).first()).toBeVisible();
    await comprobarTituloDeCabecera(host.page, 'Shiny Quiz · Supervivencia');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-supervivencia', { sigue: opcion(host.page, 'A') });

    // Cada uno vota una opción distinta: como mucho uno acierta; los demás caen. Se sigue hasta que no queda nadie. Solo
    // quien sigue en pie tiene las cartas como botones («Opción A: …»); cada uno vota una vez por ronda.
    const letras = ['A', 'B', 'C'];
    const fin = host.page.getByRole('heading', { name: 'Clasificación shiny' });
    const votaEnRonda = new Map<Page, string>();
    let capturadaRonda2 = false;
    await expect.poll(async () => {
      if (await fin.isVisible()) return true;
      for (const [i, { page }] of jugadores.entries()) {
        const carta = page.getByRole('button', { name: new RegExp(`^Opción ${letras[i]}:`) });
        if (!(await carta.isVisible())) continue;
        const ronda = await page.getByText(/^Ronda \d+ de \d+$/).first().innerText();
        if (votaEnRonda.get(page) === ronda) continue;
        if (ronda.startsWith('Ronda 2 ') && !capturadaRonda2) {
          capturadaRonda2 = true;
          await capturarTamanos(page, 'juego-modo-supervivencia-ronda-2', { sigue: carta });
        }
        votaEnRonda.set(page, ronda);
        await carta.click();
        await page.getByRole('button', { name: 'Confirmar voto' }).click();
      }
      return false;
    }, { timeout: 150_000, intervals: [400] }).toBe(true);
    await expect(fin).toBeVisible({ timeout: 30_000 });
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-supervivencia-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
