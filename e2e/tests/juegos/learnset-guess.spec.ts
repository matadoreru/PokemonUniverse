/**
 * E2E de Learnset Guess (`learnset-guess`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { JAVA_WS, capturarTamanos, esSelector, elegirPokemon, capturarAnotando, elegirModo, ajustarRango, comprobarChipDeCarta, capturarMostrando, comprobarTituloDeCabecera, comprobarAlturaDeCartas } from '../../src/juegos.js';

/** Estado público de Learnset Guess que llega por el `/ws` (solo lo que usa el test). */
interface LearnsetVisible {
  phase: string;
  referenceGeneration: number;
  visibleGroups: Array<{ level: number | null; moves: Array<{ moveId: string }>; stage: number }>;
}

/**
 * «Ahora vale N pts» calculado aparte con la regla del motor (`learnsetPoints` de `learnset-guess/rules.ts`): 5 menos
 * la etapa de pistas, mínimo 1, más el bonus de orden (+2 al primero, +1 al segundo).
 */
function valorEnJuego(estado: LearnsetVisible, aciertos: number): string {
  const etapa = Math.max(0, ...estado.visibleGroups.map((g) => g.stage));
  const puntos = Math.max(1, 5 - etapa) + ([2, 1][aciertos] ?? 0);
  return `Ahora vale ${puntos} ${puntos === 1 ? 'pt' : 'pts'}`;
}

/** Busca en una trama del `/ws` el estado público de Learnset Guess. */
function learnsetEnTrama(payload: string | Buffer): LearnsetVisible | null {
  let frame: unknown;
  try { frame = JSON.parse(String(payload)); } catch { return null; }
  const pendientes: unknown[] = [frame];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (!actual || typeof actual !== 'object') continue;
    if ((actual as { gameId?: unknown }).gameId === 'learnset-guess' && Array.isArray((actual as { visibleGroups?: unknown }).visibleGroups)) return actual as LearnsetVisible;
    pendientes.push(...Object.values(actual));
  }
  return null;
}

/**
 * Candidatos a la respuesta de Learnset con los movimientos revelados: Pokémon de la BD local que aprenden, en la
 * generación de referencia, exactamente los movimientos de cada nivel visible.
 */
function candidatosLearnset(estado: LearnsetVisible): string[] {
  const grupos = estado.visibleGroups.filter((g) => g.level !== null && g.moves.length > 0);
  const primero = grupos[0];
  if (!primero) return [];
  const filas = psql(
    `SELECT "pokemonId", "moveId", level FROM "PokemonLevelUpMove" WHERE "referenceGeneration" = :'gen'::int AND "pokemonId" IN (
       SELECT "pokemonId" FROM "PokemonLevelUpMove" WHERE "referenceGeneration" = :'gen'::int AND "moveId" = :'move' AND level = :'level'::int);`,
    { gen: String(estado.referenceGeneration), move: primero.moves[0]!.moveId, level: String(primero.level) },
  );
  const porPokemon = new Map<string, Map<number, Set<string>>>();
  for (const fila of filas.split('\n').filter(Boolean)) {
    const [pokemonId, moveId, level] = fila.split('|') as [string, string, string];
    const niveles = porPokemon.get(pokemonId) ?? new Map<number, Set<string>>();
    const moves = niveles.get(Number(level)) ?? new Set<string>();
    moves.add(moveId);
    niveles.set(Number(level), moves);
    porPokemon.set(pokemonId, niveles);
  }
  return [...porPokemon].filter(([, niveles]) => grupos.every((g) => {
    const moves = niveles.get(g.level!);
    return moves !== undefined && moves.size === new Set(g.moves.map((m) => m.moveId)).size && g.moves.every((m) => moves.has(m.moveId));
  })).map(([pokemonId]) => pokemonId);
}

/**
 * El host prueba los candidatos (como mucho cuatro: cada fallo tiene enfriamiento) hasta ver «¡Has acertado!».
 * Fuera de 1..4 candidatos el test no es fiable y lo dice ya.
 */
