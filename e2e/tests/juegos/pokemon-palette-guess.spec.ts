/**
 * E2E de Adivina por la Paleta (`pokemon-palette-guess`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { JAVA_WS, capturarTamanos, esSelector, capturarAnotando, buscadorRespuesta, adivinar, acertarEnOrden, juegoEnTrama, sinScorePop } from '../../src/juegos.js';

/** Lo que el test lee del estado público de Adivina por la Paleta. */
interface PaletteVisible { phase: string; colors: string[] }

/**
 * Respuesta de Adivina por la Paleta. No está en el cliente, pero la paleta de la ronda son los primeros colores de
 * `metadata.palette` del Pokémon (`visiblePalette` del motor) y la BD local la tiene: se buscan, entre los Pokémon del
 * buscador, los que empiezan por esos mismos colores. Devuelve los ids que encajan, del más al menos probable, y uno
 * que no. El test pide 8 colores a propósito: con la paleta entera casi nunca encajan dos; con menos (5–7) pueden
 * coincidir varios, y entonces se prueban por orden (primero los de paleta más corta, cuyo prefijo cubre más).
 */
function paletaEnBd(colores: readonly string[], ids: readonly string[]): { encajan: string[]; otro: string } {
  const filas = psql(
    `SELECT id, coalesce(metadata->'palette', '[]'::jsonb)::text FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`,
    { ids: ids.join(',') },
  );
  const buscados = colores.map((c) => c.toLowerCase());
  const encajan: Array<{ id: string; sobrantes: number }> = [];
  let otro = '';
  for (const fila of filas.split('\n').filter(Boolean)) {
    const [id, json] = fila.split('|') as [string, string];
    const paleta = (JSON.parse(json) as string[]).map((c) => c.toLowerCase());
    if (paleta.length >= buscados.length && buscados.every((c, i) => paleta[i] === c)) encajan.push({ id, sobrantes: paleta.length - buscados.length });
    else if (!otro && paleta.length >= 3) otro = id;
  }
  return { encajan: encajan.sort((a, b) => a.sobrantes - b.sobrantes).map((p) => p.id), otro };
}

