/**
 * E2E de Adivina el Grito (`pokemon-cry-quiz`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test } from '@playwright/test';
import { crearSalaConJugadores, capture, iniciarPartida, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { ASSET_URL, capturarTamanos, esSelector, capturarAnotando, buscadorRespuesta, adivinar, sinScorePop, textoDeMain } from '../../src/juegos.js';

/**
 * Adivina el Grito sin red ni respuesta conocida: una ronda corta (15 s) con un fallo (el enfriamiento, el anuncio y
 * los intentos), el botón del grito con su estado y, al agotarse el tiempo, la revelación («¡Era X!» da el nombre, que
 * no estaba antes en el DOM) y la clasificación. El acierto («¡Grito acertado!», el marcador) lo cubren los tests de
 * render de `PokemonCryQuizGame.test.tsx`.
 */
test('pokemon-cry-quiz: una ronda corta con un fallo, el grito, la revelación por tiempo y la clasificación', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Adivina el Grito');
    // Una ronda (para llegar a la clasificación) de 15 s y solo la Gen 1.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    for (const [nombre, teclas, valor] of [['Número de rondas', ['Home'], '1'], ['Tiempo por ronda', ['Home', 'ArrowRight'], '15']] as const) {
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
    const grito = host.page.getByRole('region', { name: 'Grito del Pokémon misterioso' });
    const reproducir = host.page.getByTestId('cry-play');
    await expect(reproducir).toHaveText('Reproducir grito', { timeout: 20_000 });
    await expect(buscadorRespuesta(host.page)).toBeVisible();
    // La ruta del grito es opaca: ni nombre ni número del Pokémon.
    expect(new URL(await grito.locator('audio').getAttribute('src') ?? '', host.page.url()).pathname).toMatch(ASSET_URL);

    // Un intento con un Pokémon cualquiera: casi siempre falla (1 entre ~150 de acertar por azar, que se anota).
    const intento = catalogo[0]!.name;
    await adivinar(host.page, intento);
    const resultado = await Promise.race([
      host.page.getByTestId('guess-cooldown').waitFor({ timeout: 5_000 }).then(() => 'fallo' as const),
      host.page.getByRole('heading', { name: '¡Grito acertado!' }).waitFor({ timeout: 5_000 }).then(() => 'acierto' as const),
    ]);
    if (resultado === 'acierto') test.info().annotations.push({ type: 'grito', description: `${intento} acertó por azar: sin enfriamiento que comprobar` });
    else {
      await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
      await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
      await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
      await expect(host.page.getByText(`${intento} no era`, { exact: true })).toBeVisible();
    }
    // Lo que había en el DOM antes de revelar (se compara con la respuesta al final).
    const antes = await textoDeMain(host.page);

    // El botón dice su estado en texto: «Sonando…» mientras suena y vuelve al terminar (nunca suena solo).
    await reproducir.click();
    await expect(reproducir).toHaveText('Sonando…', { timeout: 5_000 });
    await expect(reproducir).toHaveText('Reproducir grito', { timeout: 8_000 });

    await capturarTamanos(primero.page, 'juego-pokemon-cry-quiz-pista', { sigue: primero.page.getByRole('region', { name: 'Grito del Pokémon misterioso' }) });
    // A 390×844, sin desplazar: el botón del grito y el buscador a la vista; con la bandeja abierta, el primer
    // resultado y el botón (por encima de la bandeja, sin quedar tapado).
    if (resultado === 'fallo') {
      await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
      await expect(reproducir).toBeInViewport({ ratio: 1 });
      await expect(buscadorRespuesta(host.page)).toBeInViewport({ ratio: 1 });
      await buscadorRespuesta(host.page).fill('a');
      const primerResultado = host.page.locator('.pokemon-selector-results button').first();
      await expect(primerResultado).toBeInViewport({ ratio: 1 });
      await expect(reproducir).toBeInViewport({ ratio: 1 });
      const tapado = await reproducir.evaluate((boton) => { const caja = boton.getBoundingClientRect(); const encima = document.elementFromPoint(caja.left + caja.width / 2, caja.top + caja.height / 2); return !boton.contains(encima); });
      expect(tapado, 'el botón del grito no queda tapado por la bandeja').toBe(false);
      await host.page.setViewportSize({ width: 1280, height: 720 });
      await buscadorRespuesta(host.page).blur();
      await capturarTamanos(host.page, 'juego-pokemon-cry-quiz-busqueda', { sigue: primerResultado });
    }

    // Se agota el tiempo: la revelación da el nombre, que no estaba antes en el DOM.
    const era = host.page.getByRole('heading', { name: /^¡Era .+!$/, level: 1 });
    await expect(era).toBeVisible({ timeout: 25_000 });
    const respuesta = (await era.innerText()).replace(/^¡Era (.+)!$/, '$1');
    test.info().annotations.push({ type: 'grito', description: `era ${respuesta}` });
    expect(antes, 'la respuesta no estaba en el DOM antes de revelar').not.toContain(respuesta);
    const filas = host.page.getByTestId('guess-reveal-row');
    await expect(filas).toHaveCount(3);
    await expect(filas.filter({ hasText: primero.name })).toContainText('No acertó');
    await expect(host.page.getByText('Su grito', { exact: true })).toBeVisible();
    await expect(reproducir).toHaveText('Volver a escuchar');
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura poco: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-pokemon-cry-quiz-revelacion', era);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-cry-quiz-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Adivina el Grito con «Intentos públicos» apagado en los ajustes: quien falla sigue viendo su «X no era», los demás no
 * reciben su fallo (ni el panel ni el nombre en el DOM) y el marcador ocupa la columna lateral.
 */
test('pokemon-cry-quiz: con los intentos públicos apagados, cada uno solo ve sus fallos', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Adivina el Grito');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    const ajuste = host.page.getByRole('switch', { name: 'Intentos públicos' });
    await expect(ajuste).toHaveAttribute('aria-checked', 'true');
    await expect(ajuste).toHaveAccessibleDescription('Si lo apagas, nadie ve los fallos de los demás.');
    await ajuste.click();
    await expect(ajuste).toHaveAttribute('aria-checked', 'false');
    // El ajuste a la vista en cada tamaño (en el móvil, por encima de la barra «Iniciar partida») y la comprobación
    // de encaje con sus valores por defecto.
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await ajuste.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(ajuste).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(ajuste), `${w}x${h}: el interruptor no queda tapado`).toBe(true);
      await capture(host.page, 'lobby-pokemon-cry-quiz-intentos-publicos');
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    await expect(host.page.getByTestId('cry-play')).toHaveText('Reproducir grito', { timeout: 20_000 });

    const intento = catalogo[0]!.name;
    await adivinar(host.page, intento);
    const resultado = await Promise.race([
      host.page.getByTestId('guess-cooldown').waitFor({ timeout: 5_000 }).then(() => 'fallo' as const),
      host.page.getByRole('heading', { name: '¡Grito acertado!' }).waitFor({ timeout: 5_000 }).then(() => 'acierto' as const),
    ]);
    if (resultado === 'acierto') test.info().annotations.push({ type: 'grito', description: `${intento} acertó por azar: sin fallo que ocultar` });
    else {
      // Quien falla ve su fallo; el panel «Intentos públicos» no está en ninguna pantalla.
      await expect(host.page.getByText(`${intento} no era`, { exact: true })).toBeVisible();
      for (const jugador of jugadores) {
        await expect(jugador.page.getByText('Intentos públicos', { exact: true })).toHaveCount(0);
        await expect(jugador.page.getByTestId('guess-attempt')).toHaveCount(0);
        await expect(jugador.page.getByRole('list', { name: 'Marcador' })).toBeVisible();
      }
      expect(await textoDeMain(primero.page), 'el fallo del host no llega a los demás').not.toContain(intento);
    }
    await capturarTamanos(host.page, 'juego-pokemon-cry-quiz-sin-intentos', { sigue: host.page.getByRole('list', { name: 'Marcador' }) });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
