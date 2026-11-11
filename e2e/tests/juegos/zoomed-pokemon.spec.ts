/**
 * E2E de Zoomed Pokémon (`zoomed-pokemon`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { JAVA_WS, capturarTamanos, esSelector, capturarAnotando, buscadorRespuesta, adivinar, acertarEnOrden, juegoEnTrama, sinScorePop } from '../../src/juegos.js';

/** Lo que el test lee del estado público de Zoomed Pokémon. */
interface ZoomedVisible {
  phase: string;
  imageUrl: string | null;
  visibleHints: Array<{ kind: 'GENERATION' | 'TYPE_COUNT'; value: number } | { kind: 'TYPE'; values: string[] } | { kind: 'EVOLUTION'; stage: number; stages: number } | { kind: 'CATEGORY'; value: string }>;
}

/** Colores (RGB) de los píxeles opacos de una imagen, muestreada en una rejilla de 64×64 (en la página: mismo origen). */
async function coloresOpacos(page: Page, url: string): Promise<Array<[number, number, number]>> {
  return page.evaluate(async (url) => {
    for (let intento = 0; intento < 5; intento++) {
      const respuesta = await fetch(url, { credentials: 'include' }).catch(() => null);
      if (respuesta?.ok) {
        const imagen = await createImageBitmap(await respuesta.blob());
        const lienzo = new OffscreenCanvas(64, 64);
        const ctx = lienzo.getContext('2d')!;
        ctx.drawImage(imagen, 0, 0, 64, 64);
        const { data } = ctx.getImageData(0, 0, 64, 64);
        const salida: Array<[number, number, number]> = [];
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 200) salida.push([data[i]!, data[i + 1]!, data[i + 2]!]);
        return salida;
      }
      await new Promise((listo) => setTimeout(listo, 250 * (intento + 1)));
    }
    throw new Error('No se pudo leer el recorte');
  }, url);
}