test('pokemon-palette-guess: una ronda con un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Adivina por la Paleta');
    // Una ronda (para llegar a la clasificación) de 60 s (el máximo), solo la Gen 1, con 8 colores (la leyenda más
    // larga) y con pistas.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const ocho = host.page.getByRole('radio', { name: '8', exact: true });
    await ocho.click();
    await expect(ocho).toHaveAttribute('aria-checked', 'true');
    const pistas = host.page.getByRole('switch', { name: 'Pistas adicionales' });
    await pistas.click();
    await expect(pistas).toHaveAttribute('aria-checked', 'true');
    for (const [nombre, tecla, valor] of [['Número de rondas', 'Home', '1'], ['Tiempo por ronda', 'End', '60']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    let estado: PaletteVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = juegoEnTrama<PaletteVisible>(payload, 'pokemon-palette-guess') ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    const barra = host.page.getByRole('img', { name: /^Paleta de \d colores con peso aproximado/ });
    await expect(barra).toBeVisible({ timeout: 20_000 });
    const buscador = buscadorRespuesta;
    await expect(buscador(host.page)).toBeVisible();
    await expect.poll(() => (estado as PaletteVisible | null)?.phase === 'ROUND_ACTIVE' && ((estado as PaletteVisible | null)?.colors.length ?? 0) > 0, { timeout: 10_000 }).toBe(true);
    const { colors } = estado as unknown as PaletteVisible;
    const { encajan, otro } = paletaEnBd(colors, catalogo.map((p) => p.id));
    test.info().annotations.push({ type: 'paleta', description: `${colors.join(' ')} → ${encajan.map((id) => nombres.get(id)).join(', ')}` });
    // Lo normal es uno; si encajan varios se prueban por orden (ver `paletaEnBd`), sin dar el test por roto.
    expect(encajan.length, `ningún Pokémon del buscador empieza por esta paleta: ${colors.join(' ')}`).toBeGreaterThanOrEqual(1);
    expect(encajan.length, `demasiadas paletas iguales para probarlas en una ronda: ${encajan.map((id) => nombres.get(id)).join(', ')}`).toBeLessThanOrEqual(8);
    if (encajan.length > 1) test.info().annotations.push({ type: 'paleta', description: `varias paletas encajan: se prueban por orden` });
    const candidatos = encajan.map((id) => nombres.get(id)!);
    const fallo = nombres.get(otro)!;

    // La respuesta no está en el DOM: ni en el texto, ni en `alt` o `title`.
    for (const nombre of candidatos) {
      await expect(host.page.locator('main')).not.toContainText(nombre);
      expect(await host.page.locator(`main [alt="${nombre}"], main [title="${nombre}"]`).count()).toBe(0);
    }
    // Cada color lleva su nombre y su porcentaje en texto (el color nunca va solo).
    const leyenda = host.page.getByTestId('palette-legend').getByRole('listitem');
    await expect(leyenda).toHaveCount(colors.length);
    for (const item of await leyenda.all()) await expect(item).toHaveText(/^[a-z ]+\d+%$/);

    // Marcador: una fila por jugador; los intentos vacíos enseñan a jugar.
    await expect(host.page.getByTestId('guess-score-row')).toHaveCount(3);
    await expect(host.page.getByText('Todavía no hay intentos incorrectos.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-pista', { sigue: barra });
    // A 390×844, sin desplazar: la barra, la leyenda entera y el buscador a la vista.
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(barra).toBeInViewport({ ratio: 1 });
    await expect(leyenda.last()).toBeInViewport({ ratio: 1 });
    await expect(buscador(host.page)).toBeInViewport({ ratio: 1 });
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Un fallo seguro (un Pokémon con otra paleta): el aviso de la espera se ve, la región viva lo dice una vez y los
    // demás ven el intento.
    await adivinar(host.page, fallo);
    await expect(host.page.getByTestId('guess-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
    await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(host.page.getByText(`${fallo} no era`, { exact: true })).toBeVisible();
    // Buscando (la bandeja abierta): a 390×844 el primer resultado y la barra siguen a la vista.
    await buscador(host.page).fill('a');
    const primerResultado = host.page.locator('.pokemon-selector-results button').first();
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(primerResultado).toBeInViewport({ ratio: 1 });
    await expect(barra).toBeInViewport();
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await buscador(host.page).blur();
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-busqueda', { sigue: primerResultado });
    await buscador(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    const respuesta = await acertarEnOrden(host.page, candidatos, '¡Paleta acertada!');
    const acertado = host.page.getByRole('heading', { name: '¡Paleta acertada!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    // El «+N» de los puntos pasa por encima del chip del marcador mientras dura: se captura sin él, como los demás juegos.
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-acertado', { sigue: acertado });
    await capturarTamanos(primero.page, 'juego-pokemon-palette-guess-marcador', { sigue: buscador(primero.page) });

    // El segundo también acierta y el tercero se va: la revelación lo dice en texto («No acertó»).
    test.info().annotations.push({ type: 'tiempo', description: `quedan ${await primero.page.getByRole('timer').first().innerText()} s antes del acierto del segundo` });
    await adivinar(primero.page, respuesta);
    await expect(primero.page.getByRole('heading', { name: '¡Paleta acertada!' })).toBeVisible({ timeout: 5_000 });
    await segundo.context.close();
    const era = host.page.getByRole('heading', { name: `¡Era ${respuesta}!`, level: 1 });
    await expect(era).toBeVisible({ timeout: 65_000 });
    const filas = host.page.getByTestId('guess-reveal-row');
    await expect(filas).toHaveCount(3);
    await expect(filas.first()).toContainText(host.name);
    await expect(filas.filter({ hasText: segundo.name })).toContainText('No acertó');
    await expect(host.page.getByText('Su paleta', { exact: true })).toBeVisible();
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura poco: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-pokemon-palette-guess-revelacion', era);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
