/**
 * Un test por minijuego del registro (`backend/src/main/resources/games/registry.json`) contra el `/ws`
 * del backend Java (`npm run test:e2e -- juegos`):
 * sala nueva con `max(3, minPlayers)` invitados, selección del juego, listos, «Empezar partida» y
 * comprobación de que la partida sale del lobby y pinta su pantalla sin desbordes a 1280×720.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Response, type Route } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, introDePartida, layoutProblems, psql, saltarIntro, seleccionarJuego, SIZES, type CaptureOptions, type Jugador, type SalaConJugadores } from '../src/helpers.js';

interface Manifest {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers?: number;
}

const registry = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/games/registry.json', import.meta.url), 'utf8')) as Manifest[];

/** Juegos que piden al servidor un sprite o un audio por opción de ronda. */
const ASSET_GAMES = new Set(['whos-that-pokemon', 'zoomed-pokemon', 'shiny-vote', 'pokemon-cry-quiz']);
const ASSET_URL = /^\/api\/rooms\/[^/]+\/games\/[^/]+\/rounds\/[^/]+\/options\/[^/]+\/(sprite|audio)$/;

/**
 * Literales con los que el servidor declara un juego no disponible
 * con los datos de la BD local. Solo se salta el test si el lobby muestra exactamente esto.
 */
const UNAVAILABLE: Record<string, RegExp> = {
  'tcg-higher-lower': /No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros\./,
  'pokemon-palette-guess': /No hay suficientes paletas en PostgreSQL para las generaciones y tamaño seleccionados\.|No hay paletas persistidas para esta configuración\./,
};

/** WebSocket de la sala (`frontend/src/lib/socket.ts`): siempre el `/ws` de Java, nunca Socket.IO. */
const JAVA_WS = /^wss?:\/\/[^/]+\/ws$/;
const SOCKET_IO = /\/socket\.io\//;

/** Estado de un jugador de Pokédex Distance que ya ha elegido con las elecciones ocultas (`pokedex-distance-selection.ts`). */
const DISTANCE_PICKED = '✓ Ya ha elegido';

/** Pantallas rediseñadas con Arcade DS (F5): texto de 13 px o más y, en escritorio, sin scroll de página ni del `main`. */
const ARCADE: CaptureOptions = { minFontPx: 13, noPageScroll: true };

/** Lo que el backend Java dice de un juego sin motor portado: nunca debe salir. */
const NOT_PORTED = 'Este minijuego todavía no está disponible en el servidor Java.';

/**
 * Juegos de la captura genérica rediseñados con Arcade DS (F6): su captura a los tres tamaños se mide con `ARCADE`
 * (13 px y sin scroll de página ni del `main`).
 */
const ARCADE_GAMES = new Set(['whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess', 'pokemon-cry-quiz', 'pokedex-entry-guess', 'guess-from-stats', 'pokeddle-race', 'type-chain', 'pokemon-trivia']);

/** Un juego de cada lote de la etapa 2B: se captura a los tres tamaños de revisión (Higher or Lower, en su propio test). */
const SCREENSHOT_GAMES = new Set(['shiny-vote', 'type-duel', 'poke-taboo', 'most-likely-to', 'learnset-guess', 'whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess', 'pokemon-cry-quiz', 'pokedex-entry-guess', 'guess-from-stats', 'pokeddle-race', 'type-chain', 'pokemon-trivia', 'who-is-who-pokemon', 'pokemon-bingo', 'sketchmon']);

/** Texto del aviso de error del lobby o de la sala, si hay alguno visible. */
async function avisos(page: Page): Promise<string> {
  const textos = await page.getByRole('alert').allInnerTexts();
  return textos.join(' | ');
}

