/**
 * E2E de Guess from Stats (`guess-from-stats`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { JAVA_WS, capturarTamanos, esSelector, capturarAnotando, buscadorRespuesta, adivinar, acertarEnOrden, juegoEnTrama, sinScorePop } from '../../src/juegos.js';

/** Lo que el test lee del estado público de Guess from Stats. */
interface StatsVisible { phase: string; visibleStats: Array<{ key: string; value: number }> }

/** Columna de `Pokemon` de cada estadística visible de Guess from Stats. */
const COLUMNA_STAT: Record<string, string> = { hp: 'hp', attack: 'attack', defense: 'defense', specialAttack: '"specialAttack"', specialDefense: '"specialDefense"', speed: 'speed', bst: '"baseStatTotal"' };

/**
 * Candidatos a la respuesta de Guess from Stats (sin pistas): los Pokémon del buscador con exactamente las
 * estadísticas visibles (cualquiera vale: el motor acepta todos los de la misma firma). Devuelve los que encajan y otro
 * que seguro no (para el fallo).
 */
function statsQueEncajan(stats: StatsVisible['visibleStats'], ids: readonly string[]): { encajan: string[]; otro: string } {
  const columnas = stats.map((stat) => COLUMNA_STAT[stat.key]!);
  const filas = psql(
    `SELECT id, ${columnas.join(', ')} FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`,
    { ids: ids.join(',') },
  );
  const encajan: string[] = [];
  let otro = '';
  for (const fila of filas.split('\n').filter(Boolean)) {
    const [id, ...valores] = fila.split('|') as [string, ...string[]];
    if (stats.every((stat, index) => Number(valores[index]) === stat.value)) encajan.push(id);
    else if (!otro) otro = id;
  }
  return { encajan, otro };
}

test('guess-from-stats: una ronda con un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Guess from Stats');
    // Una ronda (para llegar a la clasificación) de 60 s (el máximo), solo la Gen 1 y con el total (las siete filas).
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const total = host.page.getByRole('switch', { name: 'Total de Stats (BST)' });
    await total.click();
    await expect(total).toHaveAttribute('aria-checked', 'true');
    for (const [nombre, tecla, valor] of [['Número de rondas', 'Home', '1'], ['Tiempo por ronda', 'End', '60']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    let estado: StatsVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = juegoEnTrama<StatsVisible>(payload, 'guess-from-stats') ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    const filasStats = host.page.getByTestId('stat-row');
    await expect(filasStats).toHaveCount(7, { timeout: 20_000 });
    await expect(buscadorRespuesta(host.page)).toBeVisible();
    await expect.poll(() => (estado as StatsVisible | null)?.phase === 'ROUND_ACTIVE' && ((estado as StatsVisible | null)?.visibleStats.length ?? 0) > 0, { timeout: 10_000 }).toBe(true);
    const { visibleStats } = estado as unknown as StatsVisible;
    const { encajan, otro } = statsQueEncajan(visibleStats, catalogo.map((p) => p.id));
    test.info().annotations.push({ type: 'stats', description: `${visibleStats.map((s) => `${s.key} ${s.value}`).join(' · ')} → ${encajan.map((id) => nombres.get(id)).join(', ')}` });
    expect(encajan.length, 'ningún Pokémon del buscador tiene estas estadísticas').toBeGreaterThanOrEqual(1);
    const candidatos = encajan.map((id) => nombres.get(id)!);
    const fallo = nombres.get(otro)!;

    // Ninguna respuesta válida está en el DOM: ni en el texto, ni en `alt` o `title`.
    for (const nombre of candidatos) {
      await expect(host.page.locator('main')).not.toContainText(nombre);
      expect(await host.page.locator(`main [alt="${nombre}"], main [title="${nombre}"]`).count()).toBe(0);
    }
    // Cada estadística con su nombre y su número en texto, y la barra solo decorativa.
    for (const [index, stat] of visibleStats.entries()) await expect(filasStats.nth(index)).toContainText(String(stat.value));
    await expect(host.page.getByRole('meter')).toHaveCount(0);

    // Marcador: una fila por jugador; los intentos vacíos enseñan a jugar.
    await expect(host.page.getByTestId('guess-score-row')).toHaveCount(3);
    await expect(host.page.getByText('Todavía no hay intentos incorrectos.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-guess-from-stats-pista', { sigue: filasStats.first() });
    // A 390×844, sin desplazar: la primera y la última estadística y el buscador a la vista.
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(filasStats.first()).toBeInViewport({ ratio: 1 });
    await expect(filasStats.last()).toBeInViewport({ ratio: 1 });
    await expect(buscadorRespuesta(host.page)).toBeInViewport({ ratio: 1 });
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Un fallo seguro (otras estadísticas): el aviso de la espera se ve, la región viva lo dice una vez y los demás ven el intento.
    await adivinar(host.page, fallo);
    await expect(host.page.getByTestId('guess-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
    await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(host.page.getByText(`${fallo} no era`, { exact: true })).toBeVisible();
    // Buscando (la bandeja abierta): a 390×844 el primer resultado y las estadísticas siguen a la vista.
    await buscadorRespuesta(host.page).fill('a');
    const primerResultado = host.page.locator('.pokemon-selector-results button').first();
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(primerResultado).toBeInViewport({ ratio: 1 });
    await expect(filasStats.first()).toBeInViewport({ ratio: 1 });
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await buscadorRespuesta(host.page).blur();
    await capturarTamanos(host.page, 'juego-guess-from-stats-busqueda', { sigue: primerResultado });
    await buscadorRespuesta(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    const respuesta = await acertarEnOrden(host.page, candidatos.slice(0, 1), '¡Acertado!');
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-guess-from-stats-acertado', { sigue: acertado });
    await capturarTamanos(primero.page, 'juego-guess-from-stats-marcador', { sigue: buscadorRespuesta(primero.page) });

    // El segundo también acierta y el tercero se va: la revelación lo dice en texto («No acertó»).
    test.info().annotations.push({ type: 'tiempo', description: `quedan ${await primero.page.getByRole('timer').first().innerText()} s antes del acierto del segundo` });
    await adivinar(primero.page, respuesta);
    await expect(primero.page.getByRole('heading', { name: '¡Acertado!' })).toBeVisible({ timeout: 5_000 });
    await segundo.context.close();
    const era = host.page.getByRole('heading', { name: encajan.length > 1 ? `¡Valían ${encajan.length} Pokémon!` : `¡Era ${respuesta}!`, level: 1 });
    await expect(era).toBeVisible({ timeout: 65_000 });
    const filas = host.page.getByTestId('guess-reveal-row');
    await expect(filas).toHaveCount(3);
    await expect(filas.first()).toContainText(host.name);
    await expect(filas.first()).toContainText(`Eligió ${respuesta}`);
    await expect(filas.filter({ hasText: segundo.name })).toContainText('No acertó');
    // La ficha completa de cada respuesta: siete estadísticas.
    await expect(host.page.locator('[data-answer-card]')).toHaveCount(encajan.length);
    await expect(host.page.getByRole('list', { name: `Estadísticas de ${respuesta}`, exact: true }).getByTestId('stat-row')).toHaveCount(7);
    await expect.poll(() => host.page.locator('[data-answer-card] img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura poco: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-guess-from-stats-revelacion', era);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-guess-from-stats-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
