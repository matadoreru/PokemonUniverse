/**
 * E2E de Pokédex Entry Guess (`pokedex-entry-guess`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Route } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { JAVA_WS, capturarTamanos, SELECTOR_PATH, esSelector, capturarAnotando, buscadorRespuesta, adivinar, acertarEnOrden, juegoEnTrama, sinScorePop } from '../../src/juegos.js';

test('pokedex-entry-guess: buscador cargando, con error y reintento', async ({ browser }) => {
  // Uno de los juegos con el buscador fuera de los 6 de la Fase 2: la carga, el error y «Reintentar» llegan igual.
  test.setTimeout(90_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Entry Guess');
    // El catálogo del invitado se retiene (carga), luego falla (error) y, tras «Reintentar», pasa.
    let estado: 'retener' | 'fallar' | 'pasar' = 'retener';
    const retenidas: Route[] = [];
    await invitado.page.route((url) => url.pathname === SELECTOR_PATH, async (route) => {
      if (estado === 'retener') retenidas.push(route);
      else if (estado === 'fallar') await route.abort('connectionrefused');
      else await route.fallback();
    });
    await iniciarPartida(host.page, [invitado.page]);

    // La bandeja de carga no es región viva (la pantalla tiene una sola): se busca por su `aria-busy`.
    const cargando = invitado.page.locator('[aria-busy="true"]').filter({ hasText: 'Cargando Pokémon…' });
    await expect(cargando).toBeVisible({ timeout: 20_000 });
    estado = 'fallar';
    for (const route of retenidas.splice(0)) await route.abort('connectionrefused').catch(() => undefined);

    const alerta = invitado.page.getByRole('alert').filter({ hasText: 'No se pudo cargar el buscador de Pokémon.' });
    await expect(alerta).toBeVisible({ timeout: 10_000 });
    await expect(cargando).toHaveCount(0);
    estado = 'pasar';
    await alerta.getByRole('button', { name: 'Reintentar' }).click({ timeout: 10_000 });
    await expect(alerta).toHaveCount(0, { timeout: 10_000 });
    const buscador = invitado.page.getByRole('textbox', { name: /^Buscar respuesta para la ronda \d+$/ });
    await expect(buscador).toBeFocused();
    await buscador.fill('Pikachu');
    await expect(invitado.page.locator('.pokemon-selector-results button').filter({ hasText: 'Pikachu' }).first()).toBeVisible({ timeout: 10_000 });
    // El invitado registra en consola el fallo de red provocado; el host no ve ningún error.
    expect(host.errors, host.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Lo que el test lee del estado público de Pokédex Entry Guess. */
interface EntryVisible { phase: string; entryText: string | null }

/**
 * Candidatos a la respuesta de Pokédex Entry Guess: las entradas en español del buscador que, con los espacios
 * normalizados como hace `sanitizePokedexEntry`, encajan con la entrada de la ronda tomando cada «???» como el nombre
 * tapado. Devuelve los que encajan (sin repetir) y otro que seguro no (para el fallo).
 */
function entradasQueEncajan(enmascarada: string, ids: readonly string[]): { encajan: string[]; otro: string } {
  const filas = psql(
    `SELECT "pokemonId", regexp_replace(text, '[[:space:]]+', ' ', 'g') FROM "PokedexEntry" WHERE language = 'es' AND "pokemonId" = ANY(string_to_array(:'ids', ',')) ORDER BY "pokemonId";`,
    { ids: ids.join(',') },
  );
  const patron = new RegExp(`^${enmascarada.trim().split('???').map((trozo) => trozo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')}$`, 'su');
  const encajan = new Set<string>();
  for (const fila of filas.split('\n').filter(Boolean)) {
    const corte = fila.indexOf('|');
    const id = fila.slice(0, corte);
    if (patron.test(fila.slice(corte + 1).trim().normalize('NFC'))) encajan.add(id);
  }
  return { encajan: [...encajan], otro: ids.find((id) => !encajan.has(id)) ?? '' };
}