/** Espera a que la pantalla de juego esté pintada: sin lobby, sin esqueleto de carga y con contenido. */
async function esperarPantallaDeJuego(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeHidden({ timeout: 15_000 });
  // Intro de partida de los 6 primeros juegos: «Empezar ya» y, si nadie más la salta, el plazo de 10 s.
  if (await introDePartida(page).isVisible()) await saltarIntro([page]);
  await expect(page.getByText('Cargando minijuego…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Fin de `GAME_STARTING`: espera hasta 15 s a que cambie el texto de la pantalla recién pintada
 * (cuenta atrás, primera ronda). Algunos juegos no cambian hasta que alguien actúa: no falla.
 */
async function esperarCambio(page: Page): Promise<boolean> {
  const inicial = await page.locator('body').innerText();
  try {
    await page.waitForFunction((antes) => document.body.innerText !== antes, inicial, { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

for (const manifest of registry) {
  test(manifest.id, async ({ browser }) => {
    test.setTimeout(90_000);
    const players = Math.max(3, manifest.minPlayers);
    let sala: SalaConJugadores | undefined;
    try {
      sala = await crearSalaConJugadores(browser, players);
      const { host, invitados, jugadores } = sala;
      await seleccionarJuego(host.page, manifest.name);

      const asset: Promise<Response> | null = ASSET_GAMES.has(manifest.id)
        ? host.page.waitForResponse((r) => ASSET_URL.test(new URL(r.url()).pathname), { timeout: 20_000 })
        : null;
      // Evita un rechazo sin manejar si el test termina antes (por ejemplo, en un skip).
      asset?.catch(() => undefined);

      await iniciarPartida(host.page, invitados.map((j) => j.page));

      const unavailable = UNAVAILABLE[manifest.id];
      if (unavailable) {
        // El juego puede estar disponible si la BD tiene los datos: entonces se prueba como los demás.
        // Si no pasa ninguna de las dos cosas, sigue y falla abajo con los avisos que haya.
        const outcome = await Promise.race([
          host.page.getByRole('heading', { name: 'Lobby de la sala' }).waitFor({ state: 'hidden', timeout: 15_000 }).then(() => 'started' as const, () => 'none' as const),
          host.page.getByRole('alert').filter({ hasText: unavailable }).first().waitFor({ timeout: 15_000 }).then(() => 'unavailable' as const, () => 'none' as const),
        ]);
        if (outcome === 'unavailable') {
          const texto = await avisos(host.page);
          expect(texto).not.toContain(NOT_PORTED);
          await expect(host.page.getByText(NOT_PORTED)).toHaveCount(0);
          test.skip(true, `El servidor declara el juego no disponible: ${texto}`);
          return;
        }
      }

      // Si el servidor rechaza el arranque, que el fallo diga por qué.
      const lobby = host.page.getByRole('heading', { name: 'Lobby de la sala' });
      await expect.poll(async () => (await lobby.isVisible()) ? `lobby; avisos: ${await avisos(host.page)}` : 'fuera del lobby', { timeout: 15_000 }).toBe('fuera del lobby');
      await saltarIntro(jugadores.map((j) => j.page));

      for (const jugador of jugadores) await esperarPantallaDeJuego(jugador.page);
      // La sala va por el `/ws` de Java y nadie abre Socket.IO.
      for (const jugador of jugadores) {
        expect(jugador.websockets, `${jugador.name}: WebSocket de la sala`).toContainEqual(expect.stringMatching(JAVA_WS));
        expect(jugador.websockets, `${jugador.name}: sin Socket.IO`).not.toContainEqual(expect.stringMatching(SOCKET_IO));
      }
      for (const jugador of jugadores) {
        expect(await avisos(jugador.page)).not.toContain(NOT_PORTED);
        await expect(jugador.page.getByText(NOT_PORTED)).toHaveCount(0);
      }

      if (asset) {
        const response = await asset;
        test.info().annotations.push({ type: 'recurso', description: `${new URL(response.url()).pathname} → ${response.status()} ${response.headers()['content-type'] ?? '(sin content-type)'}` });
        // Un grito puede llegar por rangos (`206 Partial Content`, la petición de medios del navegador): también vale.
        expect([200, 206], `${response.url()}`).toContain(response.status());
        expect(response.headers()['content-type'] ?? '').toMatch(/^(image\/png|audio\/)/);
      }

      const cambio = await esperarCambio(host.page);
      const titulo = await host.page.getByText(manifest.name, { exact: true }).first().isVisible();
      test.info().annotations.push({ type: 'pantalla', description: `cambia tras pintar: ${cambio ? 'sí' : 'no'}; título del manifest visible: ${titulo ? 'sí' : 'no'}` });

      if (SCREENSHOT_GAMES.has(manifest.id)) {
        // Capturas de revisión a los tres tamaños antes de la aserción, para que existan aunque falle:
        // fuera de 1280×720 lo que mida el medidor solo se anota.
        for (const { w, h } of SIZES) {
          await host.page.setViewportSize({ width: w, height: h });
          const { id, problems } = await layoutProblems(host.page, `juego-${manifest.id}`, true, false, ARCADE_GAMES.has(manifest.id) ? ARCADE : {});
          if (problems.length && w !== 1280) test.info().annotations.push({ type: 'encaje', description: `${id}: ${problems.join(' · ')}` });
        }
        await host.page.setViewportSize({ width: 1280, height: 720 });
      }
      if (manifest.id === 'who-is-who-pokemon') {
        // Con el secreto aleatorio (por defecto) solo se llega a «Adivinar Pokémon»: lo abre quien tenga el turno.
        const adivinar = (page: Page) => page.getByRole('button', { name: 'Adivinar Pokémon' });
        let turno: Page | undefined;
        await expect.poll(async () => {
          for (const { page } of jugadores) if (await adivinar(page).isEnabled().catch(() => false)) { turno = page; return true; }
          return false;
        }, { timeout: 20_000 }).toBe(true);
        await adivinar(turno!).click();
        const dialogo = turno!.getByRole('dialog', { name: 'Adivinar Pokémon' });
        await expect(dialogo).toBeVisible();
        // Como las capturas del juego: el medidor ve también la pantalla de fondo (su insignia «SECRETO» es de 10 px,
        // deuda previa), así que lo que mida solo se anota.
        for (const { w, h } of SIZES) {
          await turno!.setViewportSize({ width: w, height: h });
          await expect(dialogo).toBeVisible();
          const { id, problems } = await layoutProblems(turno!, 'dialogo-adivinar', true, false, { minFontPx: 12 });
          if (problems.length) test.info().annotations.push({ type: 'encaje', description: `${id}: ${problems.join(' · ')}` });
        }
        await turno!.setViewportSize({ width: 1280, height: 720 });
        await turno!.keyboard.press('Escape');
        await expect(dialogo).toBeHidden();
      }
      for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);

      // A 1280×720 el scroll horizontal siempre falla; lo que mida `measureLayout` se anota (deuda de
      // UI previa, ver README) y solo hace fallar el test con `PU_LAYOUT_STRICT=1`.
      const { id, problems } = await layoutProblems(host.page, `juego-${manifest.id}`, false);
      for (const problem of problems) test.info().annotations.push({ type: 'encaje', description: `${id}: ${problem}` });
      if (process.env.PU_LAYOUT_STRICT === '1') expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    } finally {
      await sala?.cerrar();
    }
  });
}

/**
 * Capturas de revisión de una pantalla a los tres tamaños, con `measureLayout` vacío en todos. Si se pasa `sigue`,
 * después de cada captura se comprueba que sigue visible: una fase que avanza sola no debe fotografiar la siguiente.
 * Con `completa`, el PNG es de página completa (para paneles más altos que la vista; el medidor ya mide toda la página).
 */
async function capturarTamanos(page: Page, nombre: string, { sigue, completa = false, opts }: { sigue?: Locator; completa?: boolean; opts?: CaptureOptions } = {}): Promise<void> {
  const comprobar = async () => { if (sigue) await expect(sigue, `${nombre}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 }); };
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), undefined, { timeout: 3_000 }).catch(() => undefined);
    const { id, problems } = await layoutProblems(page, nombre, true, completa, opts);
    await comprobar();
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** Primera página (de las dadas) en la que el localizador se hace visible antes de `timeout`. */
async function primeraVisible(pages: readonly Page[], localizar: (page: Page) => Locator, timeout = 20_000): Promise<Page> {
  let encontrada: Page | undefined;
  await expect.poll(async () => {
    for (const page of pages) if (await localizar(page).isVisible()) { encontrada = page; return true; }
    return false;
  }, { timeout }).toBe(true);
  return encontrada!;
}

test('type-duel: elección secreta, VS, búsqueda con un fallo, victoria y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Type Duel');
    // Un solo duelo (para llegar a la clasificación) y plazos largos: da tiempo a capturar cada fase.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, tecla, valor] of [['Número de rondas', 'Home', '1'], ['Tiempo para elegir tipo', 'End', '60'], ['Tiempo para buscar', 'End', '60']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));
    for (const { page } of jugadores) await expect(page.getByRole('heading', { name: 'Elegid un tipo en secreto' })).toBeVisible({ timeout: 20_000 });

    // Los dos duelistas son las páginas con los 18 tipos (conmutadores sin pulsar); el tercero observa.
    const duelistas: Page[] = [];
    let observador: Page | undefined;
    for (const { page } of jugadores) {
      if (await page.getByRole('button', { name: 'Elegir tipo Fuego' }).isVisible()) duelistas.push(page);
      else observador = page;
    }
    expect(duelistas.length, 'duelistas que eligen tipo').toBe(2);
    const [primero, segundo] = duelistas as [Page, Page];
    await expect(primero.getByRole('button', { name: /^Elegir tipo / })).toHaveCount(18);
    await expect(primero.getByRole('button', { name: 'Elegir tipo Fuego' })).toHaveAttribute('aria-pressed', 'false');
    await expect(observador!.getByText('Estás observando la selección.')).toBeVisible();
    await expect(observador!.locator('[data-type]'), 'el observador no ve ningún tipo').toHaveCount(0);
    await capturarTamanos(primero, 'juego-type-duel-eleccion', { opts: ARCADE });
    // A 390×844, sin desplazar, los 18 tipos caben en la pantalla inferior.
    await primero.setViewportSize({ width: 390, height: 844 });
    for (const tipo of ['Normal', 'Hada']) await expect(primero.getByRole('button', { name: `Elegir tipo ${tipo}` }), `${tipo} a la vista a 390×844`).toBeInViewport({ ratio: 1 });
    // Y la pantalla inferior no tapa las tarjetas de los duelistas.
    const abajo = (await primero.locator('[data-layer="screen-bottom"]').boundingBox())!;
    for (const tarjeta of await primero.locator('[aria-labelledby="type-duel-pick-title"] [data-duelist]').all()) {
      const caja = (await tarjeta.boundingBox())!;
      expect(caja.y + caja.height, 'tarjeta de duelista entera sobre la pantalla inferior').toBeLessThanOrEqual(abajo.y);
    }
    await primero.setViewportSize({ width: 1280, height: 720 });

    // Elige con el teclado: flecha a la derecha desde Normal y Enter; el foco pasa al título de la placa bloqueada.
    await primero.getByRole('button', { name: 'Elegir tipo Normal' }).focus();
    await primero.keyboard.press('ArrowRight');
    await expect(primero.getByRole('button', { name: 'Elegir tipo Fuego' })).toBeFocused();
    await primero.keyboard.press('Enter');
    const bloqueado = primero.locator('[data-layer="screen-bottom"] h2');
    await expect(bloqueado).toContainText('Elegiste');
    await expect(bloqueado).toBeFocused();
    await expect(primero.getByText('El tipo rival sigue oculto.')).toBeVisible();
    // El rival solo sabe que ya ha bloqueado, nunca qué: en su página no hay más tipos que sus 18 opciones.
    await expect(segundo.getByText('Tipo bloqueado').first()).toBeVisible();
    await expect(segundo.locator('[data-type]')).toHaveCount(18);
    await segundo.getByRole('button', { name: 'Elegir tipo Fuego' }).click();

    // Revelación (2 s) y búsqueda: losa VS con cuántos Pokémon cumplen la combinación.
    const versus = host.page.getByTestId('type-duel-versus');
    await expect(versus).toBeVisible({ timeout: 10_000 });
    const vs = versus.getByText('VS', { exact: true });
    await expect(vs).toBeVisible();
    await expect(versus.getByText(/^\d+ Pokémon tienen esta combinación$/)).toBeVisible();
    for (const lado of ['.motion-enter-left', '.motion-enter-right']) await expect(versus.locator(`${lado} [data-type="fire"]`)).toHaveText('Fuego');
    // Los dos eligieron Fuego: «Monotipo» en vez de repetir la insignia, y el título no repite los nombres.
    await expect(versus.getByText('Monotipo', { exact: true })).toBeVisible();
    await expect(host.page.getByRole('heading', { level: 1, name: 'Duelo de tipos' })).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-vs', { sigue: versus, opts: ARCADE });
    expect(await animacionDe(vs.locator('..')), 'VS con reducción de movimiento').toBe('none');
    await conMovimiento(host.page);
    expect(await animacionDe(vs.locator('..')), 'VS con movimiento').toBe('motion-bump');
    expect(await animacionDe(versus.locator('.motion-enter-left')), 'primer duelista con movimiento').toBe('motion-enter-left');
    await host.page.emulateMedia({ reducedMotion: 'reduce' });

    // Con la losa del VS encima, el buscador del duelista sigue a la vista en móvil durante la búsqueda.
    const buscador = primero.getByLabel('Buscar Pokémon con la combinación exacta');
    await expect(buscador).toBeVisible({ timeout: 10_000 });
    await primero.setViewportSize({ width: 390, height: 844 });
    await expect(buscador).toBeInViewport();
    // Al escribir, el campo y los dos primeros candidatos caben enteros en la pantalla sin desplazarla.
    await buscador.fill('char');
    const candidatos = primero.locator('.pokemon-selector-results button');
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    expect(await primero.evaluate(() => window.scrollY), 'desplazamiento al buscar').toBe(0);
    await expect(buscador).toBeInViewport({ ratio: 1 });
    for (const n of [0, 1]) await expect(candidatos.nth(n), `candidato ${n + 1} entero a 390×844`).toBeInViewport({ ratio: 1 });
    // Los tipos de la losa se ven enteros y la pantalla inferior no los tapa.
    const losa = primero.getByTestId('type-duel-versus');
    for (const lado of ['.motion-enter-left', '.motion-enter-right']) await expect(losa.locator(`${lado} [data-type]`)).toBeInViewport({ ratio: 1 });
    const cajaLosa = await losa.locator('.motion-enter-left [data-type]').boundingBox();
    const inferior = await primero.locator('[data-layer="screen-bottom"]').boundingBox();
    expect(cajaLosa!.y + cajaLosa!.height, 'la pantalla inferior no tapa los tipos').toBeLessThanOrEqual(inferior!.y);
    const busqueda = await layoutProblems(primero, 'juego-type-duel-vs-busqueda', true, false, ARCADE);
    expect(busqueda.problems, `${busqueda.id}: encaje y legibilidad`).toEqual([]);
    await primero.setViewportSize({ width: 1280, height: 720 });

    // Un intento fallido (Charizard es Fuego/Volador): sale en los intentos públicos y junto al buscador.
    await buscador.fill('charizard');
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    await buscador.press('Enter');
    await expect(host.page.getByText('No coincide con los tipos').first()).toBeVisible({ timeout: 10_000 });
    await expect(primero.locator('[data-layer="screen-bottom"]').getByText(/no coincide/)).toBeVisible();
    await buscador.fill('char');
    await capturarTamanos(primero, 'juego-type-duel-busqueda', { opts: ARCADE });

    // Charmander es Fuego puro: gana el duelo.
    await buscador.fill('charmander');
    await expect(candidatos.first()).toContainText('Charmander', { timeout: 10_000 });
    await expect(candidatos.first()).toBeEnabled({ timeout: 5_000 });
    await buscador.press('Enter');
    const titulo = host.page.getByRole('heading', { level: 2, name: / gana$/ });
    await expect(titulo).toBeVisible({ timeout: 10_000 });
    const resultado = host.page.getByTestId('type-duel-result');
    await expect(resultado.locator('[data-type="fire"]').first()).toBeVisible();
    await expect(resultado.locator('[data-winning-card]')).toContainText('Charmander');
    await expect(primero.locator('[data-layer="screen-bottom"]').getByText('¡Ganaste el duelo!')).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-resultado', { sigue: titulo, opts: ARCADE });

    // Un solo duelo: el host pasa a la clasificación.
    await host.page.getByRole('button', { name: 'Ver clasificación' }).click();
    const clasificacion = host.page.getByRole('heading', { level: 1, name: 'Clasificación Type Duel' });
    await expect(clasificacion).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText('Récords de la partida')).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-clasificacion', { opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokemon-impostor: roles, pistas, votación con Saltar y victoria por tres rondas sin expulsión', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    // Cada página en un tamaño de revisión: las fases cortas (roles 5 s, recuento 3 s) se capturan a la vez en las tres.
    const ajustar = async () => { for (const [i, page] of pages.entries()) await page.setViewportSize({ width: SIZES[i]!.w, height: SIZES[i]!.h }); };
    const enParalelo = async (nombre: string) => {
      const medidas = await Promise.all(pages.map((page) => layoutProblems(page, nombre, true, false, ARCADE)));
      for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    };
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await ajustar();
    await saltarIntro(pages);

    // Reparto de roles: cada uno ve el suyo; el impostor, sin el Pokémon.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeVisible({ timeout: 15_000 });
    await enParalelo('juego-pokemon-impostor-rol');
    let impostores = 0;
    for (const page of pages) if (await page.getByText('No conoces el Pokémon. Intenta disimular.').isVisible()) impostores++;
    expect(impostores, 'un impostor que no conoce el Pokémon').toBe(1);

    const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
    const saltar = (page: Page) => page.getByRole('button', { name: 'Saltar', exact: true });
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    for (let ronda = 1; ronda <= 3; ronda++) {
      if (ronda === 2) {
        // En el móvil el rol (y el Pokémon del inocente) se ve sin desplazar durante las pistas.
        let sinPokemon = 0;
        for (const page of pages) {
          await page.setViewportSize({ width: 390, height: 844 });
          const linea = page.getByTestId('impostor-role-strip');
          await expect(linea).toBeInViewport({ ratio: 1 });
          const secreto = page.locator('[data-impostor-secret]');
          if (await secreto.count()) await expect(linea).toContainText((await secreto.first().getAttribute('data-impostor-secret'))!);
          else { await expect(linea).toContainText('Impostor · no conoces el Pokémon'); sinPokemon++; }
        }
        expect(sinPokemon, 'solo el impostor no ve el Pokémon').toBe(1);
        await ajustar();
      }
      // Tres turnos de pista: cada vez, la página con el campo visible escribe y envía.
      for (let turno = 0; turno < 3; turno++) {
        const page = await primeraVisible(pages, campo);
        if (ronda === 1 && turno === 1) {
          await capturarTamanos(page, 'juego-pokemon-impostor-pistas', { sigue: campo(page), opts: ARCADE });
          await ajustar();
        }
        await campo(page).fill(`pista ${ronda}`);
        await campo(page).press('Enter');
        await expect(campo(page)).toBeHidden();
      }

      for (const page of pages) await expect(saltar(page)).toBeVisible({ timeout: 15_000 });
      if (ronda === 1) {
        await capturarTamanos(host.page, 'juego-pokemon-impostor-votacion', { sigue: saltar(host.page), opts: ARCADE });
        await ajustar();
      }
      for (const page of pages) {
        await saltar(page).click();
        await expect(saltar(page)).toHaveAttribute('aria-pressed', 'true');
        await confirmar(page).click();
        // La píldora desaparece al votar: el foco va al título de la placa, no se pierde en `body`.
        if (ronda === 1 && page === host.page) await expect(page.getByRole('heading', { name: 'Tu voto está bloqueado.' })).toBeFocused();
      }
      for (const page of pages) await expect(page.getByText('Se salta la votación: nadie es expulsado')).toBeVisible({ timeout: 10_000 });
      if (ronda === 1) await enParalelo('juego-pokemon-impostor-recuento');
      if (ronda < 3) await expect(host.page.getByText(`Ronda ${ronda + 1}`, { exact: true })).toBeVisible({ timeout: 15_000 });
    }

    // Tercera ronda seguida sin expulsión: ganan los impostores.
    const titulo = host.page.getByRole('heading', { name: 'Ganan los impostores' });
    await expect(titulo).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText('Tres rondas seguidas sin expulsar a nadie.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-impostor-resultados', { sigue: titulo, completa: true, opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test.describe('pokemon-impostor: eliminación', () => {
  // La captura cabe en la ventana de 3,2 s del cut-in con poco margen: un reintento si el equipo va lento.
  test.describe.configure({ retries: 2 });

  test('pokemon-impostor: eliminación con cut-in', async ({ browser }) => {
    test.setTimeout(150_000);
    const sala = await crearSalaConJugadores(browser, 4);
    try {
      const { host, invitados, jugadores } = sala;
      const pages = jugadores.map((j) => j.page);
      await seleccionarJuego(host.page, 'Pokémon Impostor');
      await iniciarPartida(host.page, invitados.map((j) => j.page));
      await saltarIntro(pages);

      const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
      for (let turno = 0; turno < jugadores.length; turno++) {
        const page = await primeraVisible(pages, campo);
        await campo(page).fill('pista');
        await campo(page).press('Enter');
        await expect(campo(page)).toBeHidden();
      }

      // Todos votan al primer invitado; él vota al host: 3 a 1, expulsión sin empate.
      const expulsado = invitados[0]!;
      const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
      for (const page of pages) await expect(confirmar(page)).toBeVisible({ timeout: 20_000 });
      for (const { page, name } of jugadores) {
        await page.getByRole('button', { name: name === expulsado.name ? host.name : expulsado.name, exact: true }).click();
        await confirmar(page).click();
      }

      // Resultado de la votación: el rol aún no está en ninguna parte de la página.
      const banda = (page: Page) => page.locator('.reveal-cut-in[role="status"]');
      await expect(host.page.getByText(`${expulsado.name} recibió más votos`)).toBeVisible({ timeout: 10_000 });
      await expect(banda(host.page)).toHaveCount(0);
      await expect(host.page.getByText(/era (impostor|inocente|IMPOSTOR|INOCENTE)/)).toHaveCount(0);

      // Cada página captura un tamaño a la vez, así las tres caben mientras se ve el cut-in (3,2 s de 4 s).
      const nombre = 'juego-pokemon-impostor-eliminacion';
      const capturas = [
        { page: pages[0]!, w: 1280, h: 720 },
        { page: pages[1]!, w: 1920, h: 1080 },
        { page: pages[2]!, w: 390, h: 844 },
      ];
      for (const { page, w, h } of capturas) await page.setViewportSize({ width: w, height: h });
      // El host ve el movimiento: al empezar la fase el rol no está ni en la banda ni en la tarjeta (ni su color), y llega a 1 s.
      await conMovimiento(host.page);
      await expect(banda(host.page)).toBeVisible({ timeout: 10_000 });
      await expect(banda(host.page)).toContainText(expulsado.name);
      expect(await banda(host.page).textContent(), 'sin rol al empezar la fase').not.toMatch(/era/);
      expect(await host.page.getByText(/era (impostor|inocente|IMPOSTOR|INOCENTE)/).count(), 'tarjeta sin rol al empezar la fase').toBe(0);
      await expect(banda(host.page)).toHaveClass(/reveal-cut-in-electric/);
      await expect(banda(host.page)).toContainText('…era', { timeout: 2_000 });
      await expect(banda(host.page)).toHaveClass(/reveal-cut-in-(berry|aqua)/);
      for (const page of pages.slice(1)) {
        await expect(banda(page)).toBeVisible({ timeout: 2_000 });
        await expect(banda(page)).toContainText(expulsado.name);
        await expect(banda(page)).toContainText('…era');
      }
      const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, nombre, true, false, ARCADE)));
      for (const page of pages) await expect(banda(page), 'el cut-in sigue a la vista tras la captura').toBeVisible({ timeout: 500 });
      for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);

      // La capa no intercepta: en su centro, el puntero llega al contenido de debajo.
      const encima = await banda(host.page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit ? hit.closest('.reveal-cut-in') !== null : true;
      });
      expect(encima, 'el cut-in no intercepta el puntero').toBe(false);
      expect(await animacionDe(banda(host.page)), 'cut-in con movimiento').toBe('reveal-cut-in-enter');
      expect(await animacionDe(banda(host.page).getByText(/^…era/)), 'línea del rol con movimiento').toBe('motion-enter-up');
      const reducida = pages[1]!;
      expect(await animacionDe(banda(reducida)), 'cut-in con reducción de movimiento').toBe('none');
      expect(await animacionDe(banda(reducida).getByText(/^…era/)), 'línea del rol con reducción de movimiento').toBe('none');

      // Con reducción de movimiento la banda se va sola antes de que acabe la fase de 4 s.
      await expect(banda(reducida)).toBeHidden({ timeout: 4_000 });
      await expect(reducida.getByRole('heading', { name: 'Jugador eliminado' })).toBeVisible();
      await host.page.emulateMedia({ reducedMotion: 'reduce' });
      for (const { page, w, h } of capturas) {
        if (w !== 1280 || h !== 720) await page.setViewportSize({ width: 1280, height: 720 });
      }
      for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
    } finally {
      await sala.cerrar();
    }
  });
});

test('pokemon-impostor: panel de configuración', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    for (const { page } of invitados) await page.getByRole('button', { name: 'Marcarme listo' }).click();
    await expect(host.page.locator('#start-help')).toHaveText('La sala está lista.');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const impostores = host.page.getByRole('slider', { name: 'Impostores' });
    await expect(impostores).toBeVisible();
    await expect(host.page.getByText('Con 1 impostor hacen falta al menos 3 jugadores.')).toBeVisible();
    // Dos impostores con 3 jugadores: la pista pide 5 y el lobby avisa antes de «Empezar partida».
    await impostores.focus();
    await impostores.press('ArrowRight');
    await expect(host.page.getByText('Con 2 impostores hacen falta al menos 5 jugadores.')).toBeVisible();
    await expect(host.page.locator('#start-help')).toHaveText('Demasiados impostores: con 3 jugadores el máximo es 1.');
    await expect(host.page.getByRole('button', { name: 'Empezar partida' })).toBeDisabled();
    await impostores.blur();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'lobby-config-pokemon-impostor');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('lobby: rotación con Impostor omitido por paridad', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, jugadores } = sala;
    const page = host.page;
    await page.getByRole('tab', { name: 'Modo y sesión' }).click();
    const aleatorio = page.getByRole('button', { name: /^Aleatorio/ });
    await aleatorio.click();
    await expect(aleatorio).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Buscar en la rotación').fill('Impostor');
    const fila = page.getByRole('region', { name: 'Juegos de la rotación' }).locator('article').filter({ has: page.locator('strong').getByText('Pokémon Impostor', { exact: true }) });
    await fila.getByRole('button', { name: 'Ajustar' }).click();
    // Dos impostores necesitan 5 jugadores: con 3, la rotación lo omite en vez de bloquear la sala.
    const impostores = page.getByRole('slider', { name: 'Impostores' });
    await impostores.focus();
    await impostores.press('ArrowRight');
    await expect(page.getByText('2 impostores', { exact: true })).toBeVisible();
    await expect(fila.getByText('Se omitirá', { exact: true })).toBeVisible();
    await expect(page.getByText('Se omitirá en la rotación mientras haya 3 jugadores.', { exact: false })).toBeVisible();
    // Pulsar el deslizador desplaza la página y la cabecera fija taparía el contenido: se captura desde arriba.
    await impostores.blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-rotacion-impostor-omitido');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('lobby: cómo se juega', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { jugadores } = sala;
    // Un invitado no puede elegir juego, pero sí leer cómo se juega.
    const page = sala.invitados[0]!.page;
    const abrir = page.getByRole('button', { name: 'Cómo se juega a Type Duel' });
    await expect(abrir).toBeEnabled();
    // La rejilla del invitado: tarjetas atenuadas (solo lectura) y «Cómo se juega» activo debajo. Página completa desde arriba.
    await capturarTamanos(page, 'lobby-como-se-juega-rejilla', { completa: true });
    await abrir.click();
    const dialogo = page.getByRole('dialog', { name: 'Type Duel' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText('Paso 1 de 3')).toBeVisible();
    const siguiente = dialogo.getByRole('button', { name: 'Siguiente' });
    await expect(siguiente).toBeFocused();
    // El diálogo abierto en el primer paso (crema con `.on-cream`), capturado desde arriba como el de más abajo.
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'dialogo-como-se-juega', { sigue: dialogo });
    await expect(siguiente).toBeFocused();
    // ← → sobre la región y el botón «Siguiente» avanzan; sin reproducción automática.
    await page.keyboard.press('ArrowRight');
    await expect(dialogo.getByText('Paso 2 de 3')).toBeVisible();
    await expect(dialogo.getByText('Paso 1 de 3')).toBeHidden();
    await siguiente.click();
    await expect(dialogo.getByText('Paso 3 de 3')).toBeVisible();
    await expect(dialogo.getByText('Paso 2 de 3')).toBeHidden();
    await expect(dialogo.getByText('El primero que acierte gana 5 puntos')).toBeVisible();
    // Sin bucle: en el último paso «Siguiente» deja paso a «Entendido», que recibe el foco.
    await expect(dialogo.getByRole('button', { name: 'Entendido' })).toBeFocused();
    await expect(siguiente).toHaveCount(0);
    // La página de fondo no se desplaza con el diálogo abierto.
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    // Abrir desplaza la página hasta la tarjeta y la cabecera fija pisaría el lobby de fondo: se captura desde arriba.
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-como-se-juega', { sigue: dialogo });
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(abrir).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('lobby: rotación', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, jugadores } = sala;
    const page = host.page;
    await page.getByRole('tab', { name: 'Modo y sesión' }).click();
    const aleatorio = page.getByRole('button', { name: /^Aleatorio/ });
    await aleatorio.click();
    await expect(aleatorio).toHaveAttribute('aria-pressed', 'true');
    // Búsqueda sin resultados: estado vacío con acción para volver a la lista.
    const buscar = page.getByLabel('Buscar en la rotación');
    await buscar.fill('zzzz');
    await expect(page.getByText('Ningún minijuego coincide con “zzzz”.')).toBeVisible();
    await page.getByRole('button', { name: 'Borrar búsqueda' }).click();
    await expect(buscar).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Juegos de la rotación' }).locator('article').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-rotacion', { completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('higher-lower: revelado y clasificación', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Higher or Lower');
    // Una sola ronda para llegar a la clasificación final.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // Toda imagen que pidan los navegadores durante la partida: ninguna puede llevar el número de Pokédex (la respuesta
    // de la categoría N.º Pokédex) ni la ruta numérica de los sprites de PokéAPI.
    const imagenes: string[] = [];
    for (const { page } of jugadores) page.on('request', (r) => { if (r.resourceType() === 'image') imagenes.push(r.url()); });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));
    const proxy = /^\/api\/pokemon\/[a-z][a-z0-9-]*\/sprite$/;
    const sprites = host.page.locator('[data-hl-card] img');
    await expect(sprites).toHaveCount(2, { timeout: 20_000 });
    for (const src of await sprites.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src))) {
      expect(new URL(src).pathname, 'sprite de Higher or Lower por el proxy').toMatch(proxy);
    }
    await expect.poll(() => imagenes.filter((url) => proxy.test(new URL(url).pathname)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

    // Ronda activa: a 390×844, sin desplazar, lo necesario para responder está a la vista a la vez: las dos cartas, la
    // stat que se compara, el tiempo y las tres respuestas (en la pantalla inferior pegada abajo), sin que esta tape
    // las cartas.
    const mayor = (page: Page) => page.getByRole('button', { name: 'Mayor', exact: true });
    const movil = invitados[1]!.page;
    await expect(mayor(movil)).toBeVisible({ timeout: 20_000 });
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await movil.evaluate(() => window.scrollTo(0, 0));
    for (const nombre of ['Mayor', 'Igual', 'Menor']) await expect(movil.getByRole('button', { name: nombre, exact: true }), `${nombre} a la vista a 390×844`).toBeInViewport({ ratio: 1 });
    const cartas = [movil.locator('[data-hl-card="previous"]'), movil.locator('[data-hl-card="current"]')];
    for (const carta of cartas) await expect(carta, 'carta del duelo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('heading', { level: 1 }), 'stat comparada a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    const inferior = await movil.locator('[data-layer="screen-bottom"]').boundingBox();
    for (const carta of cartas) {
      const caja = await carta.boundingBox();
      expect(caja!.y + caja!.height, 'la pantalla inferior no tapa las cartas a 390×844').toBeLessThanOrEqual(inferior!.y + 1);
    }
    // Las barras solo existen al revelar: antes no hay ningún valor del actual en la página.
    const barras = (page: Page) => page.getByTestId('higher-lower-bars');
    await expect(barras(host.page)).toHaveCount(0);
    await expect(host.page.locator('[data-hl-card="current"]').getByText('???', { exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-higher-lower', { sigue: mayor(host.page), opts: ARCADE });

    // Todos responden: la ronda se revela en cuanto contesta el último y el revelado dura 3 s. Para que quepan los
    // tres tamaños, cada página se fija a un tamaño antes de la última respuesta y se capturan a la vez.
    const capturas = [
      { page: host.page, w: SIZES[0].w, h: SIZES[0].h },
      { page: invitados[0]!.page, w: SIZES[1].w, h: SIZES[1].h },
      { page: movil, w: SIZES[2].w, h: SIZES[2].h },
    ];
    for (const { page, w, h } of capturas) await page.setViewportSize({ width: w, height: h });
    // Cada jugador elige una respuesta distinta: exactamente uno acierta. Un observador anota si a alguien le sale el
    // «+N» (`ScorePop`), que solo dura 400 ms.
    for (const { page } of jugadores) {
      await page.evaluate(() => {
        const w = window as unknown as { scorePopVisto?: boolean };
        w.scorePopVisto = false;
        new MutationObserver(() => { if (document.querySelector('.score-pop')) w.scorePopVisto = true; }).observe(document.body, { childList: true, subtree: true });
      });
    }
    // El anfitrión pulsa «Mayor»; el del móvil responde «Menor» con el atajo 3; el último, «Igual» con el teclado (Tab
    // hasta la píldora y Enter): la píldora se desmonta y el foco pasa al título de la placa, no se queda en el `body`.
    await mayor(host.page).click({ timeout: 20_000 });
    await movil.keyboard.press('3');
    await expect(movil.getByRole('heading', { name: 'Respuesta Menor bloqueada.' })).toBeVisible();
    const ultimo = invitados[0]!.page;
    await ultimo.getByRole('button', { name: 'Igual', exact: true }).focus();
    await ultimo.keyboard.press('Enter');
    await expect(ultimo.locator('[data-layer="screen-bottom"] h2')).toBeFocused();
    for (const { page } of capturas) await page.evaluate(() => window.scrollTo(0, 0));
    const revelado = (page: Page) => page.getByText(/^Respuesta: (Mayor|Igual|Menor)$/);
    for (const { page } of capturas) await expect(barras(page)).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText(/^Clasificación en \ds…$/)).toBeVisible();
    // Movimiento antes de capturar: con la reducción no anima nada; con movimiento, el relleno de la barra crece y la
    // racha del que acierta salta (solo transform).
    const barra = barras(host.page).locator('[data-bar="current"] [role="meter"] > i');
    const racha = host.page.locator('[data-streak].motion-bump');
    await expect(racha, 'solo salta la racha del que acierta').toHaveCount(1);
    expect(await animacionDe(barra), 'barra con reducción de movimiento').toBe('none');
    expect(await animacionDe(racha), 'racha con reducción de movimiento').toBe('none');
    await conMovimiento(host.page);
    expect(await animacionDe(barra), 'barra con movimiento').toMatch(/grow/);
    expect(await animacionDe(racha), 'racha con movimiento').toBe('motion-bump');
    await host.page.emulateMedia({ reducedMotion: 'reduce' });
    // Resultado con texto, no solo con color o glifo: un acierto (con su racha) y dos fallos.
    await expect(host.page.locator('[data-outcome="hit"]')).toHaveCount(1);
    await expect(host.page.locator('[data-outcome="hit"]')).toHaveText(/^✓ \+\d+ acierto$/);
    await expect(host.page.locator('[data-outcome="miss"]')).toHaveText(['✗ Fallo', '✗ Fallo']);
    await expect(host.page.locator('[data-outcome-line]', { hasText: /^Racha 1( · \+\d+ rapidez)?$/ })).toHaveCount(1);
    const nombre = 'juego-higher-lower-revelacion';
    const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, nombre, true, false, ARCADE)));
    for (const { page } of capturas) await expect(revelado(page), 'el revelado sigue en pantalla tras la captura').toBeVisible({ timeout: 500 });
    for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    const vistos = await Promise.all(jugadores.map(({ page }) => page.evaluate(() => (window as unknown as { scorePopVisto?: boolean }).scorePopVisto === true)));
    expect(vistos.filter(Boolean), 'el «+N» sale solo a quien acierta').toHaveLength(1);
    for (const { page } of capturas) await page.setViewportSize({ width: 1280, height: 720 });

    const clasificacion = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower' });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    // Plurales de las estadísticas: nunca «1 aciertos» ni «1 iguales».
    await expect(host.page.getByText(/\d+ aciertos? · \d+ igual(es)? · mejor racha/).first()).toBeVisible();
    await expect(host.page.getByText(/(^|\D)1 (aciertos|iguales)/)).toHaveCount(0);
    await capturarTamanos(host.page, 'juego-higher-lower-clasificacion', { sigue: clasificacion, opts: ARCADE });
    const delatoras = imagenes.filter((url) => /githubusercontent|\/sprites\/pokemon\/|\/\d+\.(png|gif|webp|svg)(\?|$)|\/pokemon\/\d+(\/|$)/.test(url));
    expect(delatoras, 'ninguna imagen de la partida delata el número de Pokédex').toEqual([]);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: elección de los rivales oculta y panel de visibilidad', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // Panel: «Ocultas» por defecto; «Visibles» muestra el aviso de copia. Se captura con el aviso y se vuelve a ocultas.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const ocultas = host.page.getByRole('radio', { name: 'Ocultas', exact: true });
    const visibles = host.page.getByRole('radio', { name: 'Visibles', exact: true });
    await expect(ocultas).toHaveAttribute('aria-checked', 'true');
    const aviso = host.page.getByText('Permite copiar: los demás ven tu elección al momento.');
    await expect(aviso).toHaveCount(0);
    await visibles.click();
    await expect(visibles).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toBeVisible();
    // Desde arriba, como el resto de capturas del lobby: con la página desplazada la cabecera fija solapa las pestañas.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    // Página completa: a 390×844 el grupo «Elecciones de los rivales» queda bajo las generaciones.
    await capturarTamanos(host.page, 'lobby-config-pokedex-distance', { completa: true, opts: { minFontPx: 13 } });
    await ocultas.click();
    await expect(ocultas).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toHaveCount(0);
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));

    // Un invitado elige: él ve su confirmación (estado privado) y el host solo ve que ya ha elegido, nunca el Pokémon.
    const [eligeAntes] = invitados;
    const buscador = eligeAntes!.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await buscador.fill('Pikachu', { timeout: 20_000 });
    // El catálogo del buscador llega por HTTP: se espera a la coincidencia antes de elegirla.
    await eligeAntes!.page.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    const confirmada = eligeAntes!.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ });
    await expect(confirmada).toBeVisible({ timeout: 10_000 });
    // El buscador se desmonta al elegir: el foco va al título de la placa, no se pierde en `body`.
    await expect(confirmada).toBeFocused();
    expect(await eligeAntes!.page.evaluate(() => document.activeElement === document.body)).toBe(false);
    const yaHaElegido = host.page.getByText('✓ Ya ha elegido', { exact: true });
    await expect(yaHaElegido).toHaveCount(1, { timeout: 10_000 });
    await expect(host.page.getByText(/→ Pikachu/)).toHaveCount(0);
    await expect(host.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-oculta', { sigue: yaHaElegido, opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Respuesta del catálogo del buscador (`GET /api/pokemon/selector`): solo id, nombre y sprite opaco. */
const SELECTOR_PATH = '/api/pokemon/selector';
const esSelector = (r: Response) => new URL(r.url()).pathname === SELECTOR_PATH && r.status() === 200;

/** Elige un Pokémon con el buscador de Pokédex Distance (o de cualquier juego con el buscador por defecto). */
async function elegirPokemon(page: Page, nombre: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Buscar Pokémon' }).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/** Capturas de una fase que dura poco: lo que mida `measureLayout` se anota en vez de hacer fallar el test. */
async function capturarAnotando(page: Page, nombre: string, sigue: Locator, sizes: readonly { w: number; h: number }[] = SIZES, opts: CaptureOptions = {}): Promise<void> {
  for (const { w, h } of sizes) {
    await page.setViewportSize({ width: w, height: h });
    const { id, problems } = await layoutProblems(page, nombre, true, false, opts);
    await expect(sigue, `${id}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 });
    if (problems.length) test.info().annotations.push({ type: 'encaje', description: `${id}: ${problems.join(' · ')}` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test('pokedex-distance: recarga a mitad de ronda', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [segundo, tercero] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // 60 s por ronda: caben las dos elecciones, las capturas y la recarga del tercero.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    // Red: el catálogo del buscador no lleva datos de respuesta y nadie pide el antiguo `/api/pokemon`.
    const antiguas: string[] = [];
    for (const { page } of jugadores) page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/pokemon') antiguas.push(r.url()); });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<Record<string, unknown>> };
    expect(catalogo.length, 'entradas del catálogo').toBeGreaterThan(0);
    for (const entrada of catalogo) {
      expect(Object.keys(entrada).sort(), `claves de ${String(entrada.id)}`).toEqual(['id', 'name', 'sprite']);
      expect(String(entrada.sprite), `sprite de ${String(entrada.id)}`).not.toContain('sprites/pokemon/');
    }

    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon' });
    for (const { page } of jugadores) await expect(buscador(page)).toBeVisible({ timeout: 20_000 });
    // Eligen primero los otros dos: al caerse el tercero sería el único que falta y, sin la gracia, la ronda se
    // cerraría en ese momento con él «sin respuesta».
    await elegirPokemon(host.page, 'Pikachu');
    await elegirPokemon(segundo.page, 'Bulbasaur');
    for (const { page } of jugadores) {
      await expect(page.getByText(DISTANCE_PICKED, { exact: true }), 'host y segundo ya han elegido').toHaveCount(2, { timeout: 10_000 });
      await expect(page.getByText(/^→ /), 'ningún rival muestra su Pokémon').toHaveCount(0);
    }
    const enLaRonda = host.page.getByRole('heading', { name: 'En la ronda' });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-ronda-oculta', { sigue: enLaRonda, opts: ARCADE });

    // El tercero recarga: la app le ofrece «Volver a la sala» y vuelve al buscador antes de que venza la gracia de 8 s,
    // con la ronda aún abierta.
    const inicio = Date.now();
    await tercero.page.reload();
    await tercero.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(buscador(tercero.page)).toBeVisible({ timeout: 8_000 });
    expect(Date.now() - inicio, 'vuelta al buscador tras recargar (ms)').toBeLessThan(8_000);
    await expect(tercero.page.getByText('Estás observando')).toHaveCount(0);
    await expect(host.page.getByText('Resultado de la ronda')).toHaveCount(0);
    await expect(enLaRonda).toBeVisible();
    await expect(tercero.page.getByText(DISTANCE_PICKED, { exact: true })).toHaveCount(2);
    // Contador junto a «Ronda N»: sale de `selectedIds`, así que dice cuántos han elegido y nunca qué.
    await expect(tercero.page.getByText('2 de 3 han elegido', { exact: true })).toBeVisible();
    await elegirPokemon(tercero.page, 'Charmander');

    await expect(host.page.getByText('Resultado de la ronda')).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByRole('heading', { name: '⏱️ Tiempo agotado' })).toHaveCount(0);
    const tarjeta = host.page.getByRole('list', { name: 'Distancias de la ronda' }).getByRole('listitem').filter({ hasText: tercero.name });
    await expect(tarjeta).toContainText('Charmander');
    await expect(tarjeta).not.toContainText('Sin respuesta');
    // Revelación: regla con el objetivo en el centro y un marcador por jugador (6 s en pantalla). La suite fija la
    // reducción de movimiento: los marcadores no animan; sin ella entran con `motion-enter-up`. Se vuelve a reducir
    // antes de capturar, porque reactivarla reinicia la entrada (opacidad 0) y la captura la mediría a medias.
    const regla = host.page.getByTestId('distance-ruler');
    await expect(regla).toBeVisible();
    const marcadores = regla.getByTestId('distance-ruler-marker');
    await expect(marcadores).toHaveCount(3);
    await expect(regla.getByText(new RegExp(`^${tercero.name}: #004, (a \\d+|acierto exacto)`))).toHaveCount(1);
    expect(await animacionDe(marcadores.first()), 'marcador con reducción de movimiento').toBe('none');
    await conMovimiento(host.page);
    expect(await animacionDe(marcadores.first()), 'marcador con movimiento').toBe('motion-enter-up');
    await host.page.emulateMedia({ reducedMotion: 'reduce' });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-revelacion', { sigue: regla, opts: ARCADE });
    expect(antiguas, 'peticiones a /api/pokemon').toEqual([]);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: acierto exacto con cut-in', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // 60 s por ronda: el reloj del host se detiene, pero el plazo del servidor sigue y el invitado no elige; así la
    // ronda no cierra (y se lleva la banda) mientras se capturan los tres tamaños.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // Reloj controlado en el host: la banda dura 1,6 s y se detiene el tiempo mientras se captura.
    await host.page.clock.install();
    await iniciarPartida(host.page, [invitado.page]);
    await saltarIntro(jugadores.map((j) => j.page));

    // El objetivo es público («Objetivo #N»): el host elige el Pokémon de ese número (forma por defecto, de la BD local).
    const objetivo = host.page.getByRole('heading', { name: /^Objetivo/ });
    await expect(host.page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeVisible({ timeout: 20_000 });
    const numero = Number((await objetivo.innerText()).replace(/\D/g, ''));
    expect(numero, 'número del objetivo').toBeGreaterThan(0);
    const exacto = psql(`SELECT name FROM "Pokemon" WHERE "nationalDexNumber" = :'n'::int AND "isDefault" ORDER BY id LIMIT 1;`, { n: String(numero) });
    expect(exacto, `Pokémon #${numero} en la BD`).not.toBe('');
    await elegirPokemon(host.page, exacto);

    const banda = host.page.locator('.reveal-cut-in[role="status"]');
    await expect(banda).toContainText('¡Acierto exacto!', { timeout: 5_000 });
    // Se detiene un poco por delante del reloj de la página (detenerlo en el pasado falla) y se captura a los tres
    // tamaños con la banda quieta.
    await host.page.clock.pauseAt(await host.page.evaluate(() => Date.now() + 100));
    try {
      await expect(banda).toContainText(`#${String(numero).padStart(3, '0')}`);
      await host.page.evaluate(() => window.scrollTo(0, 0));
      await capturarTamanos(host.page, 'juego-pokedex-distance-acierto-exacto', { sigue: banda, opts: ARCADE });
    } finally {
      await host.page.clock.resume();
    }
    // Sin el reloj detenido, la banda se va sola.
    await expect(banda).toBeHidden({ timeout: 5_000 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: buscador sin coincidencias', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // 60 s por ronda: caben las capturas a los tres tamaños.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // El invitado no recibe el catálogo hasta que se levanta el bloqueo (en desarrollo, StrictMode lo pide dos veces):
    // ve el error con «Reintentar» y, al pulsarlo, el buscador funciona.
    let bloqueado = true;
    await invitado.page.route((url) => url.pathname === SELECTOR_PATH, async (route) => {
      if (bloqueado) await route.abort('connectionrefused');
      else await route.fallback();
    });
    await iniciarPartida(host.page, [invitado.page]);
    await saltarIntro([host.page, invitado.page]);

    const buscador = host.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(buscador).toBeVisible({ timeout: 20_000 });
    // Autofoco sin desplazar la página: la cabecera fija no tapa nada.
    await expect(buscador).toBeFocused();
    expect(await host.page.evaluate(() => window.scrollY), 'desplazamiento tras el autofoco').toBe(0);
    await buscador.fill('zzzz');
    const vacio = host.page.getByText('Ningún Pokémon coincide con “zzzz”.');
    await expect(vacio).toBeVisible({ timeout: 10_000 });
    const borrar = host.page.getByRole('button', { name: 'Borrar búsqueda' });
    await expect(borrar).toBeVisible();
    await capturarTamanos(host.page, 'juego-buscador-vacio', { sigue: vacio, opts: ARCADE });
    await borrar.click();
    await expect(buscador).toHaveValue('');
    await expect(buscador).toBeFocused();
    await expect(vacio).toHaveCount(0);

    const alerta = invitado.page.getByRole('alert').filter({ hasText: 'No se pudo cargar el buscador de Pokémon.' });
    await expect(alerta).toBeVisible({ timeout: 20_000 });
    await capturarTamanos(invitado.page, 'juego-buscador-error', { sigue: alerta, opts: ARCADE });
    bloqueado = false;
    await alerta.getByRole('button', { name: 'Reintentar' }).click();
    await expect(alerta).toHaveCount(0, { timeout: 10_000 });
    await elegirPokemon(invitado.page, 'Pikachu');
    await expect(invitado.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ })).toBeVisible({ timeout: 10_000 });
    expect(host.errors, host.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

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

    const cargando = invitado.page.getByRole('status').filter({ hasText: 'Cargando Pokémon…' });
    await expect(cargando).toBeVisible({ timeout: 20_000 });
    await expect(cargando).toHaveAttribute('aria-busy', 'true');
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

test('pokedex-distance: empate forzado tras tres desempates', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    await iniciarPartida(host.page, [invitado.page]);
    await saltarIntro([host.page, invitado.page]);
    // Con las elecciones ocultas no hay bloqueo: los dos eligen el mismo Pokémon, siempre a la misma distancia.
    // Ronda inicial y tres desempates; en el tercero cae quien eligió el último (el invitado).
    const titulo = (texto: string) => host.page.getByRole('heading', { name: texto });
    for (let ronda = 0; ronda < 4; ronda++) {
      for (const { page } of jugadores) await expect(page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeVisible({ timeout: 20_000 });
      await elegirPokemon(host.page, 'Pikachu');
      await expect(invitado.page.getByText(DISTANCE_PICKED, { exact: true })).toHaveCount(1, { timeout: 10_000 });
      await elegirPokemon(invitado.page, 'Pikachu');
      if (ronda < 3) await expect(titulo('⚔️ Empate en la peor distancia')).toBeVisible({ timeout: 15_000 });
    }
    const forzado = titulo('⚔️ Empate tras 3 desempates');
    await expect(forzado).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText('Cae quien eligió último; si eligieron a la vez, caen todos.')).toBeVisible();
    await expect(host.page.getByRole('list', { name: 'Distancias de la ronda' }).getByRole('listitem').filter({ hasText: invitado.name })).toContainText('Eliminado');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarAnotando(host.page, 'juego-pokedex-distance-empate-forzado', forzado, SIZES, ARCADE);

    // Resultados propios: clasificación con la ronda de caída, mejor acierto y distancia por ronda (R1 y sus tres
    // desempates), sin NaN ni scroll horizontal de la página aunque la tabla tenga muchas columnas.
    await expect(titulo('Resultado de la partida')).toBeVisible({ timeout: 15_000 });
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion.getByRole('listitem').filter({ hasText: host.name })).toContainText('Ganador');
    await expect(clasificacion.getByRole('listitem').filter({ hasText: invitado.name })).toContainText('Cayó en la ronda 1');
    await expect(clasificacion.getByRole('listitem').filter({ hasText: host.name })).toContainText('1 desempate superado');
    await expect(host.page.getByRole('heading', { name: 'Mejor acierto' })).toBeVisible();
    const tabla = host.page.getByRole('table');
    await expect(tabla.getByRole('columnheader')).toHaveText(['Entrenador', 'R1', 'R1 · D1', 'R1 · D2', 'R1 · D3']);
    await expect(tabla.getByRole('row').filter({ hasText: invitado.name }).getByRole('cell').last()).toContainText('✗');
    await expect(host.page.getByText(/NaN|Infinity|ronda 0/)).toHaveCount(0);
    await host.page.setViewportSize({ width: 390, height: 844 });
    expect(await host.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal de la página a 390').toBe(true);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-resultados', { sigue: tabla, completa: true, opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

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
    await capturarTamanos(host.page, 'lobby-config-shiny-vote', { completa: true, opts: { minFontPx: 13 } });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, [invitado.page]);
    await saltarIntro([host.page, invitado.page]);
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
    await capturarTamanos(invitado.page, 'juego-shiny-vote-votos-al-revelar', { sigue: invitado.page.getByRole('button', { name: 'Confirmar voto' }), opts: ARCADE });
    // El host, con el voto ya bloqueado: cartas fijas y su elección en la pantalla inferior.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-shiny-vote-voto-confirmado', { sigue: host.page.getByText('Voto confirmado:'), opts: ARCADE });

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
    await capturarTamanos(invitado.page, 'juego-shiny-vote-revelacion', { sigue: franja(invitado.page), completa: true, opts: ARCADE });

    // Una sola ronda: llegan los resultados con la clasificación del catálogo.
    for (const { page } of jugadores) await expect(page.getByRole('heading', { name: 'Clasificación shiny' })).toBeVisible({ timeout: 15_000 });
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion.getByRole('listitem')).toHaveCount(2);
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-shiny-vote-resultados', { sigue: clasificacion, completa: true, opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('higher-lower: panel de visibilidad', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, jugadores } = sala;
    const page = host.page;
    await seleccionarJuego(page, 'Higher or Lower');
    await page.getByRole('tab', { name: 'Configuración' }).click();
    const alRevelar = page.getByRole('radio', { name: 'Al revelar', exact: true });
    const enDirecto = page.getByRole('radio', { name: 'En directo', exact: true });
    const aviso = page.getByText('Permite copiar: los demás ven tu elección al momento.');
    await expect(alRevelar).toHaveAttribute('aria-checked', 'true');
    await expect(enDirecto).toHaveAttribute('aria-checked', 'false');
    await expect(aviso).toHaveCount(0);
    // El grupo de visibilidad queda bajo las categorías y la dificultad: captura de página completa desde arriba (con la
    // página desplazada, la cabecera fija taparía las categorías y el medidor lo cuenta como solape).
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-config-higher-lower', { completa: true });

    await enDirecto.click();
    await expect(enDirecto).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toBeVisible();
    // El aviso de copia a 390×844, donde el texto se parte en varias líneas.
    await page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await enDirecto.blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    const { id, problems } = await layoutProblems(page, 'lobby-config-higher-lower-en-directo', true, true);
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await alRevelar.click();
    await expect(aviso).toHaveCount(0);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

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
    await saltarIntro([host.page, invitado.page]);
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
    await capturarAnotando(invitado.page, 'juego-learnset-guess-ultimo-aviso', chip, [SIZES[2]], ARCADE);
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
    await saltarIntro(jugadores.map((j) => j.page));
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
    await capturarTamanos(primero.page, 'juego-learnset-guess-pistas', { sigue: enJuego, opts: ARCADE });
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
    await capturarTamanos(primero.page, 'juego-learnset-guess-busqueda', { sigue: primerResultado, opts: ARCADE });
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
    await capturarAnotando(host.page, 'juego-learnset-guess-revelacion', era, SIZES, ARCADE);

    // Clasificación de la partida (una ronda).
    await expect(host.page.getByRole('heading', { name: 'Clasificación Learnset Guess' })).toBeVisible({ timeout: 15_000 });
    await capturarTamanos(host.page, 'juego-learnset-guess-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * La respuesta de ¿Quién es ese Pokémon? no está en el cliente: se deduce de la silueta. En la página (mismo origen)
 * se recorta la silueta y el sprite de cada candidato del buscador a su caja opaca, se encajan en una rejilla de 32×32 y
 * gana el de menos casillas distintas (la silueta del servidor es el mismo sprite recortado, encajado y en negro).
 */
async function siluetaMasParecida(page: Page, sombra: string, candidatos: ReadonlyArray<{ name: string; sprite: string }>): Promise<{ mejor: string; peor: string; distancias: number[] }> {
  return page.evaluate(async ({ sombra, candidatos }) => {
    const N = 32;
    const rejilla = async (url: string): Promise<Uint8Array | null> => {
      for (let intento = 0; intento < 5; intento++) {
        const respuesta = await fetch(url, { credentials: 'include' }).catch(() => null);
        if (respuesta?.ok) {
          const imagen = await createImageBitmap(await respuesta.blob());
          const lienzo = new OffscreenCanvas(imagen.width, imagen.height);
          const ctx = lienzo.getContext('2d')!;
          ctx.drawImage(imagen, 0, 0);
          const { data } = ctx.getImageData(0, 0, imagen.width, imagen.height);
          let x0 = imagen.width, y0 = imagen.height, x1 = -1, y1 = -1;
          for (let y = 0; y < imagen.height; y++) for (let x = 0; x < imagen.width; x++) {
            if (data[(y * imagen.width + x) * 4 + 3]! > 32) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          }
          if (x1 < 0) return null;
          const w = x1 - x0 + 1, h = y1 - y0 + 1, escala = N / Math.max(w, h);
          const caja = new OffscreenCanvas(N, N);
          const cctx = caja.getContext('2d')!;
          cctx.drawImage(imagen, x0, y0, w, h, (N - w * escala) / 2, (N - h * escala) / 2, w * escala, h * escala);
          const celdas = cctx.getImageData(0, 0, N, N).data;
          const salida = new Uint8Array(N * N);
          for (let i = 0; i < N * N; i++) salida[i] = celdas[i * 4 + 3]! > 96 ? 1 : 0;
          return salida;
        }
        await new Promise((listo) => setTimeout(listo, 250 * (intento + 1)));
      }
      return null;
    };
    const objetivo = await rejilla(sombra);
    if (!objetivo) throw new Error('No se pudo leer la silueta');
    const puntuados: Array<{ name: string; distancia: number }> = [];
    for (let inicio = 0; inicio < candidatos.length; inicio += 8) {
      const lote = candidatos.slice(inicio, inicio + 8);
      const rejillas = await Promise.all(lote.map((candidato) => rejilla(candidato.sprite)));
      rejillas.forEach((celdas, indice) => {
        if (!celdas) return;
        let distancia = 0;
        for (let i = 0; i < celdas.length; i++) if (celdas[i] !== objetivo[i]) distancia++;
        puntuados.push({ name: lote[indice]!.name, distancia });
      });
    }
    puntuados.sort((a, b) => a.distancia - b.distancia);
    return { mejor: puntuados[0]!.name, peor: puntuados.at(-1)!.name, distancias: puntuados.slice(0, 3).map((p) => p.distancia) };
  }, { sombra, candidatos });
}

/**
 * Buscador de respuesta de los juegos de adivinar: su etiqueta lleva la ronda, la paleta o el grito («Buscar respuesta
 * para la ronda 3», «… para la paleta 1», «… para el grito 2»). `elegirPokemon` usa el de «Buscar Pokémon».
 */
const BUSCADOR_RESPUESTA = /^Buscar respuesta para (la|el) (ronda|paleta|grito) \d+$/;
const buscadorRespuesta = (page: Page) => page.getByRole('textbox', { name: BUSCADOR_RESPUESTA });

/** Elige un Pokémon con el buscador de respuesta de un juego de adivinar. */
async function adivinar(page: Page, nombre: string): Promise<void> {
  await buscadorRespuesta(page).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/**
 * Prueba los candidatos por orden hasta que la placa diga `titulo` («¡Acertado!»); cada fallo espera su enfriamiento
 * (1 s). Devuelve el que acertó, o '' si ninguno (el `expect` de quien llama lo dice).
 */
async function acertarEnOrden(page: Page, candidatos: readonly string[], titulo: string): Promise<string> {
  const acertado = page.getByRole('heading', { name: titulo });
  for (const nombre of candidatos) {
    await expect(page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await adivinar(page, nombre);
    const ok = await Promise.race([
      acertado.waitFor({ timeout: 5_000 }).then(() => true, () => false),
      page.getByTestId('guess-cooldown').waitFor({ timeout: 5_000 }).then(() => false, () => false),
    ]);
    if (ok || await acertado.isVisible()) return nombre;
  }
  return '';
}

test('whos-that-pokemon: una ronda con un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, '¿Quién es ese Pokémon?');
    // Una ronda (para llegar a la clasificación), 60 s (el máximo), solo la Gen 1 sin formas regionales (para deducir la silueta) y con pistas.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const formas = host.page.getByRole('switch', { name: 'Formas regionales' });
    await formas.click();
    await expect(formas).toHaveAttribute('aria-checked', 'false');
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

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    const sombra = host.page.waitForResponse((r) => /\/options\/shadow\/sprite$/.test(new URL(r.url()).pathname) && r.status() === 200, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string; sprite: string }> };
    const silueta = host.page.getByRole('img', { name: 'Silueta de un Pokémon misterioso' });
    await expect(silueta).toBeVisible({ timeout: 20_000 });
    const buscador = buscadorRespuesta;
    await expect(buscador(host.page)).toBeVisible();

    // La respuesta no está en el DOM: solo la silueta opaca, sin nombre en `alt` ni `title`.
    const deduccion = await siluetaMasParecida(host.page, new URL((await sombra).url()).pathname, catalogo);
    test.info().annotations.push({ type: 'silueta', description: `${deduccion.mejor} (distancias ${deduccion.distancias.join(', ')} de ${catalogo.length})` });
    await expect(host.page.locator('main')).not.toContainText(deduccion.mejor);
    expect(await host.page.locator(`main [alt="${deduccion.mejor}"], main [title="${deduccion.mejor}"]`).count()).toBe(0);

    // Marcador: una fila por jugador; los intentos vacíos enseñan a jugar.
    await expect(host.page.getByTestId('guess-score-row')).toHaveCount(3);
    await expect(host.page.getByText('Todavía no hay intentos incorrectos.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-whos-that-pokemon-pista', { sigue: silueta, opts: ARCADE });
    // A 390×844, sin desplazar: la silueta y el buscador a la vista.
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(silueta).toBeInViewport({ ratio: 1 });
    await expect(buscador(host.page)).toBeInViewport({ ratio: 1 });
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Un fallo: el aviso de la espera se ve, la región viva lo dice una vez y los demás ven el intento.
    await adivinar(host.page, deduccion.peor === deduccion.mejor ? 'Pikachu' : deduccion.peor);
    await expect(host.page.getByTestId('guess-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: /^Incorrecto \(1 intento\)/ })).toHaveCount(1);
    await expect(primero.page.getByTestId('guess-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(host.page.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(host.page.getByText(/ no era$/)).toBeVisible();
    // Buscando (la bandeja abierta): a 390×844 el primer resultado y la silueta siguen a la vista.
    await buscador(host.page).fill('a');
    const primerResultado = host.page.locator('.pokemon-selector-results button').first();
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await expect(primerResultado).toBeInViewport({ ratio: 1 });
    await expect(silueta).toBeInViewport();
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await buscador(host.page).blur();
    await capturarTamanos(host.page, 'juego-whos-that-pokemon-busqueda', { sigue: primerResultado, opts: ARCADE });
    await buscador(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    await adivinar(host.page, deduccion.mejor);
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-whos-that-pokemon-acertado', { sigue: acertado, opts: ARCADE });
    await capturarTamanos(primero.page, 'juego-whos-that-pokemon-marcador', { sigue: buscador(primero.page), opts: ARCADE });

    // El segundo también acierta y el tercero se va: la revelación lo dice en texto («No acertó», «Sin conexión»).
    // Lo que queda de ronda antes del segundo acierto: si se acerca a 0, el test va justo de tiempo.
    test.info().annotations.push({ type: 'tiempo', description: `quedan ${await primero.page.getByRole('timer').first().innerText()} s antes del acierto del segundo` });
    await adivinar(primero.page, deduccion.mejor);
    await expect(primero.page.getByRole('heading', { name: '¡Acertado!' })).toBeVisible({ timeout: 5_000 });
    await segundo.context.close();
    const era = host.page.getByRole('heading', { name: `¡Era ${deduccion.mejor}!`, level: 1 });
    await expect(era).toBeVisible({ timeout: 65_000 });
    const filas = host.page.getByTestId('guess-reveal-row');
    await expect(filas).toHaveCount(3);
    await expect(filas.first()).toContainText(host.name);
    await expect(filas.filter({ hasText: segundo.name })).toContainText('No acertó');
    // La carta de la respuesta carga con prioridad (`Card eager`): se captura con el sprite ya descodificado.
    await expect.poll(() => host.page.locator('[data-answer-card] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3_000 }).toBe(true);
    // La revelación dura 4 s: lo que mida el medidor se anota.
    await capturarAnotando(host.page, 'juego-whos-that-pokemon-revelacion', era, SIZES, ARCADE);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-whos-that-pokemon-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Busca en una trama del `/ws` el estado público del juego dado: el primer objeto con ese `gameId`, `phase` y
 * `roundNumber` (así no se confunde con otro objeto que solo nombre el juego, como el juego elegido de la sala).
 */
function juegoEnTrama<T>(payload: string | Buffer, gameId: string): T | null {
  let frame: unknown;
  try { frame = JSON.parse(String(payload)); } catch { return null; }
  const pendientes: unknown[] = [frame];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (!actual || typeof actual !== 'object') continue;
    if ((actual as { gameId?: unknown }).gameId === gameId && 'phase' in actual && 'roundNumber' in actual) return actual as T;
    pendientes.push(...Object.values(actual));
  }
  return null;
}

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

/** Espera a que se desmonte el «+N» (`ScorePop`, 400 ms) del ganador: mientras sube, pisa la línea de métricas. */
async function sinScorePop(page: Page): Promise<void> {
  await expect(page.getByTestId('score-pop')).toHaveCount(0, { timeout: 3_000 });
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
    await saltarIntro(jugadores.map((j) => j.page));
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
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-pista', { sigue: recorte, opts: ARCADE });
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
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-busqueda', { sigue: primerResultado, opts: ARCADE });
    await buscador(host.page).fill('');

    // El acierto: se prueban los candidatos por orden (casi siempre basta el primero; cada fallo espera 1 s).
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    const respuesta = await acertarEnOrden(host.page, candidatos, '¡Acertado!');
    test.info().annotations.push({ type: 'zoomed', description: `respuesta ${respuesta} (puesto ${candidatos.indexOf(respuesta) + 1} de ${candidatos.length})` });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-acertado', { sigue: acertado, opts: ARCADE });
    await capturarTamanos(primero.page, 'juego-zoomed-pokemon-marcador', { sigue: buscador(primero.page), opts: ARCADE });

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
    await capturarAnotando(host.page, 'juego-zoomed-pokemon-revelacion', era, SIZES, ARCADE);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-zoomed-pokemon-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

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
    await saltarIntro(jugadores.map((j) => j.page));
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
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-pista', { sigue: barra, opts: ARCADE });
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
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-busqueda', { sigue: primerResultado, opts: ARCADE });
    await buscador(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    const respuesta = await acertarEnOrden(host.page, candidatos, '¡Paleta acertada!');
    const acertado = host.page.getByRole('heading', { name: '¡Paleta acertada!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-acertado', { sigue: acertado, opts: ARCADE });
    await capturarTamanos(primero.page, 'juego-pokemon-palette-guess-marcador', { sigue: buscador(primero.page), opts: ARCADE });

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
    await capturarAnotando(host.page, 'juego-pokemon-palette-guess-revelacion', era, SIZES, ARCADE);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-palette-guess-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Texto, `alt` y `title` de `main`: lo que vería quien busca la respuesta en el DOM. */
async function textoDeMain(page: Page): Promise<string> {
  return page.locator('main').evaluate((main) => [(main as HTMLElement).innerText, ...[...main.querySelectorAll('[alt], [title]')].map((el) => `${el.getAttribute('alt') ?? ''} ${el.getAttribute('title') ?? ''}`)].join('\n'));
}

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
    await saltarIntro(jugadores.map((j) => j.page));
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

    await capturarTamanos(primero.page, 'juego-pokemon-cry-quiz-pista', { sigue: primero.page.getByRole('region', { name: 'Grito del Pokémon misterioso' }), opts: ARCADE });
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
      await capturarTamanos(host.page, 'juego-pokemon-cry-quiz-busqueda', { sigue: primerResultado, opts: ARCADE });
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
    await capturarAnotando(host.page, 'juego-pokemon-cry-quiz-revelacion', era, SIZES, ARCADE);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-cry-quiz-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
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
    await saltarIntro(jugadores.map((j) => j.page));
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
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-pista', { sigue: entrada, opts: ARCADE });
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
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-busqueda', { sigue: primerResultado, opts: ARCADE });
    await buscadorRespuesta(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    const respuesta = await acertarEnOrden(host.page, candidatos, '¡Acertado!');
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-acertado', { sigue: acertado, opts: ARCADE });
    await capturarTamanos(primero.page, 'juego-pokedex-entry-guess-marcador', { sigue: buscadorRespuesta(primero.page), opts: ARCADE });

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
    await capturarAnotando(host.page, 'juego-pokedex-entry-guess-revelacion', era, SIZES, ARCADE);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokedex-entry-guess-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

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
    await saltarIntro(jugadores.map((j) => j.page));
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
    await capturarTamanos(host.page, 'juego-guess-from-stats-pista', { sigue: filasStats.first(), opts: ARCADE });
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
    await capturarTamanos(host.page, 'juego-guess-from-stats-busqueda', { sigue: primerResultado, opts: ARCADE });
    await buscadorRespuesta(host.page).fill('');

    // El acierto: la placa lo dice con el puesto y los puntos, y el foco va a su título (no cae al body).
    const respuesta = await acertarEnOrden(host.page, candidatos.slice(0, 1), '¡Acertado!');
    const acertado = host.page.getByRole('heading', { name: '¡Acertado!' });
    await expect(acertado).toBeVisible({ timeout: 5_000 });
    await expect(acertado).toBeFocused();
    await expect(host.page.getByText('1.º en acertar', { exact: true })).toBeVisible();
    await expect(primero.page.getByTestId('guess-score-row').first()).toContainText('Acertó · 1.º');
    await capturarTamanos(host.page, 'juego-guess-from-stats-acertado', { sigue: acertado, opts: ARCADE });
    await capturarTamanos(primero.page, 'juego-guess-from-stats-marcador', { sigue: buscadorRespuesta(primero.page), opts: ARCADE });

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
    await capturarAnotando(host.page, 'juego-guess-from-stats-revelacion', era, SIZES, ARCADE);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-guess-from-stats-clasificacion', { opts: ARCADE });
    for (const jugador of [host, primero]) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Lo que el test lee del estado público de Pokédle Race. */
interface PokeddleVisible {
  phase: string;
  roundNumber: number;
  boards: Record<string, {
    rows: Array<{ round: number; status: string; guessedPokemon: { id: string; name: string } | null; correct: boolean; feedback: Record<string, { kind: string; value: unknown; result: string }> | null }>;
    solved: boolean;
    revealedPokemon: { id: string; name: string } | null;
  }>;
}

/** Datos de un Pokémon del pool de Pokédle (Gen 1 con altura, peso y etapa evolutiva, como filtra el motor). */
interface FichaPokeddle { id: string; generation: number; dexNumber: number; types: string[]; hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number; baseStatTotal: number; height: number; weight: number; evolutionStage: number }

function fichasPokeddle(ids: readonly string[]): FichaPokeddle[] {
  const filas = psql(
    `SELECT id, generation, "nationalDexNumber", array_to_string(types, ','), hp, attack, defense, "specialAttack", "specialDefense", speed, "baseStatTotal", "heightDecimeters", "weightHectograms", "evolutionStage"
     FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) AND "heightDecimeters" > 0 AND "weightHectograms" > 0 AND "evolutionStage" IS NOT NULL AND "evolutionStages" IS NOT NULL
     ORDER BY "nationalDexNumber", id;`,
    { ids: ids.join(',') },
  );
  return filas.split('\n').filter(Boolean).map((fila) => {
    const [id, generation, dexNumber, types, ...numeros] = fila.split('|') as [string, string, string, string, ...string[]];
    const [hp, attack, defense, specialAttack, specialDefense, speed, baseStatTotal, height, weight, evolutionStage] = numeros.map(Number) as number[];
    return { id, generation: Number(generation), dexNumber: Number(dexNumber), types: types.split(',').filter(Boolean), hp: hp!, attack: attack!, defense: defense!, specialAttack: specialAttack!, specialDefense: specialDefense!, speed: speed!, baseStatTotal: baseStatTotal!, height: height!, weight: weight!, evolutionStage: evolutionStage! };
  });
}

/** Como el motor (`rules.ts`): `HIGHER` si el secreto es mayor que el intento. */
const compararPokeddle = (intento: number, secreto: number) => (secreto > intento ? 'HIGHER' : secreto < intento ? 'LOWER' : 'MATCH');

/** ¿Pudo ser `ficha` el secreto, dadas las pistas de las filas ya cerradas? */
function encajaPokeddle(ficha: FichaPokeddle, filas: PokeddleVisible['boards'][string]['rows']): boolean {
  return filas.every((fila) => {
    if (fila.status !== 'GUESS' || !fila.feedback) return true;
    if (!fila.correct && fila.guessedPokemon?.id === ficha.id) return false;
    return Object.entries(fila.feedback).every(([clave, pista]) => {
      if (pista.kind === 'TYPES') {
        const intento = new Set(pista.value as string[]); const secreto = new Set(ficha.types);
        const resultado = intento.size === secreto.size && [...intento].every((tipo) => secreto.has(tipo)) ? 'EXACT' : [...intento].some((tipo) => secreto.has(tipo)) ? 'PARTIAL' : 'NONE';
        return resultado === pista.result;
      }
      if (pista.kind === 'EVOLUTION') return compararPokeddle((pista.value as { stage: number }).stage, ficha.evolutionStage) === pista.result;
      if (pista.kind !== 'NUMERIC') return true;
      const valor = clave === 'typeCount' ? ficha.types.length : (ficha as unknown as Record<string, number>)[clave];
      return valor === undefined || compararPokeddle(pista.value as number, valor) === pista.result;
    });
  });
}

/**
 * Pokédle Race sin red ni respuesta conocida: tres rondas de 30 s (Gen 1, las pistas por defecto). En cada una el host
 * prueba el candidato central (por número de Pokédex) entre los Pokémon del pool que encajan con las pistas ya
 * recibidas, buscados en la BD: las dos primeras son intentos normales y la tercera suele acertar (no se exige: si no,
 * la partida termina igual al agotar las rondas). Los invitados responden algo cada ronda para que se cierre en el acto.
 * Capturas: el tablero con intentos, la ronda cerrada (una por ronda y tamaño: dura 3 s) y la clasificación.
 */
test('pokeddle-race: tres rondas con intentos, las pistas de cada ronda y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédle Race');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    for (const [nombre, teclas, valor] of [['Máximo de rondas', ['Home', 'ArrowRight', 'ArrowRight'], '3'], ['Tiempo por ronda', ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'], '30']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await expect(host.page.getByRole('switch', { name: 'Altura' })).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    let estado: PokeddleVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = juegoEnTrama<PokeddleVisible>(payload, 'pokeddle-race') ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    const fichas = fichasPokeddle(catalogo.map((p) => p.id));
    expect(fichas.length, 'Pokémon de la Gen 1 con datos completos').toBeGreaterThan(50);
    const relleno = [nombres.get(fichas[0]!.id)!, nombres.get(fichas[1]!.id)!];

    const tablero = host.page.getByRole('region', { name: 'Tablero de intentos' });
    await expect(buscadorRespuesta(host.page)).toBeVisible({ timeout: 20_000 });
    // El vacío enseña a jugar; la carrera es una franja por jugador.
    await expect(host.page.getByText('Tu primer intento aparecerá aquí.')).toBeVisible();
    await expect(host.page.getByRole('list', { name: 'Cómo leer el tablero' })).toBeVisible();
    await expect(host.page.getByTestId('pokeddle-race-row')).toHaveCount(3);

    /** Cada invitado sin resolver responde su relleno en la ronda; devuelve cuántos respondieron. */
    const rellenarRonda = async (ronda: number): Promise<number> => {
      let enviados = 0;
      for (const [index, invitado] of [primero, segundo].entries()) {
        const buscador = invitado.page.getByRole('textbox', { name: `Buscar respuesta para la ronda ${ronda}` });
        const encontrado = invitado.page.getByRole('heading', { name: '¡Pokémon encontrado!' });
        await expect(buscador.or(encontrado).first()).toBeVisible({ timeout: 20_000 });
        if (!await buscador.isVisible()) continue;
        await adivinar(invitado.page, relleno[index]!);
        await expect(invitado.page.getByRole('heading', { name: `${relleno[index]} enviado` }).or(invitado.page.getByRole('heading', { name: /^Pistas de la ronda|^Clasificación final$/ })).first()).toBeVisible({ timeout: 5_000 });
        enviados += 1;
      }
      return enviados;
    };
    let hostId = '';
    const probados: string[] = [];
    const textos: string[] = [];
    let resuelto = false;
    for (const ronda of [1, 2, 3]) {
      if (resuelto) {
        // El host ya lo encontró: solo responden los invitados (que no lo hayan resuelto) para cerrar las rondas.
        await rellenarRonda(ronda);
        continue;
      }
      await expect(buscadorRespuesta(host.page)).toHaveAccessibleName(`Buscar respuesta para la ronda ${ronda}`, { timeout: 20_000 });
      const filas = hostId ? (estado as PokeddleVisible | null)?.boards[hostId]?.rows ?? [] : [];
      const encajan = fichas.filter((ficha) => encajaPokeddle(ficha, filas));
      expect(encajan.length, `ronda ${ronda}: ningún Pokémon encaja con las pistas`).toBeGreaterThan(0);
      // Ronda 2: un fallo seguro (no encaja con las pistas de la 1), así siempre se llega a la 3 con dos intentos; en la 1 y
      // la 3, el candidato central de los que encajan (en la 1, todo el pool: acertar es cuestión de suerte y se anota).
      const fallo = fichas.find((ficha) => !encajaPokeddle(ficha, filas) && !probados.includes(nombres.get(ficha.id)!) && !relleno.includes(nombres.get(ficha.id)!));
      const intento = ronda === 2 && fallo ? nombres.get(fallo.id)! : nombres.get(encajan[Math.floor(encajan.length / 2)]!.id)!;
      test.info().annotations.push({ type: 'pokeddle', description: `ronda ${ronda}: ${encajan.length} encajan → ${intento}` });

      // Los invitados responden primero: el host ve «Intento enviado» en sus franjas.
      const enviados = await rellenarRonda(ronda);
      await expect(host.page.getByTestId('pokeddle-race-row').filter({ hasText: 'Intento enviado' })).toHaveCount(enviados, { timeout: 5_000 });
      textos.push(await textoDeMain(host.page));

      if (ronda === 3) {
        // El tablero con dos intentos: capturas a los tres tamaños y, a 390×844, el último intento y el buscador a la vista.
        await expect(host.page.getByTestId('pokeddle-row')).toHaveCount(2);
        await capturarTamanos(host.page, 'juego-pokeddle-race-tablero', { sigue: buscadorRespuesta(host.page), opts: ARCADE });
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        const ultimo = host.page.locator('[data-testid="pokeddle-row"][data-latest="true"]');
        await expect(ultimo).toBeInViewport({ ratio: 1 });
        await expect(buscadorRespuesta(host.page)).toBeInViewport({ ratio: 1 });
        // Nada lo tapa (la pantalla inferior va pegada al fondo): el pie del último intento es suyo.
        expect(await ultimo.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 4)); })).toBe(true);
        // Buscando (la bandeja abierta): el primer resultado y el último intento (su Pokémon y la primera línea de pistas) a la vista.
        await buscadorRespuesta(host.page).fill('a');
        const primerResultado = host.page.locator('.pokemon-selector-results button').first();
        await expect(primerResultado).toBeInViewport({ ratio: 1 });
        for (const parte of [ultimo.locator('img').first(), ultimo.locator('[data-clue-key]').first()]) {
          expect(await parte.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })).toBe(true);
        }
        await host.page.setViewportSize({ width: 1280, height: 720 });
        await buscadorRespuesta(host.page).fill('');
        // El tablero completo de un rival (lo público: sus intentos y pistas), en un diálogo abierto desde su franja.
        const verRival = host.page.getByRole('button', { name: new RegExp(`^Ver tablero de ${primero.name}`) });
        await verRival.click();
        const dialogo = host.page.getByRole('dialog', { name: `Tablero de ${primero.name}` });
        await expect(dialogo).toBeVisible();
        await expect(dialogo.getByTestId('pokeddle-row')).toHaveCount(2);
        await expect(dialogo.getByTestId('pokeddle-row').first()).toContainText(relleno[0]!);
        await expect(dialogo.getByRole('list', { name: 'Cómo leer el tablero' })).toBeVisible();
        await capturarTamanos(host.page, 'juego-pokeddle-race-rival', { sigue: dialogo, opts: ARCADE });
        await host.page.keyboard.press('Escape');
        await expect(dialogo).toBeHidden();
        await expect(verRival).toBeFocused();
        // A 1280×720 el tablero se desplaza dentro de su panel, nunca la página.
        expect(await tablero.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }

      await adivinar(host.page, intento);
      probados.push(intento);
      const cerrada = host.page.getByRole('heading', { name: new RegExp(`^(Pistas de la ronda ${ronda}|¡Era .+!)$`), level: 1 });
      await expect(cerrada).toBeVisible({ timeout: 10_000 });
      textos.push(await textoDeMain(host.page));
      if (!hostId) {
        await expect.poll(() => Object.entries((estado as PokeddleVisible | null)?.boards ?? {}).find(([, b]) => b.rows[0]?.guessedPokemon?.name === intento)?.[0] ?? '', { timeout: 5_000 }).not.toBe('');
        hostId = Object.entries((estado as unknown as PokeddleVisible).boards).find(([, b]) => b.rows[0]?.guessedPokemon?.name === intento)![0];
      }
      await expect(host.page.locator('[data-testid="pokeddle-row"][data-latest="true"]')).toContainText(intento);
      // La fila nueva: una casilla por pista con su resultado en texto para lectores.
      await expect(host.page.locator('[data-latest="true"] [data-clue-key]')).toHaveCount(13);
      await expect(host.page.locator('[data-latest="true"] [data-clue-key="attack"] .sr-only')).toHaveText(/^Ataque: \d+\. (Distinto: el secreto es (mayor|menor)|Igual)\.$/);
      resuelto = await host.page.getByRole('heading', { name: '¡Pokémon encontrado!' }).isVisible();
      if (resuelto && ronda < 3) test.info().annotations.push({ type: 'aviso', description: `acertó por suerte en la ronda ${ronda}: se saltan las capturas del tablero y del rival y las comprobaciones a 390 de la ronda 3` });
      test.info().annotations.push({ type: 'pokeddle', description: `ronda ${ronda}: ${resuelto ? 'acertado' : 'sin acertar'}` });
      // El foco va al título de la placa (no cae al body): la ronda cerrada o el Pokémon encontrado.
      if (!resuelto) await expect(host.page.getByText(`Ronda ${ronda} cerrada`, { exact: true })).toBeVisible();
      await expect(host.page.locator('#guess-plate-title')).toBeFocused();
      // La ronda cerrada dura 3 s: un tamaño por ronda.
      await capturarAnotando(host.page, `juego-pokeddle-race-ronda-${ronda}`, cerrada, [SIZES[ronda - 1]!], ARCADE);
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 70_000 });
    await expect.poll(() => (estado as PokeddleVisible | null)?.phase, { timeout: 5_000 }).toBe('GAME_RESULTS');
    // Privacidad: ningún Pokémon secreto salió antes de la clasificación (salvo el que el host probó él mismo).
    const secretos = Object.values((estado as unknown as PokeddleVisible).boards).map((b) => b.revealedPokemon?.name).filter((n): n is string => Boolean(n));
    expect(secretos).toHaveLength(3);
    for (const nombre of secretos.filter((n) => !probados.includes(n) && !relleno.includes(n))) for (const texto of textos) expect(texto).not.toContain(nombre);
    for (const nombre of secretos) await expect(host.page.locator('main')).toContainText(nombre);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokeddle-race-clasificacion', { opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Tipos de los Pokémon dados, de la BD (para saber qué continuación vale en Type Chain). */
function tiposEnBd(ids: readonly string[]): Map<string, string[]> {
  const filas = psql(`SELECT id, array_to_string(types, ',') FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`, { ids: ids.join(',') });
  return new Map(filas.split('\n').filter(Boolean).map((fila) => { const [id, tipos] = fila.split('|') as [string, string]; return [id, tipos.split(',').filter(Boolean)]; }));
}

const BUSCADOR_CADENA = /^Buscar Pokémon para continuar desde (.+)$/;
const buscadorCadena = (page: Page) => page.getByRole('textbox', { name: BUSCADOR_CADENA });

/** Elige un Pokémon con el buscador de Type Chain. */
async function encadenar(page: Page, nombre: string): Promise<void> {
  await buscadorCadena(page).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/**
 * Type Chain sin red: tres jugadores, Gen 1 y turnos de 30 s. Quien tenga el turno prueba primero un Pokémon sin ningún
 * tipo en común (el motivo, la espera y el fallo público) y luego uno que comparte exactamente uno, buscados en la BD
 * con los tipos del Pokémon actual (leídos de sus `TypeBadge`). Los otros dos dejan pasar su turno: el primero cae
 * eliminado (se ve en texto) y, al caer el segundo, queda un superviviente y sale la clasificación. Type Chain no tiene
 * revelación: la «revelación» es la franja del último movimiento.
 */
test('type-chain: un fallo, un eslabón válido, dos eliminaciones por tiempo y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Type Chain');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const treinta = host.page.getByRole('radiogroup', { name: 'Tiempo por turno' }).getByRole('radio', { name: '30s' });
    await treinta.click();
    await expect(treinta).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(pages);
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const tipos = tiposEnBd(catalogo.map((p) => p.id));
    expect(tipos.size, 'Pokémon de la Gen 1 con tipos').toBeGreaterThan(50);

    // Quien tiene el turno ve el buscador; el resto, a quién se espera.
    const turno = await primeraVisible(pages, buscadorCadena);
    const otros = pages.filter((page) => page !== turno);
    const actual = (await buscadorCadena(turno).getAttribute('aria-label'))!.replace(BUSCADOR_CADENA, '$1');
    const carta = turno.getByTestId('type-chain-current');
    await expect(carta).toContainText(actual);
    const tiposActual = await carta.locator('[data-type]').evaluateAll((els) => els.map((el) => el.getAttribute('data-type')!));
    expect(tiposActual.length).toBeGreaterThan(0);
    for (const page of otros) await expect(page.getByRole('heading', { name: /^Esperando a .+…$/ })).toBeVisible();
    await expect(turno.getByRole('heading', { name: '¡Tu turno!', level: 1 })).toBeVisible();

    const comunes = (id: string) => (tipos.get(id) ?? []).filter((tipo) => tiposActual.includes(tipo)).length;
    const nombre = (id: string) => catalogo.find((p) => p.id === id)!.name;
    const ids = [...tipos.keys()].filter((id) => nombre(id) !== actual && !/[-(]/.test(nombre(id)));
    const fallo = ids.find((id) => comunes(id) === 0)!;
    const validos = ids.filter((id) => comunes(id) === 1);
    expect(fallo && validos.length > 0, 'hay un fallo seguro y una continuación válida').toBe(true);
    test.info().annotations.push({ type: 'type-chain', description: `${actual} (${tiposActual.join(', ')}) · fallo ${nombre(fallo)} · válido ${nombre(validos[0]!)}` });

    // La pantalla del turno a los tres tamaños y, a 390×844, la carta del Pokémon actual y el buscador a la vista sin desplazar.
    await capturarTamanos(turno, 'juego-type-chain-turno', { sigue: buscadorCadena(turno), opts: ARCADE });
    await turno.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await turno.evaluate(() => window.scrollTo(0, 0));
    await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(buscadorCadena(turno)).toBeInViewport({ ratio: 1 });
    await expect(turno.getByRole('timer')).toBeInViewport({ ratio: 1 });
    await buscadorCadena(turno).fill('a');
    await expect(turno.locator('.pokemon-selector-results button').first()).toBeInViewport({ ratio: 1 });
    await buscadorCadena(turno).fill('');
    await turno.setViewportSize({ width: 1280, height: 720 });

    // Un fallo: el motivo en texto, la espera (vista) y el aviso en la única región viva; el resto lo ve en los fallos.
    await encadenar(turno, nombre(fallo));
    await expect(turno.getByTestId('type-chain-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(turno.getByRole('status').filter({ hasText: new RegExp(`^Incorrecto: ${nombre(fallo)}\\. No comparte ningún tipo\\.`) })).toHaveCount(1);
    // Una sola región viva en la pantalla del juego (el armazón de la sala tiene las suyas: avisos y cut-ins).
    await expect(turno.getByTestId('type-chain-screen').locator('[aria-live]')).toHaveCount(1);
    for (const page of otros) await expect(page.getByTestId('type-chain-attempt').filter({ hasText: nombre(fallo) })).toHaveCount(1, { timeout: 5_000 });
    await expect(turno.getByTestId('type-chain-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(turno.getByTestId('type-chain-reason')).toContainText('No comparte ningún tipo.');

    // El eslabón válido (si el servidor lo saca del pool, el siguiente candidato).
    let puesto = '';
    for (const id of validos.slice(0, 4)) {
      await expect(turno.getByTestId('type-chain-cooldown')).toHaveCount(0, { timeout: 5_000 });
      await encadenar(turno, nombre(id));
      const ok = await turno.getByTestId('type-chain-event').filter({ hasText: 'continúa la cadena' }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      if (ok) { puesto = nombre(id); break; }
    }
    expect(puesto, 'una continuación válida entra en la cadena').not.toBe('');
    // El foco no cae al body al desmontarse el buscador: va al título de la placa.
    await expect(turno.locator('#guess-plate-title')).toBeFocused();
    await expect(turno.getByTestId('type-chain-link')).toHaveCount(2);
    await expect(turno.getByTestId('type-chain-link').first()).toContainText(puesto);
    await expect(turno.getByTestId('type-chain-current')).toContainText(puesto);
    // La «revelación» de Type Chain: la franja del último movimiento, a los tres tamaños.
    const segundo = await primeraVisible(otros, buscadorCadena);
    const tercero = otros.find((page) => page !== segundo)!;
    await capturarTamanos(tercero, 'juego-type-chain-movimiento', { sigue: tercero.getByTestId('type-chain-event').filter({ hasText: 'continúa la cadena' }), opts: ARCADE });

    // El segundo deja pasar su turno: cae eliminado y lo dice en texto (su placa y la lista de jugadores).
    await expect(segundo.getByRole('heading', { name: 'Observas la cadena' })).toBeVisible({ timeout: 40_000 });
    await expect(segundo.getByText('Eliminado: se le acabó el tiempo')).toBeVisible();
    await expect(turno.getByTestId('type-chain-player').filter({ hasText: /Eliminado.*Se le acabó el tiempo/ })).toHaveCount(1);
    await expect(turno.getByTestId('type-chain-event').filter({ hasText: 'queda eliminado' })).toBeVisible();
    await capturarTamanos(segundo, 'juego-type-chain-eliminado', { sigue: segundo.getByRole('heading', { name: 'Observas la cadena' }), opts: ARCADE });

    // Cae el tercero: queda uno y sale la clasificación.
    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 40_000 });
    await expect(host.page.getByText('Sigue en pie')).toHaveCount(1);
    await expect(host.page.getByText(/^Eliminado [12]\.º$/)).toHaveCount(2);
    await expect(host.page.getByText(/^Cayó: se le acabó el tiempo/)).toHaveCount(2);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-type-chain-clasificacion', { opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Pokémon Trivia sin red: tres jugadores, tres preguntas de 15 s. En cada una el host responde con el atajo «1» y los
 * invitados con las cartas 2 y 3, así la pregunta se cierra en el acto. Antes de responder, la pregunta a los tres
 * tamaños (a 390×844, la pregunta y todas las opciones a la vista sin desplazar) y sin ninguna marca de la correcta en
 * el DOM; en la revelación (4 s), un tamaño por pregunta: la correcta y las incorrectas con icono y texto, el dato y
 * quién eligió qué. Al final, la clasificación con la precisión y los aciertos por categoría.
 */
test('pokemon-trivia: tres preguntas con atajos, la revelación de cada una y la clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokémon Trivia');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Número de preguntas', ['Home', 'ArrowRight', 'ArrowRight'], '3'], ['Tiempo por pregunta', ['Home', 'ArrowRight'], '15']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await saltarIntro(jugadores.map((j) => j.page));

    const opcion = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^${n}\\. `) });
    const titulo = host.page.getByRole('heading', { level: 1 });
    for (const ronda of [1, 2, 3]) {
      await expect(host.page.getByText(`Ronda ${ronda} de 3`, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(opcion(host.page, 1)).toBeVisible({ timeout: 10_000 });
      await expect(titulo).toHaveText(/^Pregunta · /);
      // Antes de revelar no hay ninguna marca de la correcta ni dato de la revelación.
      const antes = await textoDeMain(host.page);
      for (const marca of ['Correcta', 'Incorrecta', 'Nadie la eligió']) expect(antes, `ronda ${ronda}: sin «${marca}» antes de revelar`).not.toContain(marca);
      await expect(host.page.getByTestId('trivia-fact')).toHaveCount(0);

      if (ronda === 1) {
        await capturarTamanos(host.page, 'juego-pokemon-trivia-pregunta', { sigue: opcion(host.page, 1), opts: ARCADE });
        // A 390×844 sin desplazar: la pregunta, el plazo y todas las opciones.
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        await expect(host.page.getByTestId('trivia-prompt')).toBeInViewport({ ratio: 1 });
        await expect(host.page.getByRole('timer')).toBeInViewport({ ratio: 1 });
        const total = await host.page.locator('[data-trivia-card]').count();
        for (let n = 1; n <= total; n++) {
          await expect(opcion(host.page, n)).toBeInViewport({ ratio: 1 });
          // Nada la tapa (la placa va pegada al fondo): el pie de la carta, donde va el nombre, es suyo.
          expect(await opcion(host.page, n).evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 6)); }), `opción ${n} a la vista y sin tapar`).toBe(true);
        }
        await host.page.setViewportSize({ width: 1280, height: 720 });
      }

      // El host responde con el atajo 1: su respuesta queda bloqueada (en texto) y el foco va al título de la placa.
      // El atajo no depende de dónde esté el foco (salvo en un campo): se quita del control que lo tenga.
      await host.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await host.page.keyboard.press('1');
      await expect(host.page.getByRole('heading', { name: /^1 · .+ bloqueada$/ })).toBeVisible({ timeout: 5_000 });
      await expect(host.page.locator('#guess-plate-title')).toBeFocused();
      await expect(primero.page.getByTestId('trivia-score-row').filter({ hasText: 'Respondió' })).toHaveCount(1, { timeout: 5_000 });
      await opcion(primero.page, 2).click();
      await opcion(segundo.page, 3).click();

      // Revelación: la correcta y las incorrectas con texto, el dato y quién eligió qué.
      await expect(titulo).toHaveText(/^Correcta: .+$/, { timeout: 10_000 });
      const cartas = host.page.locator('[data-trivia-card]');
      await expect(cartas.filter({ hasText: /Correcta/ })).toHaveCount(1);
      await expect(cartas.filter({ hasText: /Incorrecta/ })).toHaveCount(await cartas.count() - 1);
      await expect(host.page.getByTestId('trivia-fact')).toBeVisible();
      await expect(host.page.getByTestId('trivia-answer-row')).toHaveCount(3);
      await expect(host.page.getByTestId('trivia-answer-row').filter({ hasText: primero.name })).toContainText(/(Acertó|Falló)\s*Eligió 2 · /);
      await expect(host.page.getByTestId('trivia-pickers').filter({ hasText: 'Tú' })).toHaveCount(1);
      test.info().annotations.push({ type: 'trivia', description: `ronda ${ronda}: ${await titulo.innerText()}` });
      // La revelación dura 4 s: un tamaño por pregunta.
      if (ronda === 3) {
        // A 390×844 sin desplazar: las cuatro cartas compactas con su marca y la correcta sin tapar por la placa.
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        const correcta = cartas.filter({ hasText: /Correcta/ });
        await expect(correcta).toBeInViewport({ ratio: 1 });
        for (const carta of await cartas.all()) {
          await expect(carta).toBeInViewport({ ratio: 1 });
          expect(await carta.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 6)); }), 'carta de la revelación sin tapar').toBe(true);
        }
      }
      await capturarAnotando(host.page, `juego-pokemon-trivia-revelacion-${ronda}`, titulo.filter({ hasText: /^Correcta: / }), [SIZES[ronda - 1]!], ARCADE);
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/de 3 · \d+% de precisión$/)).toHaveCount(3);
    await expect(host.page.getByLabel('Aciertos por categoría')).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-trivia-clasificacion', { opts: ARCADE });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('intro: los pasos antes de la primera ronda', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Learnset Guess');
    await iniciarPartida(host.page, invitados.map((j) => j.page));

    // La sala espera en GAME_STARTING con los 3 pasos del juego, la cuenta atrás y nadie listo.
    for (const page of pages) await expect(introDePartida(page)).toBeVisible({ timeout: 15_000 });
    const intro = introDePartida(host.page);
    await expect(intro.getByRole('heading', { name: 'Cómo se juega a Learnset Guess' })).toBeVisible();
    await expect(intro.getByText('Paso 1 de 3', { exact: true })).toBeVisible();
    await expect(intro.getByRole('timer')).toBeVisible();
    await expect(intro.getByText('0 de 3 listos')).toBeVisible();
    // Sin hacer scroll, «Empezar ya» y la navegación de pasos se ven a la vez a 1280×720 y 390×844.
    const empezar = (page: Page) => introDePartida(page).getByRole('button', { name: 'Empezar ya', exact: true });
    for (const { w, h } of [SIZES[0], SIZES[2]]) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.evaluate(() => window.scrollTo(0, 0));
      for (const objetivo of [empezar(host.page), intro.getByRole('button', { name: 'Siguiente paso' }), intro.getByRole('button', { name: 'Ver paso 3' })]) {
        await expect(objetivo, `${w}×${h}`).toBeInViewport({ ratio: 1 });
      }
    }
    // La captura de revisión enseña la intro sin el cut-in de entrada (1,6 s).
    await expect(intro.getByText('¡Empieza la partida!')).toHaveCount(0, { timeout: 5_000 });
    await capturarTamanos(host.page, 'juego-intro', { sigue: intro });
    // En escritorio la intro cabe entera: sin scroll de página ni de `main`, y texto de 13 px o más.
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      const { id, problems } = await layoutProblems(host.page, 'juego-intro', false, false, { noPageScroll: true, minFontPx: 13 });
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });

    // Uno pulsa «Empezar ya»: él espera al resto y los demás ven el recuento.
    const saltar = empezar;
    await saltar(primero.page).click();
    await expect(introDePartida(primero.page).getByRole('button', { name: 'Esperando al resto' })).toBeDisabled();
    await expect(intro.getByText('1 de 3 listos')).toBeVisible();

    // Saltan los otros dos y empieza la primera ronda sin esperar al plazo.
    await saltar(host.page).click();
    await saltar(segundo.page).click();
    for (const page of pages) {
      await expect(introDePartida(page)).toBeHidden({ timeout: 5_000 });
      await expect(page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeVisible({ timeout: 15_000 });
    }
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
