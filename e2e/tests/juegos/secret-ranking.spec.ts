/**
 * E2E de Secret Ranking (`secret-ranking`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, juegoEnTrama, sinScorePop, textoDeMain, tramasRetenibles } from '../../src/juegos.js';

/**
 * Secret Ranking con tres jugadores y una ronda. El host ordena con el teclado (Intro en «Bajar X» y «Subir X»): cada
 * movimiento se anuncia una vez en la región viva («X pasa al puesto N.») y el foco sigue al Pokémon movido, también
 * cuando llega al extremo y su botón se deshabilita (pasa al contrario). A y B bloquean el orden de la ronda tal cual y
 * el host el suyo (el primero, al cuarto puesto): A y B empatan en cabeza a distancia 3 y el host queda a 6. Se
 * comprueban el secreto de los órdenes (también tras recargar), el foco en «Ranking bloqueado», la lista y «Bloquear
 * ranking» a la vista a 390×844, la región viva única, la revelación (B retiene sus tramas: dura 8 s) y la clasificación.
 */
test('secret-ranking: ordenar con teclado, ranking secreto, revelación del consenso y clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Secret Ranking');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    // Ajustes con los controles del catálogo, a los tres tamaños (el panel del lobby se desplaza: se lleva a la vista).
    const ajustes = host.page.getByRole('slider', { name: 'Tiempo para ordenar' });
    await expect(host.page.getByRole('switch', { name: 'Incluir formas alternativas' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await ajustes.scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-secret-ranking-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 8 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const lista = (page: Page) => page.getByTestId('ranking-list');
    const orden = (page: Page) => lista(page).locator('[data-ranking-item]').evaluateAll((items) => items.map((item) => item.querySelector('[title]')?.getAttribute('title') ?? ''));
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const bloquear = (page: Page) => page.getByTestId('ranking-submit');
    const bloqueado = (page: Page) => page.getByRole('heading', { name: 'Ranking bloqueado', level: 2 });
    const sinOrdenesAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin distancias, consenso ni órdenes ajenos`).not.toMatch(/Distancia|Posición media|Orden de|Cercanía|No envió ranking/);
      await expect(page.getByTestId('ranking-players')).toHaveCount(0);
      await expect(page.getByTestId('ranking-closeness')).toHaveCount(0);
    };

    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('Ordena el ranking', { timeout: 20_000 });
    const inicial = await orden(host.page);
    expect(inicial, 'cinco Pokémon distintos').toHaveLength(5);
    expect(new Set(inicial).size).toBe(5);
    for (const { page } of invitados) expect(await orden(page), 'todos reciben la misma lista').toEqual(inicial);
    const [p1, p2, p3, p4, p5] = inicial as [string, string, string, string, string];
    await expect(viva(host.page)).toHaveCount(1);
    await expect(host.page.getByRole('button', { name: `Subir ${p1}` })).toBeDisabled();
    await expect(host.page.getByRole('button', { name: `Bajar ${p5}` })).toBeDisabled();

    // Teclado: el host baja el primero con Intro; el foco sigue en «Bajar» del mismo Pokémon en su nuevo puesto.
    await host.page.getByRole('button', { name: `Bajar ${p1}` }).focus();
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 2.`);
    await expect(host.page.getByRole('button', { name: `Bajar ${p1}` })).toBeFocused();
    expect(await orden(host.page)).toEqual([p2, p1, p3, p4, p5]);
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 3.`);
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 4.`);
    await host.page.keyboard.press('Enter');
    // En el último puesto «Bajar» se deshabilita: el foco pasa a «Subir» del mismo Pokémon, nunca al `body`.
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 5.`);
    await expect(host.page.getByRole('button', { name: `Bajar ${p1}` })).toBeDisabled();
    await expect(host.page.getByRole('button', { name: `Subir ${p1}` })).toBeFocused();
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 4.`);
    await expect(host.page.getByRole('button', { name: `Subir ${p1}` })).toBeFocused();
    const delHost = [p2, p3, p4, p1, p5];
    expect(await orden(host.page)).toEqual(delHost);
    // Con el puntero también: el host sube y vuelve a bajar el segundo.
    await host.page.getByRole('button', { name: `Subir ${p3}` }).click();
    expect(await orden(host.page)).toEqual([p3, p2, p4, p1, p5]);
    await host.page.getByRole('button', { name: `Bajar ${p3}` }).click();
    expect(await orden(host.page)).toEqual(delHost);
    await expect(viva(host.page)).toHaveCount(1);

    // A bloquea el orden de la ronda tal cual: el foco va al título de la placa y el host ve «Listo», no el orden.
    await bloquear(a.page).click();
    await expect(bloqueado(a.page)).toBeFocused({ timeout: 5_000 });
    await expect(lista(a.page).getByRole('button')).toHaveCount(0);
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Listo');
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Ordenando…');
    await sinOrdenesAjenos(host.page, 'ordenar');
    expect(await orden(host.page), 'el host sigue viendo su orden, no el de A').toEqual(delHost);
    // Recargar con el ranking bloqueado: el servidor devuelve solo el propio.
    await a.page.reload();
    await a.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(bloqueado(a.page)).toBeVisible({ timeout: 15_000 });
    expect(await orden(a.page)).toEqual(inicial);
    await sinOrdenesAjenos(a.page, 'bloqueado tras recargar');
    await capturarTamanos(host.page, 'juego-secret-ranking-ordenar', { sigue: titulo(host.page).filter({ hasText: 'Ordena el ranking' }) });
    await capturarTamanos(a.page, 'juego-secret-ranking-espera', { sigue: bloqueado(a.page) });

    // A 390×844 sin desplazar: la fase, el plazo, la pregunta, los cinco Pokémon con sus botones y «Bloquear ranking».
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.locator('[aria-current="step"]'), b.page.getByRole('timer'), b.page.getByTestId('social-prompt')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, plazo y pregunta a la vista y sin tapar').toBe(true);
    }
    for (const nombre of inicial) {
      for (const boton of [b.page.getByRole('button', { name: `Subir ${nombre}` }), b.page.getByRole('button', { name: `Bajar ${nombre}` })]) {
        await expect(boton).toBeInViewport({ ratio: 1 });
        expect(await sinTapar(boton), `a 390: los botones de ${nombre} a la vista y sin tapar`).toBe(true);
      }
    }
    await expect(bloquear(b.page)).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(bloquear(b.page)), 'a 390: «Bloquear ranking» sin tapar').toBe(true);
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await bloquear(b.page).click();
    await expect(bloqueado(b.page)).toBeVisible({ timeout: 5_000 });

    // B retiene la revelación (8 s) para capturarla; el host cierra la ronda.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'secret-ranking')?.phase === 'ROUND_RESULTS');
    await bloquear(host.page).click();
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText('El consenso del grupo', { timeout: 5_000 });
    await expect(viva(b.page)).toHaveText(/^Ronda 1 terminada\. Empate en cabeza entre .+ y .+, a distancia 3,00\.$/);
    await expect(b.page.getByTestId('ranking-consensus').getByRole('listitem')).toHaveCount(5);
    await expect(b.page.getByTestId('ranking-player')).toHaveCount(3);
    await expect(b.page.getByRole('list', { name: `Orden de ${host.name}` })).toContainText(`4. ${p1}`);
    // El puesto que dio cada uno, en texto, en la franja del consenso de P1.
    await expect(b.page.getByTestId('ranking-consensus').getByRole('listitem').filter({ hasText: p1 }).getByTestId('ranking-positions')).toContainText(`${host.name} 4.º`);
    const cercania = (jugador: Jugador) => b.page.getByTestId('ranking-closeness').filter({ hasText: jugador.name });
    for (const jugador of [a, b]) {
      await expect(cercania(jugador)).toContainText('El más cercano');
      await expect(cercania(jugador)).toContainText('Distancia 3,00');
    }
    await expect(cercania(host)).toContainText('Distancia 6,00');
    await expect(cercania(host)).toContainText('3.º puesto');
    // La barra es decorativa (la distancia ya va en texto): se busca por su etiqueta, no por el árbol accesible.
    await expect(cercania(host).locator(`[role="meter"][aria-label="Cercanía de ${host.name}"]`)).toHaveCount(1);
    await expect(viva(b.page)).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-secret-ranking-revelacion', { sigue: titulo(b.page).filter({ hasText: 'El consenso del grupo' }) });
    retenedor.soltar();

    // Clasificación: A y B empatan con más puntos que el host; métricas en texto.
    await expect(host.page.getByRole('heading', { name: 'La mente más sincronizada', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 victoria · 0 coincidencias perfectas · 1\/1 rankings · distancia media 3,00$/)).toHaveCount(2);
    await expect(host.page.getByText(/^0 victorias · 0 coincidencias perfectas · 1\/1 rankings · distancia media 6,00$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-secret-ranking-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