test('pokedex-entry-guess: una ronda con un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédex Entry Guess');
    // Una ronda (para llegar a la clasificación) de 60 s (el máximo) y solo la Gen 1.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    for (const [nombre, tecla, valor] of [['Número de rondas', 'Home', '1'], ['Tiempo por ronda', 'End', '60']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    let estado: EntryVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = juegoEnTrama<EntryVisible>(payload, 'pokedex-entry-guess') ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    const entrada = host.page.getByTestId('pokedex-entry');
    await expect(entrada).toBeVisible({ timeout: 20_000 });
    await expect(buscadorRespuesta(host.page)).toBeVisible();
    await expect.poll(() => (estado as EntryVisible | null)?.phase === 'ROUND_ACTIVE' && Boolean((estado as EntryVisible | null)?.entryText), { timeout: 10_000 }).toBe(true);
    const { entryText } = estado as unknown as EntryVisible;
    const { encajan, otro } = entradasQueEncajan(entryText!, catalogo.map((p) => p.id));
    test.info().annotations.push({ type: 'entrada', description: `${entryText} → ${encajan.map((id) => nombres.get(id)).join(', ')}` });
    expect(encajan.length, `ninguna entrada del buscador encaja: ${entryText}`).toBeGreaterThanOrEqual(1);
    expect(encajan.length, `demasiadas entradas iguales: ${encajan.join(', ')}`).toBeLessThanOrEqual(4);
    const candidatos = encajan.map((id) => nombres.get(id)!);
    const fallo = nombres.get(otro)!;

    // La respuesta no está en el DOM: ni en el texto, ni en `alt` o `title`.
    for (const nombre of candidatos) {
      await expect(host.page.locator('main')).not.toContainText(nombre);
      expect(await host.page.locator(`main [alt="${nombre}"], main [title="${nombre}"]`).count()).toBe(0);
    }
    // La entrada entera cabe sin desplazarse y con letra de 15 px o más a los tres tamaños.
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await expect.poll(() => entrada.evaluate((el) => ({ cabe: el.scrollHeight <= el.clientHeight + 1, px: Number.parseFloat(getComputedStyle(el).fontSize) >= 15 })), { timeout: 3_000 }).toEqual({ cabe: true, px: true });
      test.info().annotations.push({ type: 'letra', description: `${w}×${h}: ${await entrada.evaluate((el) => `${getComputedStyle(el).fontSize} en una caja de ${el.parentElement!.clientWidth}×${el.parentElement!.clientHeight}`)}` });
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Marcador: una fila por jugador; los intentos vacíos enseñan a jugar.
    await expect(host.page.getByTestId('guess-score-row')).toHaveCount(3);
    await expect(host.page.getByText('Todavía no hay intentos incorrectos.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-pista', { sigue: entrada });
    // A 390×844, sin desplazar: la entrada y el buscador a la vista.
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(entrada).toBeInViewport({ ratio: 1 });
    await expect(buscadorRespuesta(host.page)).toBeInViewport({ ratio: 1 });
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Un fallo seguro (otro Pokémon): el aviso de la espera se ve, la región viva lo dice una vez y los demás ven el intento.
    await adivinar(host.page, fallo);
    await expect(host.page.getByTestId('guess-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
    await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(host.page.getByText(`${fallo} no era`, { exact: true })).toBeVisible();
    // Buscando (la bandeja abierta): a 390×844 el primer resultado y la entrada siguen a la vista.
    await buscadorRespuesta(host.page).fill('a');
    const primerResultado = host.page.locator('.pokemon-selector-results button').first();
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(primerResultado).toBeInViewport({ ratio: 1 });
    await expect(entrada).toBeInViewport();
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await buscadorRespuesta(host.page).blur();
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-busqueda', { sigue: primerResultado });
    await buscadorRespuesta(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    const respuesta = await acertarEnOrden(host.page, candidatos, '¡Acertado!');
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-acertado', { sigue: acertado });
    await capturarTamanos(primero.page, 'juego-pokedex-entry-guess-marcador', { sigue: buscadorRespuesta(primero.page) });

    // El segundo también acierta y el tercero se va: la revelación lo dice en texto («No acertó»).
    test.info().annotations.push({ type: 'tiempo', description: `quedan ${await primero.page.getByRole('timer').first().innerText()} s antes del acierto del segundo` });
    await adivinar(primero.page, respuesta);
    await expect(primero.page.getByRole('heading', { name: '¡Acertado!' })).toBeVisible({ timeout: 5_000 });
    await segundo.context.close();
    const era = host.page.getByRole('heading', { name: `¡Era ${respuesta}!`, level: 1 });
    await expect(era).toBeVisible({ timeout: 65_000 });
    const filas = host.page.getByTestId('guess-reveal-row');
    await expect(filas).toHaveCount(3);
    await expect(filas.first()).toContainText(host.name);
    await expect(filas.filter({ hasText: segundo.name })).toContainText('No acertó');
    await expect(host.page.getByText('La entrada completa', { exact: true })).toBeVisible();
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura poco: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-pokedex-entry-guess-revelacion', era);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