/** Distancia media de cada color a su color más cercano de la paleta (`#rrggbb`): cuanto menor, más se parece. */
function distanciaAPaleta(colores: ReadonlyArray<readonly [number, number, number]>, paleta: readonly string[]): number {
  const rgb = paleta.map((hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]);
  if (!rgb.length || !colores.length) return Infinity;
  let total = 0;
  for (const [r, g, b] of colores) total += Math.min(...rgb.map(([pr, pg, pb]) => (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2));
  return total / colores.length;
}

/**
 * Candidatos a la respuesta de Zoomed Pokémon, del más al menos probable. La respuesta no está en el cliente: el recorte
 * es una imagen opaca y su punto de enfoque es secreto. Con las pistas activas (generación, tipos, etapa evolutiva y
 * categoría, públicas desde el primer segundo) se filtran en la BD local los Pokémon del buscador que las cumplen todas
 * (`buildZoomedHints` lee esos mismos campos del catálogo); los que quedan se ordenan por lo bien que su paleta
 * dominante (`metadata.palette`, sacada del mismo sprite) cubre los colores del recorte.
 */
function candidatosZoomed(estado: ZoomedVisible, ids: readonly string[], colores: ReadonlyArray<readonly [number, number, number]>): string[] {
  const filas = psql(
    `SELECT id, generation, array_to_string(types, ','), coalesce("evolutionStage", 0), coalesce("evolutionStages", 0), "legendaryStatus", coalesce(metadata->'palette', '[]'::jsonb)::text
       FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ','));`,
    { ids: ids.join(',') },
  );
  return filas.split('\n').filter(Boolean).map((fila) => {
    const [id, generation, types, stage, stages, category, palette] = fila.split('|') as [string, string, string, string, string, string, string];
    return { id, generation: Number(generation), types: types.split(',').filter(Boolean), stage: Number(stage), stages: Number(stages), category, palette: JSON.parse(palette) as string[] };
  }).filter((p) => estado.visibleHints.every((hint) => {
    if (hint.kind === 'GENERATION') return p.generation === hint.value;
    if (hint.kind === 'TYPE') return p.types.join(',') === hint.values.join(',');
    if (hint.kind === 'TYPE_COUNT') return p.types.length === hint.value;
    if (hint.kind === 'EVOLUTION') return p.stage === hint.stage && p.stages === hint.stages;
    return p.category === hint.value;
  })).map((p) => ({ id: p.id, distancia: distanciaAPaleta(colores, p.palette) }))
    .sort((a, b) => a.distancia - b.distancia).map((p) => p.id);
}

test('zoomed-pokemon: una ronda con un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Zoomed Pokémon');
    // Una ronda (para llegar a la clasificación) de 60 s (el máximo); solo la Gen 1 en sprites y sin formas, con todas
    // las pistas que acotan la respuesta (ver `candidatosZoomed`).
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const sprites = host.page.getByRole('radio', { name: 'Sprites' });
    await sprites.click();
    await expect(sprites).toHaveAttribute('aria-checked', 'true');
    const formas = host.page.getByRole('switch', { name: 'Formas y variantes' });
    await formas.click();
    await expect(formas).toHaveAttribute('aria-checked', 'false');
    for (const nombre of ['Pistas adicionales', 'Nº de tipos', 'Legendario / Mítico']) {
      const interruptor = host.page.getByRole('switch', { name: nombre, exact: true });
      await interruptor.click();
      await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    }
    for (const nombre of ['Generación', 'Tipo', 'Etapa evolutiva']) await expect(host.page.getByRole('switch', { name: nombre, exact: true })).toHaveAttribute('aria-checked', 'true');
    for (const [nombre, tecla, valor] of [['Número de rondas', 'Home', '1'], ['Tiempo por ronda', 'End', '60']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    let estado: ZoomedVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = juegoEnTrama<ZoomedVisible>(payload, 'zoomed-pokemon') ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    const recorte = host.page.getByRole('img', { name: 'Detalle ampliado del Pokémon misterioso' });
    await expect(recorte).toBeVisible({ timeout: 20_000 });
    const buscador = buscadorRespuesta;
    await expect(buscador(host.page)).toBeVisible();
    await expect.poll(() => (estado as ZoomedVisible | null)?.phase === 'ROUND_ACTIVE' && Boolean((estado as ZoomedVisible | null)?.imageUrl), { timeout: 10_000 }).toBe(true);
    const visible = estado as unknown as ZoomedVisible;
    await expect(host.page.getByTestId('guess-hint')).toHaveCount(visible.visibleHints.length);

    const candidatos = candidatosZoomed(visible, catalogo.map((p) => p.id), await coloresOpacos(host.page, visible.imageUrl!)).map((id) => nombres.get(id)!);
    test.info().annotations.push({ type: 'zoomed', description: `pistas ${JSON.stringify(visible.visibleHints)} → candidatos ${candidatos.join(', ')}` });
    expect(candidatos.length, 'candidatos con las pistas visibles').toBeGreaterThanOrEqual(1);
    // Cada candidato fallido cuesta su enfriamiento: con más de 8 la ronda de 60 s puede no bastar, así que se para aquí.
    expect(candidatos.length, `las pistas dejan ${candidatos.length} candidatos (máximo 8 para probarlos en una ronda de 60 s): ${candidatos.join(', ')}`).toBeLessThanOrEqual(8);
    // La respuesta no está en el DOM: ni el nombre de ningún candidato, ni en `alt` o `title`.
    for (const nombre of candidatos) {
      await expect(host.page.locator('main')).not.toContainText(nombre);
      expect(await host.page.locator(`main [alt="${nombre}"], main [title="${nombre}"]`).count()).toBe(0);
    }

    // Marcador: una fila por jugador; los intentos vacíos enseñan a jugar.
    await expect(host.page.getByTestId('guess-score-row')).toHaveCount(3);
    await expect(host.page.getByText('Todavía no hay intentos incorrectos.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-pista', { sigue: recorte });
    // A 390×844, sin desplazar: el recorte y el buscador a la vista.
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(recorte).toBeInViewport({ ratio: 1 });
    await expect(buscador(host.page)).toBeInViewport({ ratio: 1 });
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Un fallo seguro (un Pokémon que no cumple las pistas): el aviso de la espera se ve, la región viva lo dice una vez
    // y los demás ven el intento.
    const fallo = catalogo.find((p) => !candidatos.includes(p.name))!.name;
    await adivinar(host.page, fallo);
    await expect(host.page.getByTestId('guess-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
    await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(host.page.getByText(`${fallo} no era`, { exact: true })).toBeVisible();
    // Buscando (la bandeja abierta): a 390×844 el primer resultado y el recorte siguen a la vista.
    await buscador(host.page).fill('a');
    const primerResultado = host.page.locator('.pokemon-selector-results button').first();
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(primerResultado).toBeInViewport({ ratio: 1 });
    await expect(recorte).toBeInViewport();
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await buscador(host.page).blur();
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-busqueda', { sigue: primerResultado });
    await buscador(host.page).fill('');

    // El acierto: se prueban los candidatos por orden (casi siempre basta el primero; cada fallo espera 1 s).
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    const respuesta = await acertarEnOrden(host.page, candidatos, '¡Acertado!');
    test.info().annotations.push({ type: 'zoomed', description: `respuesta ${respuesta} (puesto ${candidatos.indexOf(respuesta) + 1} de ${candidatos.length})` });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-acertado', { sigue: acertado });
    await capturarTamanos(primero.page, 'juego-zoomed-pokemon-marcador', { sigue: buscador(primero.page) });

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
    await expect(filas.first()).toContainText(/Zoom ×[\d.]+ · \+\d extra/);
    await expect(filas.filter({ hasText: segundo.name })).toContainText('No acertó');
    await expect(host.page.getByText(/^Así empezó · Zoom ×5$/)).toBeVisible();
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura poco: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-zoomed-pokemon-revelacion', era);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