async function acertarLearnset(host: Page, estado: LearnsetVisible, nombres: ReadonlyMap<string, string>): Promise<void> {
  const candidatos = [...new Set(candidatosLearnset(estado).map((id) => nombres.get(id)).filter((n): n is string => Boolean(n)))];
  test.info().annotations.push({ type: 'learnset', description: `candidatos: ${candidatos.join(', ')}` });
  expect(candidatos.length, `candidatos a la respuesta con los movimientos visibles (1..4): ${candidatos.join(', ') || 'ninguno'}`).toBeGreaterThanOrEqual(1);
  expect(candidatos.length, `demasiados candidatos para probarlos antes del final de la ronda: ${candidatos.join(', ')}`).toBeLessThanOrEqual(4);
  const acierto = host.getByRole('heading', { name: '¡Has acertado!' });
  for (const nombre of candidatos) {
    await expect(host.getByText(/^Espera .*s para confirmar otro intento\.$/)).toHaveCount(0, { timeout: 10_000 });
    await elegirPokemon(host, nombre);
    const resultado = await Promise.race([
      acierto.waitFor({ timeout: 5_000 }).then(() => true, () => false),
      host.getByText(/^Espera .*s para confirmar otro intento\.$/).waitFor({ timeout: 5_000 }).then(() => false, () => false),
    ]);
    if (resultado || await acierto.isVisible()) break;
  }
  await expect(acierto).toBeVisible({ timeout: 5_000 });
}

