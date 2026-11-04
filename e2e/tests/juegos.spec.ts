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

/** Un juego de cada lote de la etapa 2B: se captura a los tres tamaños de revisión (Higher or Lower, en su propio test). */
const SCREENSHOT_GAMES = new Set(['shiny-vote', 'type-duel', 'poke-taboo', 'most-likely-to', 'learnset-guess', 'whos-that-pokemon', 'who-is-who-pokemon', 'pokemon-bingo', 'sketchmon']);

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
        expect(response.status(), `${response.url()}`).toBe(200);
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
          const { id, problems } = await layoutProblems(host.page, `juego-${manifest.id}`, true);
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
    await expect(eligeAntes!.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ })).toBeVisible({ timeout: 10_000 });
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
