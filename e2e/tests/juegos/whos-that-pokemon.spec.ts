/**
 * E2E de ¿Quién es ese Pokémon? (`whos-that-pokemon`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, esSelector, capturarAnotando, buscadorRespuesta, adivinar, sinScorePop, textoDeMain } from '../../src/juegos.js';

/**
 * ¿Quién es ese Pokémon? sin red ni respuesta conocida: una ronda corta (20 s) con un fallo (el enfriamiento, el anuncio
 * y los intentos), las comprobaciones a 390×844 y, al agotarse el tiempo, la revelación («¡Era X!» da el nombre, que no
 * estaba antes en el DOM) y la clasificación. El acierto («¡Acertado!», el puesto, el marcador) lo cubren los tests de
 * render de `WhosThatPokemonGame.test.ts`.
 */
test('whos-that-pokemon: una ronda corta con un fallo, la revelación por tiempo y la clasificación', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, '¿Quién es ese Pokémon?');
    // Una ronda (para llegar a la clasificación) de 20 s, solo la Gen 1 y con pistas.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const pistas = host.page.getByRole('switch', { name: 'Pistas adicionales' });
    await pistas.click();
    await expect(pistas).toHaveAttribute('aria-checked', 'true');
    for (const [nombre, teclas, valor] of [['Número de rondas', ['Home'], '1'], ['Tiempo por ronda', ['Home', 'ArrowRight', 'ArrowRight'], '20']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const silueta = host.page.getByRole('img', { name: 'Silueta de un Pokémon misterioso' });
    await expect(silueta).toBeVisible({ timeout: 20_000 });
    const buscador = buscadorRespuesta;
    await expect(buscador(host.page)).toBeVisible();
    // La silueta es una ruta opaca: ni nombre ni número del Pokémon.
    expect(new URL(await silueta.getAttribute('src') ?? '', host.page.url()).pathname).toMatch(/\/options\/shadow\/sprite$/);

    // Marcador: una fila por jugador; los intentos vacíos enseñan a jugar.
    await expect(host.page.getByTestId('guess-score-row')).toHaveCount(3);
    await expect(host.page.getByText('Todavía no hay intentos incorrectos.')).toBeVisible();

    // Un intento con un Pokémon cualquiera: casi siempre falla (1 entre ~150 de acertar por azar, que se anota).
    const intento = catalogo[0]!.name;
    await adivinar(host.page, intento);
    const resultado = await Promise.race([
      host.page.getByTestId('guess-cooldown').waitFor({ timeout: 5_000 }).then(() => 'fallo' as const),
      host.page.getByRole('heading', { name: '¡Acertado!' }).waitFor({ timeout: 5_000 }).then(() => 'acierto' as const),
    ]);
    if (resultado === 'acierto') test.info().annotations.push({ type: 'silueta', description: `${intento} acertó por azar: sin enfriamiento que comprobar` });
    else {
      await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
      await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
      await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
      await expect(host.page.getByText(`${intento} no era`, { exact: true })).toBeVisible();
    }
    // Lo que había en el DOM antes de revelar (se compara con la respuesta al final).
    const antes = await textoDeMain(host.page);

    await capturarTamanos(primero.page, 'juego-whos-that-pokemon-pista', { sigue: primero.page.getByRole('img', { name: 'Silueta de un Pokémon misterioso' }) });
    if (resultado === 'fallo') {
      // A 390×844, sin desplazar: la silueta y el buscador a la vista.
      await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
      await host.page.evaluate(() => window.scrollTo(0, 0));
      await expect(silueta).toBeInViewport({ ratio: 1 });
      await expect(buscador(host.page)).toBeInViewport({ ratio: 1 });
      // Buscando (la bandeja abierta): el primer resultado y la silueta siguen a la vista.
      await buscador(host.page).fill('a');
      const primerResultado = host.page.locator('.pokemon-selector-results button').first();
      await expect(primerResultado).toBeInViewport({ ratio: 1 });
      await expect(silueta).toBeInViewport();
      await host.page.setViewportSize({ width: 1280, height: 720 });
      await buscador(host.page).blur();
      await capturarTamanos(host.page, 'juego-whos-that-pokemon-busqueda', { sigue: primerResultado });
      await buscador(host.page).fill('');
    }

    // Se agota el tiempo: la revelación da el nombre, que no estaba antes en el DOM.
    const era = host.page.getByRole('heading', { name: /^¡Era .+!$/, level: 1 });
    await expect(era).toBeVisible({ timeout: 30_000 });
    const respuesta = (await era.innerText()).replace(/^¡Era (.+)!$/, '$1');
    test.info().annotations.push({ type: 'silueta', description: `era ${respuesta}` });
    expect(antes, 'la respuesta no estaba en el DOM antes de revelar').not.toContain(respuesta);
    const filas = host.page.getByTestId('guess-reveal-row');
    await expect(filas).toHaveCount(3);
    await expect(filas.filter({ hasText: primero.name })).toContainText('No acertó');
    // La carta de la respuesta carga con prioridad (`Card eager`): se captura con el sprite ya descodificado.
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura 4 s: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-whos-that-pokemon-revelacion', era);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-whos-that-pokemon-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
