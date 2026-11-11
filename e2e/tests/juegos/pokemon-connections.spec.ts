/**
 * E2E de Pokémon Connections (`pokemon-connections`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, SIZES } from '../../src/helpers.js';
import { capturarTamanos, sinScorePop, textoDeMain } from '../../src/juegos.js';

/** Envía un grupo cualquiera de Pokémon Connections: las cartas `desde`…`desde + 3` de las que quedan en el tablero. */
async function enviarGrupoConnections(page: Page, desde: number): Promise<void> {
  const cartas = page.locator('[data-connection-card]');
  const total = await cartas.count();
  for (let n = 0; n < 4; n++) await cartas.nth((desde + n) % total).click();
  const comprobar = page.getByRole('button', { name: 'Comprobar 4/4' });
  await comprobar.click();
  await expect(page.getByRole('button', { name: /^Comprobar 4\/4$/ })).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Pokémon Connections sin conocer la solución (no está en la BD ni en ninguna proyección antes de revelar): un puzle de
 * 16 con 2 errores permitidos. El anfitrión elige 4 cartas con el teclado (Tab y Espacio) y comprueba con Intro: sale
 * el resultado del intento, los errores que quedan y el foco en la placa. Después todos envían grupos cualesquiera hasta
 * quedarse sin intentos (si alguno acierta por azar, sale su banda): la ronda se cierra y se revelan los 4 grupos. Se
 * comprueba que el tema de un grupo que no encontraste no estaba en la página antes de revelar. El host avanza a la
 * clasificación. Las bandas de los grupos encontrados en plena ronda las cubre el test de render.
 */
test('pokemon-connections: tablero con teclado, errores, la revelación de los grupos y la clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Connections');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Errores permitidos', ['Home', 'ArrowRight'], '2'], ['Tiempo por puzle', ['Home', 'ArrowRight'], '60'], ['Número de puzles', ['Home'], '1']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const cartas = (page: Page) => page.locator('[data-connection-card]');
    const comprobar = (page: Page) => page.getByRole('button', { name: /^Comprobar \d\/4$/ });
    for (const { page } of jugadores) await expect(cartas(page)).toHaveCount(16, { timeout: 20_000 });
    await expect(host.page.getByTestId('connections-lives')).toHaveText('Quedan 2 errores de 2');

    // A 390×844 sin desplazar: el tablero entero y «Comprobar» (en la placa pegada al fondo), sin que esta lo tape.
    const movil = invitados[1]!.page;
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await movil.evaluate(() => window.scrollTo(0, 0));
    await expect(movil.getByTestId('connections-grid'), 'tablero entero a 390×844').toBeInViewport({ ratio: 1 });
    await expect(comprobar(movil), '«Comprobar» a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    const tablero = await movil.getByTestId('connections-grid').boundingBox();
    const inferior = await movil.locator('[data-layer="screen-bottom"]').boundingBox();
    expect(tablero!.y + tablero!.height, 'la placa no tapa el tablero a 390×844').toBeLessThanOrEqual(inferior!.y + 1);
    await movil.setViewportSize({ width: 1280, height: 720 });

    // Selección con el teclado: Tab entre cartas y Espacio para marcarlas (`aria-pressed`).
    await cartas(host.page).first().focus();
    for (let n = 0; n < 4; n++) {
      if (n > 0) await host.page.keyboard.press('Tab');
      await host.page.keyboard.press('Space');
    }
    await expect(host.page.locator('[data-connection-card][aria-pressed="true"]')).toHaveCount(4);
    await expect(comprobar(host.page)).toHaveText(/Comprobar 4\/4/);
    // Un quinto no entra: la selección se queda en 4.
    await host.page.keyboard.press('Tab');
    await host.page.keyboard.press('Space');
    await expect(host.page.locator('[data-connection-card][aria-pressed="true"]')).toHaveCount(4);
    await capturarTamanos(host.page, 'juego-pokemon-connections-tablero', { sigue: comprobar(host.page) });

    await comprobar(host.page).focus();
    await host.page.keyboard.press('Enter');
    const resultado = host.page.getByTestId('connections-feedback');
    await expect(resultado).toHaveText(/^(Ese grupo no conecta|Te falta uno|Grupo encontrado)$/, { timeout: 10_000 });
    await expect(host.page.locator('#guess-plate-title'), 'el foco no cae al body tras comprobar').toBeFocused();
    const acerto = (await resultado.innerText()).trim() === 'Grupo encontrado';
    test.info().annotations.push({ type: 'connections', description: `primer intento del anfitrión: ${await resultado.innerText()}` });
    if (acerto) {
      // Acierto por azar: el grupo pasa a ser una banda con su tema y sus cartas salen del tablero.
      await expect(host.page.locator('[data-connection-group]')).toHaveCount(1);
      await expect(host.page.locator('[data-connection-group] strong')).not.toHaveText('');
      await expect(cartas(host.page)).toHaveCount(12);
      await expect(host.page.getByTestId('connections-lives')).toHaveText('Quedan 2 errores de 2');
    } else {
      test.info().annotations.push({ type: 'connections', description: 'sin acierto por azar: la banda de un grupo encontrado en plena ronda la cubre el test de render' });
      await expect(host.page.locator('[data-connection-group]')).toHaveCount(0);
      await expect(host.page.getByTestId('connections-lives')).toHaveText('Queda 1 error de 2');
    }
    await capturarTamanos(host.page, 'juego-pokemon-connections-intento', { sigue: resultado });

    // Lo que cada uno veía antes de revelar.
    const antes = new Map<Page, string>();
    for (const { page } of jugadores) antes.set(page, await textoDeMain(page));

    // Todos envían grupos cualesquiera hasta quedarse sin intentos (o completar, por azar): la ronda se cierra sola.
    const revelado = (page: Page) => page.getByRole('heading', { name: 'Estas eran las conexiones' });
    const sinIntentos = (page: Page) => page.getByRole('heading', { name: 'Ya no quedan intentos' });
    for (const [indice, { page }] of jugadores.entries()) {
      for (let intento = 0; intento < 8; intento++) {
        if (await revelado(page).isVisible() || await sinIntentos(page).isVisible() || await page.getByRole('heading', { name: '¡Todas las conexiones!' }).isVisible()) break;
        await enviarGrupoConnections(page, indice * 4 + intento);
      }
    }
    for (const { page } of jugadores) await expect(revelado(page)).toBeVisible({ timeout: 15_000 });

    // Revelación: los 4 grupos con su tema, si los encontraste y quién; la clasificación de la ronda.
    const bandas = host.page.locator('[data-connection-group]');
    await expect(bandas).toHaveCount(4);
    await expect(host.page.getByTestId('connections-round-row')).toHaveCount(3);
    await expect(host.page.getByRole('button', { name: 'Ver clasificación' })).toBeVisible();
    for (const { page } of jugadores) {
      const temas = await page.locator('[data-connection-group]').evaluateAll((items) => items.map((item) => ({ tema: item.querySelector('strong')?.textContent ?? '', perdida: (item.textContent ?? '').includes('No encontrada') })));
      expect(temas).toHaveLength(4);
      for (const { tema, perdida } of temas) if (perdida) expect(antes.get(page), `«${tema}» no estaba en la página antes de revelar`).not.toContain(tema);
    }
    test.info().annotations.push({ type: 'connections', description: `grupos: ${(await bandas.locator('strong').allInnerTexts()).join(' · ')}` });
    await capturarTamanos(host.page, 'juego-pokemon-connections-revelacion', { sigue: revelado(host.page) });

    await host.page.getByRole('button', { name: 'Ver clasificación' }).click();
    const clasificacion = host.page.getByRole('heading', { name: 'Mentes bien conectadas' });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/^\d+ grupos? · \d+\/1 tableros · \d+ error(es)? · \d+ a una · \d+ podios?$/)).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-connections-clasificacion', { sigue: clasificacion });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