test('learnset-guess: último aviso a 390', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Learnset Guess');
    // El estado público de la ronda llega por el `/ws` del host; el catálogo del buscador da el nombre de cada id.
    let estado: LearnsetVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = learnsetEnTrama(payload) ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida([host.page, invitado.page]);
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));

    const seleccion = host.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(seleccion).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => (estado as LearnsetVisible | null)?.visibleGroups.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
    // Con dos jugadores, el acierto del host deja al invitado como el último.
    await acertarLearnset(host.page, estado!, nombres);
    const chip = invitado.page.getByRole('status').filter({ hasText: /¡Último aviso! Solo faltas tú: \d+ segundos?\./ });
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await invitado.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await invitado.page.getByRole('textbox', { name: 'Buscar Pokémon' }).blur();
    // Desde arriba: el aviso ya cabe en la vista y así la cabecera fija no tapa contenido.
    await invitado.page.evaluate(() => window.scrollTo(0, 0));
    await expect(chip).toBeInViewport();
    await capturarAnotando(invitado.page, 'juego-learnset-guess-ultimo-aviso', chip, [SIZES[2]]);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('learnset-guess: marcador en vivo', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Learnset Guess');
    // Una sola ronda: tras la revelación se llega a la clasificación.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    let estado: LearnsetVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = learnsetEnTrama(payload) ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    await expect(host.page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => (estado as LearnsetVisible | null)?.visibleGroups.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);

    // Marcador: una fila por jugador, todos a 0; quien aún puede acertar ve lo que vale un acierto.
    const filas = primero.page.getByTestId('learnset-score-row');
    await expect(filas).toHaveCount(3);
    await expect(primero.page.getByTestId('learnset-score')).toHaveText(['0 pts', '0 pts', '0 pts']);
    const enJuego = primero.page.getByTestId('learnset-stake');
    // Coincide con la cuenta del motor para la etapa visible (la pista nueva puede llegar entre lecturas: se reintenta).
    await expect.poll(async () => (await enJuego.innerText()).trim() === valorEnJuego(estado!, 0), { timeout: 10_000 }).toBe(true);

    await acertarLearnset(host.page, estado!, nombres);
    // Los demás ven quién ha acertado (2 s), su fila sube con «1.º» y el valor en juego ya no lleva el bonus del primero.
    await expect(primero.page.getByRole('status').filter({ hasText: `${host.name} ha acertado` })).toBeVisible({ timeout: 2_000 });
    const filaHost = filas.first();
    await expect(filaHost).toContainText(host.name);
    await expect(filaHost).toContainText('1.º');
    await expect(filaHost.getByTestId('learnset-score')).toHaveText(/^[1-9]\d* pts$/);
    await expect.poll(async () => (await enJuego.innerText()).trim() === valorEnJuego(estado!, 1), { timeout: 10_000 }).toBe(true);
    await expect(host.page.getByTestId('learnset-stake')).toHaveCount(0);
    // Los puntos saltan con `motion-bump`; con la reducción de movimiento, nada.
    const puntos = filaHost.getByTestId('learnset-score');
    expect(await animacionDe(puntos), 'puntos con reducción de movimiento').toBe('none');
    await conMovimiento(primero.page);
    expect(await animacionDe(puntos), 'puntos con movimiento').toBe('motion-bump');
    await primero.page.emulateMedia({ reducedMotion: 'reduce' });
    await primero.page.getByRole('textbox', { name: 'Buscar Pokémon' }).blur();
    await primero.page.evaluate(() => window.scrollTo(0, 0));
    // La captura enseña una pista recién llegada (arriba, marcada «Nueva»): llega a los 7 s de la ronda.
    await expect(primero.page.locator('li[data-stage]:not([data-stage="0"])').first()).toBeVisible({ timeout: 15_000 });
    await capturarTamanos(primero.page, 'juego-learnset-guess-pistas', { sigue: enJuego });
    // A 390×844, sin desplazar: la última pista y el buscador a la vista, y la pantalla inferior no tapa la pista.
    await primero.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await primero.page.evaluate(() => window.scrollTo(0, 0));
    const ultimaPista = primero.page.getByRole('list', { name: 'Movimientos conocidos' }).getByRole('listitem').first();
    await expect(ultimaPista).toBeInViewport({ ratio: 1 });
    await expect(primero.page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeInViewport({ ratio: 1 });
    const inferior = (await primero.page.locator('[data-layer="screen-bottom"]').boundingBox())!;
    const pista = (await ultimaPista.boundingBox())!;
    expect(pista.y + pista.height, 'última pista entera sobre la pantalla inferior').toBeLessThanOrEqual(inferior.y);
    // Escribiendo (la bandeja de resultados abierta): el primer resultado y la última pista siguen a la vista.
    const buscadorPrimero = primero.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await buscadorPrimero.fill('a');
    const primerResultado = primero.page.locator('.pokemon-selector-results button').first();
    await expect(primerResultado).toBeInViewport({ ratio: 1 });
    await expect(ultimaPista).toBeInViewport({ ratio: 1 });
    const inferiorAbierta = (await primero.page.locator('[data-layer="screen-bottom"]').boundingBox())!;
    const pistaAbierta = (await ultimaPista.boundingBox())!;
    expect(pistaAbierta.y + pistaAbierta.height, 'última pista sobre la pantalla inferior con la bandeja abierta').toBeLessThanOrEqual(inferiorAbierta.y);
    await primero.page.setViewportSize({ width: 1280, height: 720 });
    await buscadorPrimero.blur();
    await capturarTamanos(primero.page, 'juego-learnset-guess-busqueda', { sigue: primerResultado });
    await buscadorPrimero.fill('');

    // Si alguien se va sin acertar, la revelación dice «Sin conexión» y no «No acertó».
    await segundo.context.close();
    const era = host.page.getByRole('heading', { name: /^¡Era / });
    await expect(era).toBeVisible({ timeout: 45_000 });
    const tarjetas = host.page.getByTestId('learnset-reveal-row');
    await expect(tarjetas.filter({ hasText: segundo.name })).toContainText('Sin conexión');
    await expect(tarjetas.filter({ hasText: segundo.name })).not.toContainText('No acertó');
    await expect(tarjetas.filter({ hasText: primero.name })).toContainText('✗ No acertó');
    // La revelación dura 4 s: lo que mida el medidor se anota.
    // La carta de la respuesta carga con prioridad (`Card eager`): se captura con el sprite ya descodificado.
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    await capturarAnotando(host.page, 'juego-learnset-guess-revelacion', era);

    // Clasificación de la partida (una ronda).
    await expect(host.page.getByRole('heading', { name: 'Clasificación Learnset Guess' })).toBeVisible({ timeout: 15_000 });
    await capturarTamanos(host.page, 'juego-learnset-guess-clasificacion');
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('learnset-guess: modo Revelación manual, cada fallo revela más movimientos y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Learnset Guess');
    await elegirModo(host.page, 'Revelación manual');
    // Una ronda de 15 s (el mínimo): nadie acierta y la ronda cierra por tiempo.
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    await ajustarRango(host.page, 'Tiempo por ronda', 'Home', '15');
    const carta = await comprobarChipDeCarta(host.page, 'Learnset Guess', 'Revelación manual');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-revelacion-manual', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    await comprobarTituloDeCabecera(host.page, 'Learnset Guess · Revelación manual');

    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(buscador(host.page)).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ de \d+ grupos?$/).first()).toBeVisible({ timeout: 10_000 });
    const antes = await host.page.getByText(/^\d+ de \d+ grupos?$/).first().innerText();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-revelacion-manual', { sigue: buscador(host.page) });

    // Un fallo del host (Magikarp): le desbloquea el siguiente grupo y solo a él.
    await elegirPokemon(host.page, 'Magikarp');
    await expect.poll(() => host.page.getByText(/^\d+ de \d+ grupos?$/).first().innerText(), { timeout: 10_000 }).not.toBe(antes);
    await expect(invitados[0]!.page.getByText(antes, { exact: true }).first()).toBeVisible();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarAnotando(host.page, 'juego-modo-revelacion-manual-fallo', host.page.getByText(/^\d+ de \d+ grupos?$/).first());

    const fin = host.page.getByRole('heading', { name: 'Clasificación Learnset Guess' });
    await expect(fin).toBeVisible({ timeout: 60_000 });
    await expect(host.page.getByText(/Learnset Guess · Revelación manual · 1 ronda/)).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-revelacion-manual-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
