/**
 * Un test por minijuego del registro (`backend/src/main/resources/games/registry.json`) contra el `/ws`
 * del backend Java (`npm run test:e2e -- juegos`):
 * sala nueva con `max(3, minPlayers)` invitados, selección del juego, listos, «Empezar partida» y
 * comprobación de que la partida sale del lobby y pinta su pantalla sin desbordes a 1280×720.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Response, type Route } from '@playwright/test';
import { anadirJuegos, animacionDe, conMovimiento, crearSalaConJugadores, capture, iniciarPartida, layoutProblems, psql, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador, type SalaConJugadores } from '../src/helpers.js';

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

/** Lo que el backend Java dice de un juego sin motor portado: nunca debe salir. */
const NOT_PORTED = 'Este minijuego todavía no está disponible en el servidor Java.';

/** Un juego de cada lote de la etapa 2B: se captura a los tres tamaños de revisión (Higher or Lower, en su propio test). */
const SCREENSHOT_GAMES = new Set(['shiny-vote', 'type-duel', 'poke-taboo', 'most-likely-to', 'learnset-guess', 'whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess', 'pokemon-cry-quiz', 'pokedex-entry-guess', 'guess-from-stats', 'pokeddle-race', 'type-chain', 'pokemon-trivia', 'tcg-higher-lower', 'pokemon-connections', 'who-is-who-pokemon', 'pokemon-bingo', 'sketchmon', 'absurd-pokedex', 'pokemon-team-auction', 'pokemon-bluff-auction']);

/** Texto del aviso de error del lobby o de la sala, si hay alguno visible. */
async function avisos(page: Page): Promise<string> {
  const textos = await page.getByRole('alert').allInnerTexts();
  return textos.join(' | ');
}

/** Espera a que la pantalla de juego esté pintada: sin lobby, sin esqueleto de carga y con contenido. */
async function esperarPantallaDeJuego(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeHidden({ timeout: 15_000 });
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
      await esperarPartida(jugadores.map((j) => j.page));

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
        // Con el catálogo (F8) el diálogo y la pantalla de fondo pasan el medidor a 13 px (la insignia «Secreto» ya no es de 10 px).
        for (const { w, h } of SIZES) {
          await turno!.setViewportSize({ width: w, height: h });
          await expect(dialogo).toBeVisible();
          const { id, problems } = await layoutProblems(turno!, 'dialogo-adivinar', true);
          expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
        }
        await turno!.setViewportSize({ width: 1280, height: 720 });
        await turno!.keyboard.press('Escape');
        await expect(dialogo).toBeHidden();
      }
      for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);

      // A 1280×720 el scroll horizontal y el de página (o del `main`) siempre fallan; lo que mida `measureLayout` se
      // anota y solo hace fallar el test con `PU_LAYOUT_STRICT=1`.
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
async function capturarTamanos(page: Page, nombre: string, { sigue, completa = false }: { sigue?: Locator; completa?: boolean } = {}): Promise<void> {
  const comprobar = async () => { if (sigue) await expect(sigue, `${nombre}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 }); };
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), undefined, { timeout: 3_000 }).catch(() => undefined);
    const { id, problems } = await layoutProblems(page, nombre, true, completa);
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
    await esperarPartida(jugadores.map((j) => j.page));
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
    await capturarTamanos(primero, 'juego-type-duel-eleccion');
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
    await capturarTamanos(host.page, 'juego-type-duel-vs', { sigue: versus });
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
    const busqueda = await layoutProblems(primero, 'juego-type-duel-vs-busqueda', true);
    expect(busqueda.problems, `${busqueda.id}: encaje y legibilidad`).toEqual([]);
    await primero.setViewportSize({ width: 1280, height: 720 });

    // Un intento fallido (Charizard es Fuego/Volador): sale en los intentos públicos y junto al buscador.
    await buscador.fill('charizard');
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    await buscador.press('Enter');
    await expect(host.page.getByText('No coincide con los tipos').first()).toBeVisible({ timeout: 10_000 });
    await expect(primero.locator('[data-layer="screen-bottom"]').getByText(/no coincide/)).toBeVisible();
    await buscador.fill('char');
    await capturarTamanos(primero, 'juego-type-duel-busqueda');

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
    await capturarTamanos(host.page, 'juego-type-duel-resultado', { sigue: titulo });

    // Un solo duelo: el host pasa a la clasificación.
    await host.page.getByRole('button', { name: 'Ver clasificación' }).click();
    const clasificacion = host.page.getByRole('heading', { level: 1, name: 'Clasificación Type Duel' });
    await expect(clasificacion).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText('Récords de la partida')).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-clasificacion');
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
      const medidas = await Promise.all(pages.map((page) => layoutProblems(page, nombre, true)));
      for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    };
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await ajustar();
    await esperarPartida(pages);

    // Reparto de roles: cada uno ve el suyo; el impostor, sin el Pokémon.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeVisible({ timeout: 15_000 });
    await enParalelo('juego-pokemon-impostor-rol');
    let impostores = 0;
    for (const page of pages) if (await page.getByText('No conoces el Pokémon. Intenta disimular.').isVisible()) impostores++;
    expect(impostores, 'un impostor que no conoce el Pokémon').toBe(1);

    const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
    const saltar = (page: Page) => page.getByRole('button', { name: 'Saltar', exact: true });
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    let nombreProbado = false;
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
          await capturarTamanos(page, 'juego-pokemon-impostor-pistas', { sigue: campo(page) });
          await ajustar();
        }
        // Un inocente escribe el nombre del Pokémon: el campo es el dueño del error y no deja enviar. En la ronda 2,
        // fuera del turno 1 (que ya captura en la 1): de los turnos 0 y 2, al menos uno es de un inocente.
        const secreto = page.locator('[data-impostor-secret]');
        if (ronda === 2 && turno !== 1 && !nombreProbado && await secreto.count()) {
          nombreProbado = true;
          await campo(page).fill(`${(await secreto.first().getAttribute('data-impostor-secret'))!}uuu`);
          await expect(page.getByText('No puedes decir el nombre del Pokémon.')).toBeVisible();
          await expect(page.getByRole('button', { name: 'Enviar pista' })).toBeDisabled();
          await capturarTamanos(page, 'juego-pokemon-impostor-pista-nombre', { sigue: campo(page) });
          await ajustar();
          await campo(page).fill('');
        }
        await campo(page).fill(`pista ${ronda}`);
        await campo(page).press('Enter');
        await expect(campo(page)).toBeHidden();
      }
      if (ronda === 2) expect(nombreProbado, 'un inocente probó el nombre del Pokémon').toBe(true);

      for (const page of pages) await expect(saltar(page)).toBeVisible({ timeout: 15_000 });
      if (ronda === 1) {
        await capturarTamanos(host.page, 'juego-pokemon-impostor-votacion', { sigue: saltar(host.page) });
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
    await capturarTamanos(host.page, 'juego-pokemon-impostor-resultados', { sigue: titulo, completa: true });
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
      await esperarPartida(pages);

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
      const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, nombre, true)));
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

test('pokemon-impostor: con dos impostores, cada uno ve al otro', async ({ browser }) => {
  test.setTimeout(120_000);
  // Prefijos de 19 caracteres: con el sufijo de `uniqueName` los nombres llegan a 24, el máximo permitido.
  const sala = await crearSalaConJugadores(browser, 5, undefined, ['Host', 'Entrenadora Largaa1', 'Entrenadora Largaa2', 'Entrenadora Largaa3', 'Entrenadora Largaa4']);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, tecla, valor] of [['Impostores', 'ArrowRight', '2'], ['Tiempo por pista', 'End', '120']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press('Home');
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(pages);

    // Reparto de roles: solo los dos impostores ven la línea de aliados y cada uno nombra al otro.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeVisible({ timeout: 15_000 });
    const conAliados: Jugador[] = [];
    for (const jugador of jugadores) if (await jugador.page.getByTestId('impostor-fellows').isVisible()) conAliados.push(jugador);
    expect(conAliados.map((j) => j.name), 'exactamente dos impostores ven aliados').toHaveLength(2);
    const [a, b] = conAliados as [Jugador, Jugador];
    test.info().annotations.push({ type: 'impostores', description: `${a.name} | ${b.name}` });
    await expect(a.page.getByTestId('impostor-fellows')).toContainText(b.name);
    await expect(b.page.getByTestId('impostor-fellows')).toContainText(a.name);
    for (const jugador of jugadores) if (!conAliados.includes(jugador)) await expect(jugador.page.getByTestId('impostor-fellows')).toHaveCount(0);

    // Pistas: la tarjeta lateral y, en el móvil, la línea del rol con «con …» sin salirse de la vista.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeHidden({ timeout: 15_000 });
    await expect(a.page.getByTestId('impostor-fellows')).toContainText(b.name);
    await capturarTamanos(a.page, 'juego-pokemon-impostor-aliados');
    await a.page.setViewportSize({ width: 390, height: 844 });
    const linea = a.page.getByTestId('impostor-role-strip');
    await expect(linea).toBeInViewport({ ratio: 1 });
    await expect(linea).toContainText('con ');
    await a.page.setViewportSize({ width: 1280, height: 720 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
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
    // Pokédex Distance (el de por defecto) y Pokémon Impostor; en «Configuración», la lista de los dos.
    await anadirJuegos(page, ['Pokémon Impostor']);
    await page.getByRole('tab', { name: 'Configuración' }).click();
    const fila = page.getByRole('region', { name: 'Minijuegos elegidos' }).getByRole('listitem').filter({ has: page.locator('strong').getByText('Pokémon Impostor', { exact: true }) });
    await fila.getByRole('button', { name: 'Ajustar Pokémon Impostor' }).click();
    await expect(page.getByRole('heading', { name: 'Ajustes de Pokémon Impostor' })).toBeVisible();
    // Dos impostores necesitan 5 jugadores: con 3, la sesión lo omite en vez de bloquear la sala.
    const impostores = page.getByRole('slider', { name: 'Impostores' });
    await impostores.focus();
    await impostores.press('ArrowRight');
    await expect(page.getByText('2 impostores', { exact: true })).toBeVisible();
    await expect(fila.getByText('Se omitirá', { exact: true })).toBeVisible();
    await expect(page.getByText('Se omitirá mientras haya 3 jugadores.', { exact: false })).toBeVisible();
    // Pulsar el deslizador desplaza la página y la cabecera fija taparía el contenido: se captura desde arriba.
    await impostores.blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-rotacion-impostor-omitido');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('lobby: varios minijuegos y su orden', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, jugadores } = sala;
    const page = host.page;
    // Elegir tres: cada carta lleva su número de orden; quitar uno renumera los siguientes.
    await anadirJuegos(page, ['Higher or Lower', 'Shiny Quiz']);
    const lista = page.getByRole('list', { name: 'Minijuegos' });
    await expect(lista.getByRole('button', { pressed: true })).toHaveCount(3);
    await expect(lista.getByRole('button', { name: /Shiny Quiz.*n\.º 3 de la sesión/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Configuración' }).click();
    await expect(page.getByRole('region', { name: 'Minijuegos elegidos' }).getByRole('listitem')).toHaveCount(3);
    await page.getByRole('tab', { name: 'Modo y sesión' }).click();
    const aleatorio = page.getByRole('button', { name: /^Aleatorio/ });
    await aleatorio.click();
    await expect(aleatorio).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Cada partida sale al azar entre los 3 minijuegos, sin repetir el anterior.')).toBeVisible();
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
    await esperarPartida(jugadores.map((j) => j.page));
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
    await capturarTamanos(host.page, 'juego-higher-lower', { sigue: mayor(host.page) });

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
    const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, nombre, true)));
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
    await capturarTamanos(host.page, 'juego-higher-lower-clasificacion', { sigue: clasificacion });
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
    await capturarTamanos(host.page, 'lobby-config-pokedex-distance', { completa: true });
    await ocultas.click();
    await expect(ocultas).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toHaveCount(0);
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

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
    await capturarTamanos(host.page, 'juego-pokedex-distance-oculta', { sigue: yaHaElegido });
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
async function capturarAnotando(page: Page, nombre: string, sigue: Locator, sizes: readonly { w: number; h: number }[] = SIZES): Promise<void> {
  for (const { w, h } of sizes) {
    await page.setViewportSize({ width: w, height: h });
    const { id, problems } = await layoutProblems(page, nombre, true);
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
    await esperarPartida(jugadores.map((j) => j.page));
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
    await capturarTamanos(host.page, 'juego-pokedex-distance-ronda-oculta', { sigue: enLaRonda });

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
    await capturarTamanos(host.page, 'juego-pokedex-distance-revelacion', { sigue: regla });
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
    await esperarPartida(jugadores.map((j) => j.page));

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
      await capturarTamanos(host.page, 'juego-pokedex-distance-acierto-exacto', { sigue: banda });
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
    await esperarPartida([host.page, invitado.page]);

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
    await capturarTamanos(host.page, 'juego-buscador-vacio', { sigue: vacio });
    await borrar.click();
    await expect(buscador).toHaveValue('');
    await expect(buscador).toBeFocused();
    await expect(vacio).toHaveCount(0);

    const alerta = invitado.page.getByRole('alert').filter({ hasText: 'No se pudo cargar el buscador de Pokémon.' });
    await expect(alerta).toBeVisible({ timeout: 20_000 });
    await capturarTamanos(invitado.page, 'juego-buscador-error', { sigue: alerta });
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
    await esperarPartida([host.page, invitado.page]);
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
    await capturarAnotando(host.page, 'juego-pokedex-distance-empate-forzado', forzado);

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
    await capturarTamanos(host.page, 'juego-pokedex-distance-resultados', { sigue: tabla, completa: true });
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
    await capturarTamanos(host.page, 'lobby-config-shiny-vote', { completa: true });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida([host.page, invitado.page]);
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
    await capturarTamanos(invitado.page, 'juego-shiny-vote-votos-al-revelar', { sigue: invitado.page.getByRole('button', { name: 'Confirmar voto' }) });
    // El host, con el voto ya bloqueado: cartas fijas y su elección en la pantalla inferior.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-shiny-vote-voto-confirmado', { sigue: host.page.getByText('Voto confirmado:') });

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
    await capturarTamanos(invitado.page, 'juego-shiny-vote-revelacion', { sigue: franja(invitado.page), completa: true });

    // Una sola ronda: llegan los resultados con la clasificación del catálogo.
    for (const { page } of jugadores) await expect(page.getByRole('heading', { name: 'Clasificación shiny' })).toBeVisible({ timeout: 15_000 });
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion.getByRole('listitem')).toHaveCount(2);
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-shiny-vote-resultados', { sigue: clasificacion, completa: true });
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

/**
 * Buscador de respuesta de los juegos de adivinar: su etiqueta lleva la ronda, la paleta o el grito («Buscar respuesta
 * para la ronda 3», «… para la paleta 1», «… para el grito 2»). `elegirPokemon` usa el de «Buscar Pokémon».
 */
const BUSCADOR_RESPUESTA = /^Buscar respuesta para (la|el) (ronda|paleta|grito|dibujo) \d+$/;
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
    await esperarPartida(jugadores.map((j) => j.page));
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
        await capturarTamanos(host.page, 'juego-pokeddle-race-tablero', { sigue: buscadorRespuesta(host.page) });
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
        await capturarTamanos(host.page, 'juego-pokeddle-race-rival', { sigue: dialogo });
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
      await capturarAnotando(host.page, `juego-pokeddle-race-ronda-${ronda}`, cerrada, [SIZES[ronda - 1]!]);
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 70_000 });
    await expect.poll(() => (estado as PokeddleVisible | null)?.phase, { timeout: 5_000 }).toBe('GAME_RESULTS');
    // Privacidad: ningún Pokémon secreto salió antes de la clasificación (salvo el que el host probó él mismo).
    const secretos = Object.values((estado as unknown as PokeddleVisible).boards).map((b) => b.revealedPokemon?.name).filter((n): n is string => Boolean(n));
    expect(secretos).toHaveLength(3);
    // Palabra completa: el secreto «Pidgeot» no debe chocar con un intento «Pidgeotto».
    const palabra = (nombre: string) => new RegExp(`(^|[^\\p{L}])${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    for (const nombre of secretos.filter((n) => !probados.includes(n) && !relleno.includes(n))) for (const texto of textos) expect(texto).not.toMatch(palabra(nombre));
    for (const nombre of secretos) await expect(host.page.locator('main')).toContainText(nombre);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokeddle-race-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Tipos de los Pokémon dados, de la BD (para saber qué Pokémon vale en la cadena de Type Chain). */
function tiposEnBd(ids: readonly string[]): Map<string, string[]> {
  const filas = psql(`SELECT id, array_to_string(types, ',') FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`, { ids: ids.join(',') });
  return new Map(filas.split('\n').filter(Boolean).map((fila) => { const [id, tipos] = fila.split('|') as [string, string]; return [id, tipos.split(',').filter(Boolean)]; }));
}

const BUSCADOR_CADENA = /^Buscar Pokémon de tipo (.+)$/;
const buscadorCadena = (page: Page) => page.getByRole('textbox', { name: BUSCADOR_CADENA });

/** Elige un Pokémon con el buscador de Type Chain. */
async function encadenar(page: Page, nombre: string): Promise<void> {
  await buscadorCadena(page).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/**
 * Type Chain sin red: tres jugadores, Gen 1 y turnos de 30 s. Quien tenga el turno (con el foco ya en el buscador)
 * prueba primero un Pokémon de otro tipo (el motivo, la espera y el fallo público) y luego uno del tipo de la cadena,
 * buscados en la BD con el tipo leído de su `TypeBadge`. Los otros dos dejan pasar su turno: el primero cae
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
    await esperarPartida(pages);
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const tipos = tiposEnBd(catalogo.map((p) => p.id));
    expect(tipos.size, 'Pokémon de la Gen 1 con tipos').toBeGreaterThan(50);

    // Quien tiene el turno ve el buscador; el resto, a quién se espera.
    const turno = await primeraVisible(pages, buscadorCadena);
    const otros = pages.filter((page) => page !== turno);
    // Al empezar tu turno el foco ya está en el buscador: se escribe sin pulsar nada.
    await expect(buscadorCadena(turno)).toBeFocused();
    const actual = (await buscadorCadena(turno).getAttribute('aria-label'))!.replace(BUSCADOR_CADENA, '$1');
    const carta = turno.getByTestId('type-chain-type');
    await expect(carta).toContainText(actual);
    const tipoCadena = (await carta.locator('[data-type]').getAttribute('data-type'))!;
    expect(tipoCadena).toBeTruthy();
    for (const page of otros) await expect(page.getByRole('heading', { name: /^Esperando a .+…$/ })).toBeVisible();
    await expect(turno.getByRole('heading', { name: '¡Tu turno!', level: 1 })).toBeVisible();

    const delTipo = (id: string) => (tipos.get(id) ?? []).includes(tipoCadena);
    const nombre = (id: string) => catalogo.find((p) => p.id === id)!.name;
    const ids = [...tipos.keys()].filter((id) => !/[-(]/.test(nombre(id)));
    const fallo = ids.find((id) => !delTipo(id))!;
    const validos = ids.filter(delTipo);
    expect(fallo && validos.length > 0, 'hay un fallo seguro y un Pokémon del tipo').toBe(true);
    test.info().annotations.push({ type: 'type-chain', description: `tipo ${actual} (${tipoCadena}) · fallo ${nombre(fallo)} · válido ${nombre(validos[0]!)}` });

    // La pantalla del turno a los tres tamaños y, a 390×844, el tipo de la cadena y el buscador a la vista sin desplazar.
    await capturarTamanos(turno, 'juego-type-chain-turno', { sigue: buscadorCadena(turno) });
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
    await expect(turno.getByRole('status').filter({ hasText: new RegExp(`^Incorrecto: ${nombre(fallo)}\\. No es del tipo de la cadena\\.`) })).toHaveCount(1);
    // Una sola región viva en la pantalla del juego (el armazón de la sala tiene las suyas: avisos y cut-ins).
    await expect(turno.getByTestId('type-chain-screen').locator('[aria-live]')).toHaveCount(1);
    for (const page of otros) await expect(page.getByTestId('type-chain-attempt').filter({ hasText: nombre(fallo) })).toHaveCount(1, { timeout: 5_000 });
    await expect(turno.getByTestId('type-chain-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(turno.getByTestId('type-chain-reason')).toContainText('No es del tipo de la cadena.');

    // Un Pokémon del tipo (si el servidor lo saca del pool, el siguiente candidato).
    let puesto = '';
    for (const id of validos.slice(0, 4)) {
      await expect(turno.getByTestId('type-chain-cooldown')).toHaveCount(0, { timeout: 5_000 });
      await encadenar(turno, nombre(id));
      const ok = await turno.getByTestId('type-chain-event').filter({ hasText: `nombra a ${nombre(id)}` }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      if (ok) { puesto = nombre(id); break; }
    }
    expect(puesto, 'un Pokémon del tipo entra en la cadena').not.toBe('');
    // El foco no cae al body al desmontarse el buscador: va al título de la placa.
    await expect(turno.locator('#guess-plate-title')).toBeFocused();
    await expect(turno.getByTestId('type-chain-link')).toHaveCount(1);
    await expect(turno.getByTestId('type-chain-link').first()).toContainText(puesto);
    await expect(turno.getByTestId('type-chain-type')).toContainText('1 Pokémon nombrado');
    // La «revelación» de Type Chain: la franja del último movimiento, a los tres tamaños.
    const segundo = await primeraVisible(otros, buscadorCadena);
    // El siguiente también recibe el foco en el buscador al empezar su turno.
    await expect(buscadorCadena(segundo)).toBeFocused();
    const tercero = otros.find((page) => page !== segundo)!;
    await capturarTamanos(tercero, 'juego-type-chain-movimiento', { sigue: tercero.getByTestId('type-chain-event').filter({ hasText: `nombra a ${puesto}` }) });

    // El segundo deja pasar su turno: cae eliminado y lo dice en texto (su placa y la lista de jugadores).
    await expect(segundo.getByRole('heading', { name: 'Observas la cadena' })).toBeVisible({ timeout: 40_000 });
    await expect(segundo.getByText('Eliminado: se le acabó el tiempo')).toBeVisible();
    await expect(turno.getByTestId('type-chain-player').filter({ hasText: /Eliminado.*Se le acabó el tiempo/ })).toHaveCount(1);
    await expect(turno.getByTestId('type-chain-event').filter({ hasText: 'queda eliminado' })).toBeVisible();
    await capturarTamanos(segundo, 'juego-type-chain-eliminado', { sigue: segundo.getByRole('heading', { name: 'Observas la cadena' }) });

    // Cae el tercero: queda uno y sale la clasificación.
    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 40_000 });
    await expect(host.page.getByText('Sigue en pie')).toHaveCount(1);
    await expect(host.page.getByText(/^Eliminado [12]\.º$/)).toHaveCount(2);
    await expect(host.page.getByText(/Cayó: se le acabó el tiempo/)).toHaveCount(2);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-type-chain-clasificacion');
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
    await esperarPartida(jugadores.map((j) => j.page));

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
        await capturarTamanos(host.page, 'juego-pokemon-trivia-pregunta', { sigue: opcion(host.page, 1) });
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
      // Como en Shiny Quiz: el atajo solo elige; Enter confirma.
      await host.page.keyboard.press('1');
      await expect(host.page.getByText('Has seleccionado')).toBeVisible();
      await expect(host.page.locator('[data-trivia-card]').first()).toHaveAttribute('aria-pressed', 'true');
      await host.page.keyboard.press('Enter');
      await expect(host.page.getByRole('heading', { name: /^1 · .+ bloqueada$/ })).toBeVisible({ timeout: 5_000 });
      await expect(host.page.locator('#guess-plate-title')).toBeFocused();
      await expect(primero.page.getByTestId('trivia-score-row').filter({ hasText: 'Respondió' })).toHaveCount(1, { timeout: 5_000 });
      await opcion(primero.page, 2).click();
      await primero.page.getByRole('button', { name: 'Confirmar respuesta' }).click();
      await opcion(segundo.page, 3).click();
      await segundo.page.getByRole('button', { name: 'Confirmar respuesta' }).click();

      // Revelación: la correcta y las incorrectas con texto, el dato y quién eligió qué.
      await expect(titulo).toHaveText(/^Correcta: .+$/, { timeout: 10_000 });
      const cartas = host.page.locator('[data-trivia-card]');
      await expect(cartas.filter({ hasText: /Correcta/ })).toHaveCount(1);
      await expect(cartas.filter({ hasText: /Incorrecta/ })).toHaveCount(await cartas.count() - 1);
      await expect(host.page.getByTestId('trivia-fact')).toBeVisible();
      await expect(host.page.getByTestId('trivia-answer-row')).toHaveCount(3);
      await expect(host.page.getByTestId('trivia-answer-row').filter({ hasText: primero.name })).toContainText(/(Acertó|Falló)\s*Eligió 2 · /);
      // Quién eligió cada una, con avatares sobre el sprite (el propio, marcado).
      await expect(host.page.locator('[data-testid="trivia-pickers"][data-self="true"]')).toHaveCount(1);
      test.info().annotations.push({ type: 'trivia', description: `ronda ${ronda}: ${await titulo.innerText()}` });
      // La revelación dura 4 s: un tamaño por pregunta.
      if (ronda === 3) {
        // A 390×844 sin desplazar: las cuatro cartas con su marca y la correcta sin tapar por la placa.
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        const correcta = cartas.filter({ hasText: /Correcta/ });
        await expect(correcta).toBeInViewport({ ratio: 1 });
        for (const carta of await cartas.all()) {
          await expect(carta).toBeInViewport({ ratio: 1 });
          expect(await carta.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 6)); }), 'carta de la revelación sin tapar').toBe(true);
        }
      }
      await capturarAnotando(host.page, `juego-pokemon-trivia-revelacion-${ronda}`, titulo.filter({ hasText: /^Correcta: / }), [SIZES[ronda - 1]!]);
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/de 3 · \d+% de precisión$/)).toHaveCount(3);
    await expect(host.page.getByLabel('Aciertos por categoría')).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-trivia-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Higher or Lower: Cartas con 5 rondas (el mínimo del contrato). En la primera: el duelo con «¿? €», las tres píldoras
 * a la vista a 390×844, una respuesta distinta por jugador (clic, atajo 3 y teclado con el foco en la placa) y el
 * revelado con los dos precios y qué eligió cada uno, capturado a los tres tamaños a la vez (dura 3 s). Las demás se
 * responden con «Más» hasta la clasificación. Las imágenes de las cartas vienen de TCGdex, como en el test genérico: no
 * se interceptan ni se comprueban (si no cargan, la carta queda sin imagen y el test no depende de ello).
 */
test('tcg-higher-lower: el duelo de precios, el revelado con lo que eligió cada uno y la clasificación', async ({ browser }) => {
  test.setTimeout(150_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Higher or Lower: Cartas');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('5');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    // Sin cartas TCG en la BD local el servidor lo declara no disponible, como en el test genérico.
    const outcome = await Promise.race([
      host.page.getByRole('heading', { name: 'Lobby de la sala' }).waitFor({ state: 'hidden', timeout: 15_000 }).then(() => 'started' as const),
      host.page.getByRole('alert').filter({ hasText: UNAVAILABLE['tcg-higher-lower']! }).first().waitFor({ timeout: 15_000 }).then(() => 'unavailable' as const),
    ]);
    test.skip(outcome === 'unavailable', 'Sin cartas TCG en la BD local');
    await esperarPartida(jugadores.map((j) => j.page));

    const pildora = (page: Page, nombre: 'Más' | 'Igual' | 'Menos') => page.getByRole('button', { name: nombre, exact: true });
    const movil = invitados[1]!.page;
    const ultimo = invitados[0]!.page;
    await expect(host.page.getByText('Ronda 1 de 5', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(pildora(host.page, 'Más')).toBeVisible({ timeout: 10_000 });
    // Antes de revelar: el precio de la nueva carta es «¿? €» y no hay franja de precios.
    await expect(host.page.locator('[data-tcg-price="current"]')).toHaveText(/^¿\? \S+$/);
    await expect(host.page.getByTestId('tcg-prices')).toHaveCount(0);
    const antes = await textoDeMain(host.page);
    await capturarTamanos(host.page, 'juego-tcg-higher-lower-duelo', { sigue: pildora(host.page, 'Más') });

    // A 390×844 sin desplazar: las dos cartas, el tiempo y las tres respuestas, sin que la placa tape las cartas.
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await movil.evaluate(() => window.scrollTo(0, 0));
    for (const nombre of ['Más', 'Igual', 'Menos'] as const) await expect(pildora(movil, nombre), `${nombre} a la vista a 390×844`).toBeInViewport({ ratio: 1 });
    const cartas = [movil.locator('[data-tcg-card="previous"]'), movil.locator('[data-tcg-card="current"]')];
    for (const carta of cartas) await expect(carta, 'carta del duelo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    const inferior = await movil.locator('[data-layer="screen-bottom"]').boundingBox();
    for (const carta of cartas) {
      const caja = await carta.boundingBox();
      expect(caja!.y + caja!.height, 'la placa no tapa las cartas a 390×844').toBeLessThanOrEqual(inferior!.y + 1);
    }

    // Cada página a su tamaño antes de la última respuesta: el revelado dura 3 s y se captura a la vez.
    const capturas = [
      { page: host.page, w: SIZES[0].w, h: SIZES[0].h },
      { page: ultimo, w: SIZES[1].w, h: SIZES[1].h },
      { page: movil, w: SIZES[2].w, h: SIZES[2].h },
    ];
    for (const { page, w, h } of capturas) await page.setViewportSize({ width: w, height: h });
    // Tres respuestas distintas: exactamente una acierta. El anfitrión pulsa «Más»; el del móvil, el atajo 3 («Menos»);
    // el último, «Igual» con el teclado: la píldora se desmonta y el foco pasa al título de la placa.
    await pildora(host.page, 'Más').click();
    await expect(host.page.getByRole('heading', { name: 'Respuesta Más bloqueada.' })).toBeVisible();
    await expect(movil.getByText('Respondió').first()).toBeVisible();
    await movil.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await movil.keyboard.press('3');
    await expect(movil.getByRole('heading', { name: 'Respuesta Menos bloqueada.' })).toBeVisible();
    await pildora(ultimo, 'Igual').focus();
    await ultimo.keyboard.press('Enter');
    await expect(ultimo.locator('[data-layer="screen-bottom"] h2')).toBeFocused();
    for (const { page } of capturas) await page.evaluate(() => window.scrollTo(0, 0));
    for (const { page } of capturas) await expect(page.getByTestId('tcg-prices')).toBeVisible({ timeout: 10_000 });
    const revelado = (page: Page) => page.getByText(/^Respuesta: (Más|Igual|Menos)$/);
    const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, 'juego-tcg-higher-lower-revelacion', true)));
    for (const { page } of capturas) await expect(revelado(page), 'el revelado sigue en pantalla tras la captura').toBeVisible({ timeout: 500 });
    for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    // Qué eligió cada uno, con texto: un acierto y dos fallos; y los dos precios en la franja.
    await expect(host.page.locator('[data-outcome="hit"]')).toHaveCount(1);
    await expect(host.page.locator('[data-outcome="miss"]')).toHaveCount(2);
    for (const eleccion of ['Eligió Más', 'Eligió Igual', 'Eligió Menos']) await expect(host.page.getByText(eleccion)).toHaveCount(1);
    const franja = await host.page.getByTestId('tcg-prices').innerText();
    const anterior = (await host.page.locator('[data-tcg-strip="previous"]').innerText()).trim();
    const nueva = (await host.page.locator('[data-tcg-strip="current"]').innerText()).trim();
    test.info().annotations.push({ type: 'tcg', description: `ronda 1: ${franja.replace(/\s+/g, ' ')}` });
    expect(nueva, 'precio de la nueva carta en la franja').toMatch(/\d/);
    if (nueva !== anterior) expect(antes, 'el precio de la nueva carta no estaba en la página antes de revelar').not.toContain(nueva);
    await expect(host.page.locator('[data-tcg-price="current"]')).toHaveText(nueva);
    for (const { page } of capturas) await page.setViewportSize({ width: 1280, height: 720 });

    // Las rondas 2 a 5: todos responden «Más» y la ronda se revela en el acto.
    for (const ronda of [2, 3, 4, 5]) {
      await expect(host.page.getByText(`Ronda ${ronda} de 5`, { exact: true })).toBeVisible({ timeout: 15_000 });
      for (const { page } of jugadores) await pildora(page, 'Más').click({ timeout: 10_000 });
      await expect(host.page.getByTestId('tcg-prices')).toBeVisible({ timeout: 10_000 });
    }

    const clasificacion = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower: Cartas' });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/^\d+ aciertos? de 5 · \d+ igual(es)? · mejor racha \d+ · \d+%$/)).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-tcg-higher-lower-clasificacion', { sigue: clasificacion });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

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

/** Tipos en castellano de las casillas «Tipo Fuego» (`describeBingoCondition`) → clave del catálogo. */
const TIPOS_BINGO: Record<string, string> = {
  Normal: 'normal', Fuego: 'fire', Agua: 'water', Eléctrico: 'electric', Planta: 'grass', Hielo: 'ice', Lucha: 'fighting', Veneno: 'poison', Tierra: 'ground',
  Volador: 'flying', Psíquico: 'psychic', Bicho: 'bug', Roca: 'rock', Fantasma: 'ghost', Dragón: 'dragon', Siniestro: 'dark', Acero: 'steel', Hada: 'fairy',
};
/** El tablero propio de Bingo (las casillas son conmutadores con la condición y el estado en su nombre). */
const tableroBingo = (page: Page) => page.getByRole('group', { name: 'Tu tablero: elige una casilla' });
const casillaBingo = (page: Page, indice: number) => tableroBingo(page).locator('[data-bingo-cell]').nth(indice);

/** Tipo de cada casilla del tablero propio (solo con la familia «Tipo»: una condición «Tipo X» por casilla). */
async function tiposDeCasillas(page: Page): Promise<string[]> {
  const nombres = await tableroBingo(page).locator('[data-bingo-cell]').evaluateAll((cartas) => cartas.map((carta) => carta.getAttribute('aria-label') ?? ''));
  return nombres.map((nombre) => {
    const tipo = /^Casilla \d+: Tipo (\S+)\./.exec(nombre)?.[1] ?? '';
    const clave = TIPOS_BINGO[tipo];
    if (!clave) throw new Error(`Casilla sin un tipo conocido: «${nombre}»`);
    return clave;
  });
}

/** Pokémon por defecto del catálogo con sus tipos, de la BD (solo los ids que da el buscador, con nombre único). */
function pokemonBingoEnBd(catalogo: ReadonlyArray<{ id: string; name: string }>): Array<{ name: string; types: string[] }> {
  const filas = psql(`SELECT id, array_to_string(types, ',') FROM "Pokemon" WHERE "isDefault" AND id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`, { ids: catalogo.map((p) => p.id).join(',') });
  const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
  const repetidos = new Set(catalogo.map((p) => p.name).filter((nombre, i, todos) => todos.indexOf(nombre) !== i));
  return filas.split('\n').filter(Boolean).map((fila) => { const [id, tipos] = fila.split('|') as [string, string]; return { name: nombres.get(id) ?? '', types: tipos.split(',').filter(Boolean) }; })
    .filter((p) => p.name && !repetidos.has(p.name));
}

/** Un Pokémon distinto por casilla que cumpla su tipo (búsqueda con vuelta atrás); `null` si no hay reparto. */
function repartoBingo(tipos: readonly string[], pokemon: ReadonlyArray<{ name: string; types: string[] }>, fijos: ReadonlyMap<number, string> = new Map()): string[] | null {
  const reparto: string[] = [];
  const usados = new Set<string>(fijos.values());
  const colocar = (i: number): boolean => {
    if (i === tipos.length) return true;
    const fijo = fijos.get(i);
    if (fijo) { reparto[i] = fijo; return colocar(i + 1); }
    for (const p of pokemon) {
      if (usados.has(p.name) || !p.types.includes(tipos[i]!)) continue;
      usados.add(p.name); reparto[i] = p.name;
      if (colocar(i + 1)) return true;
      usados.delete(p.name);
    }
    return false;
  };
  return colocar(0) ? reparto : null;
}

/** Elige la casilla `indice` y busca `nombre` en el buscador de al lado (sin esperar la respuesta del servidor). */
async function elegirEnBingo(page: Page, indice: number, nombre: string): Promise<void> {
  await casillaBingo(page, indice).click();
  await expect(casillaBingo(page, indice)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bingo-cooldown')).toHaveCount(0, { timeout: 5_000 });
  await page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${indice + 1}` }).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/** Coloca `nombre` en la casilla `indice` (válido y sin moverlo de otra) y espera a verlo en ella. */
async function colocarEnBingo(page: Page, indice: number, nombre: string): Promise<void> {
  await elegirEnBingo(page, indice, nombre);
  // Con el bingo el tablero pasa a ser de solo lectura (sin nombre de botón): se mira el estado y el texto.
  await expect(casillaBingo(page, indice)).toHaveAttribute('data-filled', 'true', { timeout: 10_000 });
  await expect(casillaBingo(page, indice)).toContainText(nombre);
}

/** Configura Bingo: solo la Gen 1, solo la familia «Tipo», el tablero y el tiempo dados. */
async function configurarBingo(page: Page, { anchura, altura, soloTipo, teclasTiempo }: { anchura: number; altura: number; soloTipo: boolean; teclasTiempo: readonly string[] }): Promise<void> {
  await page.getByRole('tab', { name: 'Configuración' }).click();
  for (const [grupo, valor] of [['Anchura del tablero', anchura], ['Altura del tablero', altura]] as const) {
    const opcion = page.getByRole('radiogroup', { name: grupo }).getByRole('radio', { name: String(valor), exact: true });
    await opcion.click();
    await expect(opcion).toHaveAttribute('aria-checked', 'true');
  }
  if (soloTipo) {
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const familias = page.getByRole('group', { name: /^Familias: / }).getByRole('switch');
    for (let i = 0; i < await familias.count(); i++) {
      const familia = familias.nth(i);
      const tipo = (await familia.innerText()).trim() === 'Tipo';
      if ((await familia.getAttribute('aria-checked') === 'true') !== tipo) await familia.click();
      await expect(familia).toHaveAttribute('aria-checked', tipo ? 'true' : 'false');
    }
  }
  const tiempo = page.getByRole('slider', { name: 'Tiempo total' });
  await tiempo.focus();
  for (const tecla of teclasTiempo) await tiempo.press(tecla);
  await tiempo.blur();
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
}

/**
 * Pokémon Bingo jugado sin azar: un tablero 3×2 de la Gen 1 con solo la familia «Tipo» (cada casilla, «Tipo X») y 90 s.
 * Los Pokémon válidos salen de la BD (sus tipos) cruzados con el catálogo del buscador. Se prueba un fallo (la espera y
 * el anuncio), mover un Pokémon ya colocado con el diálogo (cancelar y confirmar), la búsqueda junto a la casilla, el
 * tablero de un rival en su diálogo, el bingo (cut-in, el ganador y «Saltar y continuar» del host) y la clasificación
 * con el tablero final y «Podías usar». A 390×844 la condición de la casilla elegida y el buscador se ven sin desplazar.
 */
test('pokemon-bingo: casillas con el buscador, un fallo, mover con diálogo, un rival, el bingo y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokémon Bingo');
    await configurarBingo(host.page, { anchura: 3, altura: 2, soloTipo: true, teclasTiempo: ['Home', 'ArrowRight'] });
    await expect(host.page.getByRole('alert').filter({ hasText: /familia|condiciones distintas/ })).toHaveCount(0);

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    const selectorPrimero = primero.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    await selectorPrimero;
    for (const { page } of jugadores) await expect(tableroBingo(page).locator('[data-bingo-cell]')).toHaveCount(6, { timeout: 20_000 });
    const pokemon = pokemonBingoEnBd(catalogo);
    const tipos = await tiposDeCasillas(host.page);
    const reparto = repartoBingo(tipos, pokemon);
    expect(reparto, `reparto para ${tipos.join(', ')}`).not.toBeNull();
    test.info().annotations.push({ type: 'bingo', description: `casillas: ${tipos.join(', ')} · reparto: ${reparto!.join(', ')}` });

    // A 390×844 sin desplazar: la condición de la casilla elegida y el buscador (en la placa pegada al fondo).
    const movil = segundo.page;
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    const condicion = movil.locator('#guess-plate-title');
    const tiposMovil = await tiposDeCasillas(movil);
    await expect(condicion).toHaveText(`Tipo ${Object.entries(TIPOS_BINGO).find(([, clave]) => clave === tiposMovil[0])![0]}`);
    await expect(condicion, 'condición de la casilla elegida a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('textbox', { name: 'Buscar Pokémon para la casilla 1' }), 'buscador a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    // Elegir otra casilla (más abajo en el tablero) cambia la condición de la placa, que sigue a la vista.
    await casillaBingo(movil, 5).click();
    await expect(condicion).toHaveText(`Tipo ${Object.entries(TIPOS_BINGO).find(([, clave]) => clave === tiposMovil[5])![0]}`);
    await expect(condicion).toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('textbox', { name: 'Buscar Pokémon para la casilla 6' })).toBeInViewport({ ratio: 1 });
    await movil.setViewportSize({ width: 1280, height: 720 });

    // Un fallo: un Pokémon sin el tipo de la primera casilla. Se ve la espera y la región viva lo dice una vez.
    const fallo = pokemon.find((p) => !p.types.includes(tipos[0]!))!.name;
    await elegirEnBingo(host.page, 0, fallo);
    await expect(host.page.getByTestId('bingo-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: new RegExp(`^Incorrecto: ${fallo} no cumple esta casilla\\. Hay una breve espera`) })).toHaveCount(1);
    await expect(host.page.getByTestId('pokemon-bingo-screen').locator('[aria-live]')).toHaveCount(1);
    await expect(host.page.getByTestId('bingo-feedback')).toHaveText(`${fallo} no cumple esta casilla.`, { timeout: 5_000 });
    await expect(casillaBingo(host.page, 0)).toHaveAttribute('data-filled', 'false');

    // Mover con el diálogo: un Pokémon que vale para dos casillas, colocado en la otra; si no hay, uno que no vale (el
    // servidor lo rechaza como un fallo y no se mueve).
    let origen = 0; let destino = 1; let movido = reparto![0]!; let valido = false;
    for (let j = 0; j < tipos.length && !valido; j++) {
      for (let i = 0; i < tipos.length; i++) {
        if (i !== j && pokemon.find((p) => p.name === reparto![j])!.types.includes(tipos[i]!)) { origen = i; destino = j; movido = reparto![j]!; valido = true; break; }
      }
    }
    test.info().annotations.push({ type: 'bingo', description: `mover ${movido} de la casilla ${origen + 1} a la ${destino + 1} (${valido ? 'válido' : 'no vale: fallo'})` });
    await colocarEnBingo(host.page, origen, movido);
    // Tras colocar, el buscador se vuelve a montar vacío y, con ratón o teclado (`pointer: fine`), toma el foco: el
    // jugador sigue escribiendo sin que caiga al `body`. En táctil no lo toma (abriría el teclado) y el foco va al
    // título de la placa (`bingoFocusKey`, cubierto en `PokemonBingoGame.test.tsx`).
    const buscador = host.page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${origen + 1}` });
    await expect(buscador, 'el foco no cae al body tras colocar').toBeFocused();
    await expect(buscador).toHaveValue('');
    await elegirEnBingo(host.page, destino, movido);
    const mover = host.page.getByRole('dialog', { name: `¿Mover a ${movido}?` });
    await expect(mover).toBeVisible();
    await expect(mover).toContainText(`${movido} ya está usado en «`);
    await expect(mover.getByRole('button', { name: 'Mover aquí' })).toBeFocused();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-mover', { sigue: mover });
    await mover.getByRole('button', { name: 'Cancelar' }).click();
    await expect(mover).toBeHidden();
    await expect(casillaBingo(host.page, origen)).toHaveAttribute('data-filled', 'true');
    await expect(casillaBingo(host.page, destino)).toHaveAttribute('data-filled', 'false');
    await host.page.getByRole('button', { name: movido, exact: true }).click();
    await expect(mover).toBeVisible();
    await mover.getByRole('button', { name: 'Mover aquí' }).click();
    await expect(mover).toBeHidden();
    if (valido) {
      await expect(casillaBingo(host.page, destino)).toHaveAttribute('data-filled', 'true', { timeout: 10_000 });
      await expect(casillaBingo(host.page, origen)).toHaveAttribute('data-filled', 'false');
    } else {
      await expect(host.page.getByTestId('bingo-cooldown')).toBeVisible({ timeout: 5_000 });
      await expect(casillaBingo(host.page, origen)).toHaveAttribute('data-filled', 'true');
    }

    // El resto del reparto (con lo ya colocado): todas menos la última, que se deja para la búsqueda.
    const colocados = new Map<number, string>([[valido ? destino : origen, movido]]);
    const resto = repartoBingo(tipos, pokemon, colocados);
    expect(resto, 'reparto con el Pokémon movido').not.toBeNull();
    const pendientes = resto!.map((nombre, i) => ({ nombre, i })).filter(({ i }) => !colocados.has(i));
    const ultima = pendientes.pop()!;
    for (const { nombre, i } of pendientes) await colocarEnBingo(host.page, i, nombre);
    // Quitar y volver a poner: «Quitar Pokémon» vacía la casilla elegida.
    const { nombre: quitado, i: casillaQuitada } = pendientes[0] ?? { nombre: movido, i: valido ? destino : origen };
    await casillaBingo(host.page, casillaQuitada).click();
    await host.page.getByRole('button', { name: 'Quitar Pokémon' }).click();
    await expect(casillaBingo(host.page, casillaQuitada)).toHaveAttribute('data-filled', 'false', { timeout: 10_000 });
    await colocarEnBingo(host.page, casillaQuitada, quitado);
    await expect(host.page.getByTestId('bingo-progress')).toHaveText('Tu progreso · 5/6');

    // Un rival coloca uno en su tablero; el anfitrión lo ve en su franja y abre su tablero.
    const tiposPrimero = await tiposDeCasillas(primero.page);
    const repartoPrimero = repartoBingo(tiposPrimero, pokemon)!;
    await colocarEnBingo(primero.page, 0, repartoPrimero[0]!);
    const franja = host.page.getByRole('button', { name: new RegExp(`^Ver tablero de ${primero.name}: 1/6 casillas$`) });
    await expect(franja).toBeVisible({ timeout: 10_000 });

    // El tablero con lo colocado y una casilla llena elegida («Actualmente: X» y «Quitar Pokémon»); después, la
    // búsqueda abierta junto a la última casilla, vacía.
    await casillaBingo(host.page, casillaQuitada).click();
    await expect(host.page.getByRole('button', { name: 'Quitar Pokémon' })).toBeVisible();
    await expect(host.page.getByText(`Actualmente: ${quitado}`, { exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-tablero');
    await casillaBingo(host.page, ultima.i).click();
    await host.page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${ultima.i + 1}` }).fill(ultima.nombre.slice(0, 3));
    await expect(host.page.getByRole('button', { name: ultima.nombre, exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-busqueda');
    await host.page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${ultima.i + 1}` }).fill('');

    await franja.click();
    const rival = host.page.getByRole('dialog', { name: `Tablero de ${primero.name}` });
    await expect(rival).toBeVisible();
    await expect(rival.locator('[data-bingo-cell]')).toHaveCount(6);
    await expect(rival.locator('[data-bingo-cell][data-filled="true"]')).toHaveCount(1);
    await expect(rival.getByText(repartoPrimero[0]!, { exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-rival', { sigue: rival });
    await rival.getByRole('button', { name: 'Cerrar' }).click();
    await expect(rival).toBeHidden();

    // El bingo: el cut-in, el ganador para todos, la cuenta atrás y «Saltar y continuar» solo para el host.
    await colocarEnBingo(host.page, ultima.i, ultima.nombre);
    const cutin = host.page.locator('[data-layer="cutin"]').filter({ hasText: '¡BINGO!' });
    await expect(cutin).toBeVisible({ timeout: 5_000 });
    await host.page.screenshot({ path: 'screenshots/juego-pokemon-bingo-cutin-1280x720.png', animations: 'disabled' });
    const ganador = host.page.getByRole('heading', { name: '¡Has completado tu tablero!' });
    await expect(ganador).toBeVisible();
    await expect(primero.page.getByRole('heading', { name: `${host.name} ha completado el tablero` })).toBeVisible();
    await expect(primero.page.getByText('El host puede continuar antes.', { exact: false })).toBeVisible();
    await expect(primero.page.getByRole('button', { name: 'Saltar y continuar' })).toHaveCount(0);
    await expect(cutin).toHaveCount(0, { timeout: 3_000 });
    await capturarAnotando(host.page, 'juego-pokemon-bingo-bingo', ganador);

    await host.page.getByRole('button', { name: 'Saltar y continuar' }).click();
    const clasificacion = host.page.getByRole('heading', { name: `Bingo de ${host.name}` });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/^6\/6 casillas · \d+ correctos? · \d+ fallos? · bingo en \d+:\d\d$/)).toHaveCount(1);
    await expect(host.page.getByText(/^\d\/6 casillas · \d+ correctos? · \d+ fallos?$/)).toHaveCount(2);
    // El tablero final de un rival: sus casillas vacías dicen qué valía.
    await host.page.getByRole('tab', { name: new RegExp(primero.name) }).click();
    await expect(host.page.getByRole('tabpanel').getByText('Podías usar').first()).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-bingo-clasificacion', { sigue: clasificacion });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Un tablero 5×5: cabe en escritorio sin scroll de página (el tablero se desplaza dentro de su panel) y en el móvil. */
test('pokemon-bingo: un tablero 5×5 cabe sin scroll de página', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Bingo');
    await configurarBingo(host.page, { anchura: 5, altura: 5, soloTipo: false, teclasTiempo: ['End'] });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    await expect(tableroBingo(host.page).locator('[data-bingo-cell]')).toHaveCount(25, { timeout: 20_000 });
    await capturarTamanos(host.page, 'juego-pokemon-bingo-5x5');
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      const scroll = await tableroBingo(host.page).evaluate((tablero) => { const cuerpo = tablero.parentElement!; return { alto: cuerpo.scrollHeight, visible: cuerpo.clientHeight }; });
      test.info().annotations.push({ type: 'bingo', description: `5×5 a ${w}×${h}: tablero ${scroll.alto}px en un panel de ${scroll.visible}px` });
      await expect(host.page.locator('#guess-plate-title'), `${w}×${h}: condición a la vista`).toBeInViewport({ ratio: 1 });
      await expect(host.page.getByRole('textbox', { name: 'Buscar Pokémon para la casilla 1' }), `${w}×${h}: buscador a la vista`).toBeInViewport({ ratio: 1 });
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Most Likely To con tres jugadores y una ronda, con un empate forzado: el host y A se votan entre sí y B no vota, así
 * que al agotarse los 45 s de la votación hay segunda vuelta solo entre el host y A. En ella A gana 2–1. Se comprueban
 * el secreto de las respuestas y los votos hasta la revelación (también tras recargar con el voto bloqueado), la
 * papeleta y su confirmación a la vista a 390×844, la región viva única y el recuento con sus dos vueltas.
 */
test('most-likely-to: elegir, votar con empate, segunda vuelta, revelación y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Most Likely To');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Número de rondas', ['Home'], '1'], ['Tiempo para votar', ['Home', ...Array<string>(30).fill('ArrowRight')], '45']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const papeleta = (page: Page) => page.getByTestId('ballot-options');
    const confirmar = (page: Page) => page.getByTestId('ballot-confirm');
    const opcion = (page: Page, pokemon: string, autor: Jugador) => page.getByRole('button', { name: `${pokemon}, respuesta de ${autor.name}` });
    const sinVotosAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin recuentos ni quién votó a quién`).not.toMatch(/\b\d+ votos?\b|Votos de|Primera vuelta|Ganadora/);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };

    // Elegir: A responde primero; el host ve que A ha respondido, pero no qué.
    await expect(titulo(host.page)).toHaveText('Elige tu respuesta', { timeout: 20_000 });
    await expect(host.page.getByTestId('social-prompt')).toBeVisible();
    await elegirPokemon(a.page, 'Pikachu');
    await expect(a.page.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
    // La respuesta guardada se dice en texto también a 390 (allí la placa del buscador no lleva kicker).
    await a.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await expect(a.page.getByText('Guardada', { exact: true })).toBeVisible();
    await a.page.setViewportSize({ width: 1280, height: 720 });
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Respondió');
    expect(await textoDeMain(host.page), 'elegir: sin la respuesta de A').not.toContain('Pikachu');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'juego-most-likely-to-elegir', { sigue: titulo(host.page).filter({ hasText: 'Elige tu respuesta' }) });
    await elegirPokemon(host.page, 'Bulbasaur');
    await elegirPokemon(b.page, 'Charmander');

    // Votar: el host vota a A y A al host; B no vota (la votación termina en empate por tiempo).
    await expect(titulo(b.page)).toHaveText('Votación', { timeout: 15_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    await opcion(host.page, 'Pikachu', a).click();
    await expect(opcion(host.page, 'Pikachu', a)).toHaveAttribute('aria-pressed', 'true');
    await confirmar(host.page).click();
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeFocused({ timeout: 5_000 });
    // Recargar con el voto bloqueado: el servidor lo devuelve y sigue sin haber votos ajenos.
    // La app ofrece «Volver a la sala» y vuelve antes de que venza la gracia de 8 s.
    await host.page.reload();
    await host.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await expect(opcion(host.page, 'Pikachu', a)).toHaveCount(0);
    await sinVotosAjenos(host.page, 'votación tras recargar');
    await opcion(a.page, 'Bulbasaur', host).click();
    await confirmar(a.page).click();
    await expect(a.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Votó');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Pendiente');
    await sinVotosAjenos(b.page, 'votación');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-most-likely-to-votacion', { sigue: titulo(b.page).filter({ hasText: 'Votación' }) });
    // A 390×844 sin desplazar: la pregunta, el plazo, la papeleta y su confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.getByTestId('social-prompt'), b.page.getByRole('timer'), b.page.locator('[aria-current="step"]')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, pregunta y plazo a la vista y sin tapar').toBe(true);
    }
    for (const carta of await papeleta(b.page).locator('[data-ballot-option]').all()) await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Segunda vuelta solo entre el host y A (empate 1–1): B ve dos opciones, ninguna suya.
    await expect(titulo(b.page)).toHaveText('Segunda vuelta', { timeout: 60_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(2);
    await expect(opcion(b.page, 'Pikachu', a)).toBeVisible();
    await expect(opcion(b.page, 'Bulbasaur', host)).toBeVisible();
    await expect(b.page.getByText('Charmander', { exact: true })).toHaveCount(0);
    await sinVotosAjenos(b.page, 'segunda vuelta');
    await capturarTamanos(b.page, 'juego-most-likely-to-segunda-vuelta', { sigue: titulo(b.page).filter({ hasText: 'Segunda vuelta' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    for (const carta of await papeleta(b.page).locator('[data-ballot-option]').all()) await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await opcion(b.page, 'Pikachu', a).click();
    await confirmar(b.page).click();
    await expect(b.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    // Recargar en la segunda vuelta con el voto bloqueado: vuelve bloqueado y sin votos de la primera vuelta ni ajenos.
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await expect(titulo(b.page)).toHaveText('Segunda vuelta');
    await sinVotosAjenos(b.page, 'segunda vuelta tras recargar');
    await opcion(host.page, 'Pikachu', a).click();
    await confirmar(host.page).click();
    await opcion(a.page, 'Bulbasaur', host).click();
    await confirmar(a.page).click();

    // Revelación: gana Pikachu de A con 2 votos tras la segunda vuelta; las dos vueltas a la vista, primero la que decide.
    await expect(titulo(host.page)).toHaveText('La respuesta favorita', { timeout: 15_000 });
    await expect(host.page.getByTestId('tally-summary')).toHaveText(`Gana Pikachu de ${a.name} con 2 votos tras la segunda vuelta.`);
    await expect(host.page.getByRole('heading', { name: 'Primera vuelta' })).toBeVisible();
    await expect(host.page.locator('[data-tally-round]').first()).toHaveAttribute('data-tally-round', '2');
    await expect(host.page.locator('[data-tally-round="2"]').getByTestId('tally-row')).toHaveCount(2);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Ganadora' })).toContainText(`Votos de`);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Ganadora' }).getByTestId('tally-voter')).toHaveCount(2);
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarAnotando(host.page, 'juego-most-likely-to-revelacion', titulo(host.page).filter({ hasText: 'La respuesta favorita' }));

    await expect(host.page.getByRole('heading', { name: 'Las respuestas favoritas' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 victoria · 1 en solitario · 0 compartidas · 2 votos recibidos · 1\/1 respuestas$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-most-likely-to-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Pokémon Red Flag con tres jugadores y una ronda, con un empate forzado: el host y A se votan entre sí y B no vota, así
 * que al agotarse los 45 s de la votación hay segunda vuelta solo entre las respuestas del host y de A. En ella A gana
 * 2–1. Se comprueban el anonimato (ni autores ni textos ajenos antes de su fase, también tras recargar), el campo con su
 * contador y «Bloquear respuesta» a la vista a 390×844 con el campo enfocado, una respuesta larga que se parte sin
 * romper las filas, la región viva única y el recuento con los autores y sus dos vueltas.
 */
test('pokemon-red-flag: escribir, votar anónimo con empate, segunda vuelta, revelación y clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'La Frase Pokémon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Número de rondas', ['Home'], '1'], ['Tiempo por fase', ['Home', ...Array<string>(30).fill('ArrowRight')], '45']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await expect(host.page.getByRole('radio', { name: 'Lo peor' })).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    // Una respuesta de 100 caracteres con una palabra muy larga: se parte sin romper la carta ni la franja.
    const textos = new Map<Jugador, string>([
      [host, `Siempre pide la cuenta a medias y luego dice que se dejó la cartera ${sala.code}`],
      [a, `Colecciona 300 calcetines desparejados supercalifragilisticoespialidosamenteapestosos ${sala.code}`.slice(0, 100)],
      [b, `Ronca como un Snorlax en la primera cita ${sala.code}`],
    ]);
    const nombres = jugadores.map((j) => j.name);
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const campo = (page: Page) => page.getByRole('textbox', { name: /^Tu frase para / });
    const enviar = (page: Page) => page.getByTestId('red-flag-send');
    const papeleta = (page: Page) => page.getByTestId('ballot-options');
    const confirmar = (page: Page) => page.getByTestId('ballot-confirm');
    const opcion = (page: Page, autor: Jugador) => papeleta(page).locator('[data-ballot-option]').filter({ hasText: textos.get(autor)! }).getByRole('button');
    const escribir = async (jugador: Jugador) => {
      await campo(jugador.page).fill(textos.get(jugador)!);
      await enviar(jugador.page).click();
      await expect(jugador.page.getByRole('heading', { name: 'Respuesta bloqueada' })).toBeVisible({ timeout: 5_000 });
    };
    const sinVotosAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin recuentos ni quién votó a quién`).not.toMatch(/\b\d+ votos?\b|Votos de|Primera vuelta|ganadora|Autores revelados/);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };
    /** La papeleta es anónima: ningún nombre de jugador ni imagen dentro de las opciones. */
    const anonima = async (page: Page, fase: string) => {
      const texto = await papeleta(page).evaluate((el) => [(el as HTMLElement).innerText, ...[...el.querySelectorAll('[alt], [title], [aria-label]')].map((n) => `${n.getAttribute('alt') ?? ''} ${n.getAttribute('title') ?? ''} ${n.getAttribute('aria-label') ?? ''}`)].join('\n'));
      for (const nombre of nombres) expect(texto, `${fase}: la papeleta no dice que ${nombre} escribió nada`).not.toContain(nombre);
      await expect(papeleta(page).locator('img')).toHaveCount(0);
    };

    // Escribir: A envía primero; el host ve que A está listo, pero no qué escribió.
    await expect(titulo(host.page)).toHaveText('Escribe su peor frase', { timeout: 20_000 });
    await expect(host.page.getByTestId('social-prompt')).toContainText('¿Qué detalle negativo de');
    await expect(host.page.getByText('0 / 100')).toBeVisible();
    await escribir(a);
    await expect(a.page.getByText(textos.get(a)!)).toBeVisible();
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Listo');
    expect(await textoDeMain(host.page), 'escribir: sin la respuesta de A').not.toContain(textos.get(a)!);
    await campo(host.page).fill(textos.get(host)!);
    await expect(host.page.getByText(`${textos.get(host)!.length} / 100`)).toBeVisible();
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'juego-pokemon-red-flag-escribir', { sigue: titulo(host.page).filter({ hasText: 'Escribe su peor frase' }) });
    // A 390×844 con el campo enfocado (como con el teclado abierto): el campo y «Bloquear respuesta» siguen a la vista.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await campo(b.page).focus();
    await expect(campo(b.page)).toBeFocused();
    await expect(campo(b.page)).toBeInViewport({ ratio: 1 });
    await campo(b.page).fill(textos.get(b)!);
    await expect(enviar(b.page)).toBeInViewport({ ratio: 1 });
    await expect(b.page.getByText(`${textos.get(b)!.length} / 100`)).toBeInViewport();
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await enviar(host.page).click();
    await enviar(b.page).click();

    // Votar: el host vota la de A y A la del host; B no vota (la votación termina en empate por tiempo).
    await expect(titulo(b.page)).toHaveText('Votación', { timeout: 15_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    for (const jugador of jugadores) await anonima(jugador.page, `votación (${jugador.name})`);
    await expect(papeleta(b.page).getByText('Tu respuesta')).toHaveCount(1);
    await opcion(host.page, a).click();
    await expect(opcion(host.page, a)).toHaveAttribute('aria-pressed', 'true');
    await confirmar(host.page).click();
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeFocused({ timeout: 5_000 });
    // Recargar con el voto bloqueado: el servidor lo devuelve y sigue sin autores ni votos ajenos.
    await host.page.reload();
    await host.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await anonima(host.page, 'votación tras recargar');
    await sinVotosAjenos(host.page, 'votación tras recargar');
    await opcion(a.page, host).click();
    await confirmar(a.page).click();
    await expect(a.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Listo');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Votando…');
    await sinVotosAjenos(b.page, 'votación');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-pokemon-red-flag-votacion', { sigue: titulo(b.page).filter({ hasText: 'Votación' }) });
    // A 390×844 sin desplazar: la fase, la consigna, el plazo y la confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.getByTestId('social-prompt'), b.page.getByRole('timer'), b.page.locator('[aria-current="step"]')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, consigna y plazo a la vista y sin tapar').toBe(true);
    }
    await expect(papeleta(b.page).locator('[data-ballot-option]').first()).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Segunda vuelta solo entre las del host y A (empate 1–1): B ve dos opciones, ninguna suya.
    await expect(titulo(b.page)).toHaveText('Segunda vuelta', { timeout: 60_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(2);
    await expect(opcion(b.page, a)).toBeVisible();
    await expect(opcion(b.page, host)).toBeVisible();
    await expect(papeleta(b.page).getByText(textos.get(b)!)).toHaveCount(0);
    await anonima(b.page, 'segunda vuelta');
    await sinVotosAjenos(b.page, 'segunda vuelta');
    await capturarTamanos(b.page, 'juego-pokemon-red-flag-segunda-vuelta', { sigue: titulo(b.page).filter({ hasText: 'Segunda vuelta' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await opcion(b.page, a).click();
    await confirmar(b.page).click();
    await expect(b.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    await opcion(host.page, a).click();
    await confirmar(host.page).click();
    await opcion(a.page, host).click();
    await confirmar(a.page).click();

    // Revelación: gana la de A con 2 votos tras la segunda vuelta; ahora sí, con los autores.
    await expect(titulo(host.page)).toHaveText('La frase de la ronda', { timeout: 15_000 });
    await expect(host.page.getByTestId('tally-summary')).toHaveText(`Gana ${a.name} con 2 votos tras la segunda vuelta.`);
    await expect(host.page.locator('[data-tally-round]').first()).toHaveAttribute('data-tally-round', '2');
    await expect(host.page.locator('[data-tally-round="2"]').getByTestId('tally-row')).toHaveCount(2);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Frase ganadora' })).toContainText(textos.get(a)!);
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarAnotando(host.page, 'juego-pokemon-red-flag-revelacion', titulo(host.page).filter({ hasText: 'La frase de la ronda' }));

    await expect(host.page.getByRole('heading', { name: 'Las frases más votadas' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 victoria · 1 en solitario · 0 compartidas · 2 votos recibidos · 1\/1 respuestas$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-red-flag-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Would You Rather con tres jugadores y una ronda: el host elige con el atajo `1`, los demás con las cartas; la mayoría es
 * A (2–1). Se comprueban el secreto de las papeletas hasta la revelación (también tras recargar con la papeleta
 * bloqueada), el foco en «Papeleta bloqueada», el dilema, la predicción y «Bloquear papeleta» a la vista a 390×844, la
 * región viva única y el recuento con quién eligió qué.
 */
test('would-you-rather: atajos, papeleta secreta, revelación y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Would You Rather Pokémon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const opcion = (page: Page, letra: 'A' | 'B') => page.getByTestId('choice-options').locator(`[data-choice-option="${letra}"]`).getByRole('button');
    const mayoria = (page: Page, letra: 'A' | 'B') => page.getByRole('button', { name: `Mayoría ${letra}`, exact: true });
    const confirmar = (page: Page) => page.getByTestId('wyr-confirm');
    const bloqueada = (page: Page) => page.getByRole('heading', { name: 'Papeleta bloqueada' });
    const sinPapeletasAjenas = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin elecciones ni recuentos ajenos`).not.toMatch(/Eligió [AB]|Predijo|\b\d+ votos?\b|Votos de|papeletas\./);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };

    // Papeleta: el host elige A con la tecla 1 (fuera de cualquier campo) y la mayoría A con su botón.
    await expect(titulo(host.page)).toHaveText('¿Qué preferirías?', { timeout: 20_000 });
    await expect(opcion(host.page, 'A')).toHaveAttribute('aria-keyshortcuts', '1');
    await host.page.locator('body').press('1');
    await expect(opcion(host.page, 'A')).toHaveAttribute('aria-pressed', 'true');
    await host.page.locator('body').press('2');
    await expect(opcion(host.page, 'B')).toHaveAttribute('aria-pressed', 'true');
    await host.page.locator('body').press('1');
    await expect(opcion(host.page, 'A')).toHaveAttribute('aria-pressed', 'true');
    await expect(confirmar(host.page)).toBeDisabled();
    await mayoria(host.page, 'A').click();
    await expect(mayoria(host.page, 'A')).toHaveAttribute('aria-pressed', 'true');
    await expect(confirmar(host.page)).toBeEnabled();

    // A elige A y predice B; su papeleta se bloquea y el foco va al título de la placa.
    await opcion(a.page, 'A').click();
    await mayoria(a.page, 'B').click();
    await confirmar(a.page).click();
    await expect(bloqueada(a.page)).toBeFocused({ timeout: 5_000 });
    await expect(a.page.getByTestId('choice-options').getByRole('button')).toHaveCount(0);
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Lista');
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Pensando…');
    await sinPapeletasAjenas(host.page, 'papeleta');
    // Recargar con la papeleta bloqueada: el servidor devuelve solo la propia.
    await a.page.reload();
    await a.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(bloqueada(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(a.page.getByText('Elegiste A y predijiste B.', { exact: false })).toBeVisible();
    await sinPapeletasAjenas(a.page, 'papeleta tras recargar');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'juego-would-you-rather-papeleta', { sigue: titulo(host.page).filter({ hasText: '¿Qué preferirías?' }) });
    await capturarTamanos(a.page, 'juego-would-you-rather-bloqueada', { sigue: bloqueada(a.page) });
    // A 390×844 sin desplazar: la fase, el plazo, las dos opciones, la predicción y la confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const objetivo of [b.page.locator('[aria-current="step"]'), b.page.getByRole('timer'), opcion(b.page, 'A'), opcion(b.page, 'B'), mayoria(b.page, 'A'), mayoria(b.page, 'B'), confirmar(b.page)]) {
      await expect(objetivo).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(objetivo), 'a 390: todo lo de la papeleta a la vista y sin tapar').toBe(true);
    }
    await opcion(b.page, 'B').click();
    await mayoria(b.page, 'A').click();
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await confirmar(b.page).click();
    await expect(bloqueada(b.page)).toBeVisible({ timeout: 5_000 });
    await confirmar(host.page).click();

    // Revelación: la mayoría es A (2 de 3); cada opción con su barra y quién la eligió.
    await expect(titulo(host.page)).toHaveText('La mayoría eligió A', { timeout: 15_000 });
    await expect(host.page.getByTestId('tally-summary')).toHaveText('La mayoría eligió A con 2 de 3 papeletas.');
    await expect(host.page.getByTestId('tally-row')).toHaveCount(2);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Mayoría' })).toContainText(`Votos de`);
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Eligió A · Predijo B');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarAnotando(host.page, 'juego-would-you-rather-revelacion', titulo(host.page).filter({ hasText: 'La mayoría eligió A' }));

    await expect(host.page.getByRole('heading', { name: 'Quien mejor leyó la sala' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 predicción · 1 en mayoría · 1\/1 papeletas · 1 ronda perfecta$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-would-you-rather-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Retiene en la página las tramas que manda el servidor por el `/ws` después de la primera que cumpla `cuando` (esa sí
 * llega) hasta `soltar()`: así una fase que dura poco (la revelación de elecciones, ~650 ms por jugador; el resultado de la
 * ronda, 6 s) se queda en pantalla para las capturas. Lo que manda la página siempre llega al servidor. Instálalo antes de
 * que la página abra el `/ws` (y recárgala): `page.routeWebSocket` solo intercepta conexiones nuevas.
 */
async function tramasRetenibles(page: Page): Promise<{ retenerDesde(cuando: (payload: string) => boolean): void; retenida(): boolean; soltar(): void }> {
  let cuando: ((payload: string) => boolean) | null = null;
  let reteniendo = false;
  let retenidas: Array<string | Buffer> = [];
  let pagina: { send(message: string | Buffer): void } | null = null;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    pagina = ws;
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (reteniendo) { retenidas.push(message); return; }
      ws.send(message);
      // La que cumple `cuando` sí llega: la página pinta esa fase y se queda en ella.
      if (cuando?.(String(message))) { reteniendo = true; cuando = null; }
    });
  });
  return {
    retenerDesde(predicado) { cuando = predicado; },
    retenida: () => reteniendo,
    soltar() {
      reteniendo = false;
      for (const message of retenidas) pagina?.send(message);
      retenidas = [];
    },
  };
}

/** Lo que el test lee del estado público de One of Us Is Fake. */
interface FakeVisible {
  phase: string;
  revealedChoices: Array<{ playerId: string }>;
}

/**
 * One of Us Is Fake con tres jugadores y una ronda. Cada página ve solo su categoría: la que difiere es la del fake (la
 * suya no está en el DOM de los demás, ni la de ellos en el suyo). En el debate votan en círculo (empate a 1 entre los
 * tres): hay segunda vuelta con todos; en ella los dos normales votan al fake y sale con 2 votos. Para las capturas de
 * la revelación de elecciones y del resultado (fases cortas), la página de B retiene las tramas del servidor. Se
 * comprueban el secreto de los votos (también tras recargar), el foco en «Voto bloqueado», la papeleta y la fase a la
 * vista a 390×844, la región viva única, el recuento con sus dos vueltas y la clasificación.
 */
test('one-of-us-is-fake: categoría secreta, revelación, debate con empate, segunda vuelta, el fake y clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'One of Us Is Fake');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await expect(host.page.getByRole('switch', { name: 'El fake sabe que es fake' })).not.toBeChecked();
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (para congelar las fases cortas) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const papeleta = (page: Page) => page.getByTestId('ballot-options');
    const confirmar = (page: Page) => page.getByTestId('ballot-confirm');
    /** Vota y confirma; salvo el último voto de la vuelta (que la cierra al instante), espera a «Voto bloqueado». */
    const votar = async (votante: Jugador, objetivo: Jugador, ultimo = false) => {
      await papeleta(votante.page).getByRole('button', { name: objetivo.name, exact: true }).click();
      await confirmar(votante.page).click();
      if (!ultimo) await expect(votante.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    };
    const sinVotosAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin recuentos ni quién votó a quién`).not.toMatch(/\b\d+ votos?\b|Votos de|Primera vuelta|Más votado|El fake era/);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };

    // Elegir: cada página lee su categoría; la que difiere es la del fake (sin «El fake sabe», nadie lo dice).
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('Elige tu Pokémon', { timeout: 20_000 });
    const categorias = new Map<Jugador, string>();
    for (const jugador of jugadores) categorias.set(jugador, (await jugador.page.getByTestId('social-prompt').innerText()).trim());
    const fake = jugadores.find((j) => jugadores.filter((otro) => categorias.get(otro) === categorias.get(j)).length === 1);
    expect(fake, `una categoría distinta: ${[...categorias.values()].join(' | ')}`).toBeDefined();
    const normales = jugadores.filter((j) => j !== fake);
    const variante = categorias.get(fake!)!;
    const principal = categorias.get(normales[0]!)!;
    expect(categorias.get(normales[1]!)).toBe(principal);
    for (const { page } of normales) expect(await page.content(), 'la categoría del fake no está en el DOM de un normal').not.toContain(variante);
    expect(await fake!.page.content(), 'la categoría del grupo no está en el DOM del fake').not.toContain(principal);
    for (const { page } of jugadores) await expect(page.getByText('Eres el fake')).toHaveCount(0);
    await elegirPokemon(a.page, 'Pikachu');
    await expect(a.page.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Eligió');
    expect(await textoDeMain(host.page), 'elegir: sin la elección de A').not.toContain('Pikachu');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(fake!.page, 'juego-one-of-us-is-fake-elegir', { sigue: titulo(fake!.page).filter({ hasText: 'Elige tu Pokémon' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const objetivo of [b.page.getByTestId('social-prompt'), b.page.getByRole('textbox', { name: 'Buscar Pokémon para tu categoría' })]) await expect(objetivo).toBeInViewport();
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Revelación: B retiene las tramas desde que hay dos de tres elecciones a la vista.
    await elegirPokemon(b.page, 'Charmander');
    retenedor.retenerDesde((payload) => {
      const estado = juegoEnTrama<FakeVisible>(payload, 'one-of-us-is-fake');
      return estado?.phase === 'CHOICE_REVEAL' && estado.revealedChoices.length >= 2;
    });
    await elegirPokemon(host.page, 'Bulbasaur');
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText('Las elecciones');
    await expect(b.page.getByText('Elecciones reveladas: 2 de 3')).toBeVisible();
    await expect(b.page.getByTestId('fake-choices').getByText('Por revelar')).toHaveCount(1);
    await sinVotosAjenos(b.page, 'revelación');
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-revelar-elecciones', { sigue: titulo(b.page).filter({ hasText: 'Las elecciones' }) });
    retenedor.soltar();

    // Debate: las tres elecciones en cartas y la papeleta con los otros dos (la propia, fija).
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('¿Quién es el fake?', { timeout: 15_000 });
    for (const [jugador, pokemon] of [[host, 'Bulbasaur'], [a, 'Pikachu'], [b, 'Charmander']] as const) await expect(b.page.getByTestId('fake-choices').getByRole('listitem').filter({ hasText: jugador.name })).toContainText(pokemon);
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    await expect(papeleta(b.page).getByText('Eres tú')).toHaveCount(1);
    await expect(b.page.getByTestId('fake-category')).toContainText(categorias.get(b)!);
    await sinVotosAjenos(b.page, 'debate');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-debate', { sigue: titulo(b.page).filter({ hasText: '¿Quién es el fake?' }) });
    // A 390×844 sin desplazar: la fase, el plazo, la categoría, la papeleta y su confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.locator('[aria-current="step"]'), b.page.getByRole('timer'), b.page.getByTestId('fake-category')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, plazo y categoría a la vista y sin tapar').toBe(true);
    }
    for (const carta of await papeleta(b.page).locator('[data-ballot-option]').all()) await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Votación en círculo (host → A → B → host): el host vota, el foco va a «Voto bloqueado» y recarga.
    await papeleta(host.page).getByRole('button', { name: a.name, exact: true }).click();
    await confirmar(host.page).click();
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeFocused({ timeout: 5_000 });
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Votó');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Votando…');
    await capturarTamanos(host.page, 'juego-one-of-us-is-fake-votacion', { sigue: host.page.getByRole('heading', { name: 'Voto bloqueado' }) });
    await host.page.reload();
    await host.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await sinVotosAjenos(host.page, 'debate tras recargar');
    await votar(a, b);
    await votar(b, host, true);

    // Segunda vuelta con los tres (empate a 1): los normales votan al fake y el fake a un normal.
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('Segunda vuelta', { timeout: 15_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    await expect(b.page.locator('[data-phase="revote"]')).toHaveAttribute('aria-current', 'step');
    await sinVotosAjenos(b.page, 'segunda vuelta');
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-segunda-vuelta', { sigue: titulo(b.page).filter({ hasText: 'Segunda vuelta' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });
    // B retiene el resultado de la ronda (6 s) para capturarlo.
    retenedor.retenerDesde((payload) => juegoEnTrama<FakeVisible>(payload, 'one-of-us-is-fake')?.phase === 'ROUND_RESULTS');
    for (const normal of normales) await votar(normal, fake!);
    await votar(fake!, normales[0]!, true);

    // Resultado: sale el fake con 2 votos tras la segunda vuelta; el fake y las dos categorías, a la vista.
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText('Ganan los normales', { timeout: 5_000 });
    await expect(b.page.getByTestId('fake-player')).toHaveText(fake!.name);
    await expect(b.page.getByTestId('tally-summary')).toHaveText(`Sale ${fake!.name} con 2 votos tras la segunda vuelta. ${fake!.name} era el fake.`);
    await expect(b.page.getByText(variante, { exact: true })).toBeVisible();
    await expect(b.page.getByText(principal, { exact: true })).toBeVisible();
    await expect(b.page.locator('[data-tally-round]').first()).toHaveAttribute('data-tally-round', '2');
    await expect(b.page.getByTestId('tally-row').filter({ hasText: 'Más votado' })).toContainText('Votos de');
    await expect(b.page.getByTestId('tally-row').filter({ hasText: 'Más votado' })).toContainText('Fake');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-revelacion', { sigue: titulo(b.page).filter({ hasText: 'Ganan los normales' }) });
    retenedor.soltar();

    // Clasificación: el fake, descubierto, sin votos correctos (no puede votarse) y sin puntos.
    await expect(host.page.getByRole('heading', { name: 'Una partida de sospechas' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^0 victorias como normal · 0 como fake · 0 votos correctos · fake 1 vez · 1 descubierto$/)).toHaveCount(1);
    await expect(host.page.getByText(/^1 victoria como normal · 0 como fake · [12] votos? correctos? · fake 0 veces · 0 descubiertos$/)).toHaveCount(2);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-one-of-us-is-fake-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Secret Ranking con tres jugadores y una ronda. El host ordena con el teclado (Intro en «Bajar X» y «Subir X»): cada
 * movimiento se anuncia una vez en la región viva («X pasa al puesto N.») y el foco sigue al Pokémon movido, también
 * cuando llega al extremo y su botón se deshabilita (pasa al contrario). A y B bloquean el orden de la ronda tal cual y
 * el host el suyo (el primero, al cuarto puesto): A y B empatan en cabeza a distancia 3 y el host queda a 6. Se
 * comprueban el secreto de los órdenes (también tras recargar), el foco en «Ranking bloqueado», la lista y «Bloquear
 * ranking» a la vista a 390×844, la región viva única, la revelación (B retiene sus tramas: dura 8 s) y la clasificación.
 */
test('secret-ranking: ordenar con teclado, ranking secreto, revelación del consenso y clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Secret Ranking');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    // Ajustes con los controles del catálogo, a los tres tamaños (el panel del lobby se desplaza: se lleva a la vista).
    const ajustes = host.page.getByRole('slider', { name: 'Tiempo para ordenar' });
    await expect(host.page.getByRole('switch', { name: 'Incluir formas alternativas' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await ajustes.scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-secret-ranking-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 8 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const lista = (page: Page) => page.getByTestId('ranking-list');
    const orden = (page: Page) => lista(page).locator('[data-ranking-item]').evaluateAll((items) => items.map((item) => item.querySelector('[title]')?.getAttribute('title') ?? ''));
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const bloquear = (page: Page) => page.getByTestId('ranking-submit');
    const bloqueado = (page: Page) => page.getByRole('heading', { name: 'Ranking bloqueado', level: 2 });
    const sinOrdenesAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin distancias, consenso ni órdenes ajenos`).not.toMatch(/Distancia|Posición media|Orden de|Cercanía|No envió ranking/);
      await expect(page.getByTestId('ranking-players')).toHaveCount(0);
      await expect(page.getByTestId('ranking-closeness')).toHaveCount(0);
    };

    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('Ordena el ranking', { timeout: 20_000 });
    const inicial = await orden(host.page);
    expect(inicial, 'cinco Pokémon distintos').toHaveLength(5);
    expect(new Set(inicial).size).toBe(5);
    for (const { page } of invitados) expect(await orden(page), 'todos reciben la misma lista').toEqual(inicial);
    const [p1, p2, p3, p4, p5] = inicial as [string, string, string, string, string];
    await expect(viva(host.page)).toHaveCount(1);
    await expect(host.page.getByRole('button', { name: `Subir ${p1}` })).toBeDisabled();
    await expect(host.page.getByRole('button', { name: `Bajar ${p5}` })).toBeDisabled();

    // Teclado: el host baja el primero con Intro; el foco sigue en «Bajar» del mismo Pokémon en su nuevo puesto.
    await host.page.getByRole('button', { name: `Bajar ${p1}` }).focus();
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 2.`);
    await expect(host.page.getByRole('button', { name: `Bajar ${p1}` })).toBeFocused();
    expect(await orden(host.page)).toEqual([p2, p1, p3, p4, p5]);
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 3.`);
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 4.`);
    await host.page.keyboard.press('Enter');
    // En el último puesto «Bajar» se deshabilita: el foco pasa a «Subir» del mismo Pokémon, nunca al `body`.
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 5.`);
    await expect(host.page.getByRole('button', { name: `Bajar ${p1}` })).toBeDisabled();
    await expect(host.page.getByRole('button', { name: `Subir ${p1}` })).toBeFocused();
    await host.page.keyboard.press('Enter');
    await expect(viva(host.page)).toContainText(`${p1} pasa al puesto 4.`);
    await expect(host.page.getByRole('button', { name: `Subir ${p1}` })).toBeFocused();
    const delHost = [p2, p3, p4, p1, p5];
    expect(await orden(host.page)).toEqual(delHost);
    // Con el puntero también: el host sube y vuelve a bajar el segundo.
    await host.page.getByRole('button', { name: `Subir ${p3}` }).click();
    expect(await orden(host.page)).toEqual([p3, p2, p4, p1, p5]);
    await host.page.getByRole('button', { name: `Bajar ${p3}` }).click();
    expect(await orden(host.page)).toEqual(delHost);
    await expect(viva(host.page)).toHaveCount(1);

    // A bloquea el orden de la ronda tal cual: el foco va al título de la placa y el host ve «Listo», no el orden.
    await bloquear(a.page).click();
    await expect(bloqueado(a.page)).toBeFocused({ timeout: 5_000 });
    await expect(lista(a.page).getByRole('button')).toHaveCount(0);
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Listo');
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Ordenando…');
    await sinOrdenesAjenos(host.page, 'ordenar');
    expect(await orden(host.page), 'el host sigue viendo su orden, no el de A').toEqual(delHost);
    // Recargar con el ranking bloqueado: el servidor devuelve solo el propio.
    await a.page.reload();
    await a.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(bloqueado(a.page)).toBeVisible({ timeout: 15_000 });
    expect(await orden(a.page)).toEqual(inicial);
    await sinOrdenesAjenos(a.page, 'bloqueado tras recargar');
    await capturarTamanos(host.page, 'juego-secret-ranking-ordenar', { sigue: titulo(host.page).filter({ hasText: 'Ordena el ranking' }) });
    await capturarTamanos(a.page, 'juego-secret-ranking-espera', { sigue: bloqueado(a.page) });

    // A 390×844 sin desplazar: la fase, el plazo, la pregunta, los cinco Pokémon con sus botones y «Bloquear ranking».
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.locator('[aria-current="step"]'), b.page.getByRole('timer'), b.page.getByTestId('social-prompt')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, plazo y pregunta a la vista y sin tapar').toBe(true);
    }
    for (const nombre of inicial) {
      for (const boton of [b.page.getByRole('button', { name: `Subir ${nombre}` }), b.page.getByRole('button', { name: `Bajar ${nombre}` })]) {
        await expect(boton).toBeInViewport({ ratio: 1 });
        expect(await sinTapar(boton), `a 390: los botones de ${nombre} a la vista y sin tapar`).toBe(true);
      }
    }
    await expect(bloquear(b.page)).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(bloquear(b.page)), 'a 390: «Bloquear ranking» sin tapar').toBe(true);
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await bloquear(b.page).click();
    await expect(bloqueado(b.page)).toBeVisible({ timeout: 5_000 });

    // B retiene la revelación (8 s) para capturarla; el host cierra la ronda.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'secret-ranking')?.phase === 'ROUND_RESULTS');
    await bloquear(host.page).click();
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText('El consenso del grupo', { timeout: 5_000 });
    await expect(viva(b.page)).toHaveText(/^Ronda 1 terminada\. Empate en cabeza entre .+ y .+, a distancia 3,00\.$/);
    await expect(b.page.getByTestId('ranking-consensus').getByRole('listitem')).toHaveCount(5);
    await expect(b.page.getByTestId('ranking-player')).toHaveCount(3);
    await expect(b.page.getByRole('list', { name: `Orden de ${host.name}` })).toContainText(`4. ${p1}`);
    // El puesto que dio cada uno, en texto, en la franja del consenso de P1.
    await expect(b.page.getByTestId('ranking-consensus').getByRole('listitem').filter({ hasText: p1 }).getByTestId('ranking-positions')).toContainText(`${host.name} 4.º`);
    const cercania = (jugador: Jugador) => b.page.getByTestId('ranking-closeness').filter({ hasText: jugador.name });
    for (const jugador of [a, b]) {
      await expect(cercania(jugador)).toContainText('El más cercano');
      await expect(cercania(jugador)).toContainText('Distancia 3,00');
    }
    await expect(cercania(host)).toContainText('Distancia 6,00');
    await expect(cercania(host)).toContainText('3.º puesto');
    // La barra es decorativa (la distancia ya va en texto): se busca por su etiqueta, no por el árbol accesible.
    await expect(cercania(host).locator(`[role="meter"][aria-label="Cercanía de ${host.name}"]`)).toHaveCount(1);
    await expect(viva(b.page)).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-secret-ranking-revelacion', { sigue: titulo(b.page).filter({ hasText: 'El consenso del grupo' }) });
    retenedor.soltar();

    // Clasificación: A y B empatan con más puntos que el host; métricas en texto.
    await expect(host.page.getByRole('heading', { name: 'La mente más sincronizada', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 victoria · 0 coincidencias perfectas · 1\/1 rankings · distancia media 3,00$/)).toHaveCount(2);
    await expect(host.page.getByText(/^0 victorias · 0 coincidencias perfectas · 1\/1 rankings · distancia media 6,00$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-secret-ranking-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Un nombre como palabra suelta (sin letras pegadas), para buscar el secreto de Taboo en el DOM. */
const comoPalabra = (nombre: string) => new RegExp(`(^|[^\\p{L}])${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u');

/**
 * PokéTaboo con tres jugadores y una vuelta (tres turnos: uno por jugador). En el primero, quien describe (la página que
 * pinta el secreto) lee su Pokémon y sus palabras prohibidas; el campo no deja enviar una pista con el nombre y lo dice;
 * envía dos pistas (con Intro y con la píldora, el foco vuelve al campo). El secreto no está en el DOM de los demás. Uno
 * de los que adivinan falla una vez y luego acierta; la revelación (4 s) se retiene en la página de B para las capturas.
 * Los otros dos turnos se resuelven acertando a la primera. Se capturan quien describe, quien adivina, la lista de
 * pistas, la revelación y la clasificación a los tres tamaños, con el campo y «Enviar pista» a la vista a 390×844.
 */
test('poke-taboo: secreto con palabras prohibidas, pistas, un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'PokéTaboo');
    // Ajustes del catálogo: 120 s por turno (los cinco tiempos del motor), una vuelta y las formas regionales.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('radio', { name: '120 s' }).click();
    await expect(host.page.getByRole('radio', { name: '120 s' })).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('slider', { name: 'Vueltas' })).toHaveValue('1');
    await expect(host.page.getByRole('switch', { name: 'Formas regionales' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.getByRole('slider', { name: 'Vueltas' }).scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-poke-taboo-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 4 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const secretoEn = (page: Page) => page.getByTestId('taboo-secret');
    const campo = (page: Page) => page.getByRole('textbox', { name: 'Pista para los que adivinan' });
    const enviar = (page: Page) => page.getByTestId('taboo-hint-send');
    const pistas = (page: Page) => page.getByTestId('taboo-hint');
    /** Quien describe el turno `n`: la única página que pinta el secreto con esa insignia. */
    const turno = async (n: number) => {
      for (const page of paginas) await expect(page.getByText(`Turno ${n} de 3 · Vuelta 1 de 1`)).toBeVisible({ timeout: 20_000 });
      const descriptora = await primeraVisible(paginas, (page) => secretoEn(page));
      const prohibidas = await descriptora.getByTestId('taboo-forbidden').getByRole('listitem').allInnerTexts();
      return { descriptora, secreto: prohibidas[0]!.trim(), prohibidas: prohibidas.map((p) => p.trim()), otras: paginas.filter((page) => page !== descriptora) as [Page, Page] };
    };

    // Turno 1: quien describe ve su secreto; los demás, no (ni en el DOM).
    const { descriptora, secreto, prohibidas, otras } = await turno(1);
    const [g1, g2] = otras;
    await expect(titulo(descriptora)).toHaveText('Describe tu Pokémon');
    await expect(titulo(g1)).toHaveText(`¿Qué Pokémon describe ${nombreDe(descriptora)}?`);
    for (const page of otras) {
      await expect(secretoEn(page)).toHaveCount(0);
      const html = await page.content();
      expect(html, 'el DOM de quien adivina no tiene el secreto').not.toMatch(comoPalabra(secreto));
      expect(html).not.toContain('Palabras prohibidas');
      expect(html).not.toContain('Total de stats');
    }
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);
    await expect(g1.getByText('La descripción se escucha fuera del juego')).toBeVisible();
    await capturarTamanos(g1, 'juego-poke-taboo-adivinar', { sigue: titulo(g1).filter({ hasText: '¿Qué Pokémon describe' }) });

    // La pista con el nombre no sale: la ayuda del campo lo dice, la región viva también, y «Enviar pista» no envía.
    await campo(descriptora).fill(`Se parece mucho a ${secreto}`);
    await expect(descriptora.locator('form').getByText(`Tu pista contiene «${prohibidas[0]!}», que está prohibida: cámbiala para enviarla.`)).toBeVisible();
    await expect(viva(descriptora)).toContainText('está prohibida');
    await expect(enviar(descriptora)).toBeDisabled();
    // Dos pistas: con Intro y con la píldora; tras cada una el campo se vacía y conserva el foco (nunca cae al `body`).
    const pista = async (texto: string, cifras: string) => {
      await campo(descriptora).fill(texto);
      // Si el texto contiene por casualidad un nombre corto (Natu, Abra, Muk…), el campo lo avisa: se usan cifras.
      if (await descriptora.locator('form').getByText(/que está prohibida/).isVisible()) await campo(descriptora).fill(cifras);
      return (await campo(descriptora).inputValue()).trim();
    };
    const primera = await pista('Lo verías en un combate de exhibición', 'Pista 1: 1234567890');
    await campo(descriptora).press('Enter');
    await expect(campo(descriptora)).toHaveValue('', { timeout: 5_000 });
    const primeraEnviada = Date.now();
    await expect(campo(descriptora)).toBeFocused();
    await expect(pistas(g1)).toHaveCount(1, { timeout: 5_000 });
    await expect(pistas(g1).first()).toContainText(primera);
    await expect(viva(g1)).toContainText(`Pista 1 de ${nombreDe(descriptora)}: ${primera}`);
    const larga = await pista(`Su número de registro es largo: ${'0123456789'.repeat(14)}`.slice(0, 180), `Cifras: ${'0123456789'.repeat(17)}`.slice(0, 180));
    await expect(descriptora.getByTestId('taboo-hint-count')).toHaveText(`${larga.length} / 180`);
    // El servidor impone 500 ms entre pistas (`POKE_TABOO_HINT_COOLDOWN_MS`) y el cliente no lo muestra: se espera a que
    // pasen desde la primera (lo normal es que ya hayan pasado con las comprobaciones de arriba) y luego se envía.
    await expect.poll(() => Date.now() - primeraEnviada, { message: 'enfriamiento de pistas del servidor' }).toBeGreaterThan(600);
    await enviar(descriptora).click();
    await expect(campo(descriptora)).toHaveValue('', { timeout: 5_000 });
    await expect(campo(descriptora)).toBeFocused();
    await expect(pistas(g2)).toHaveCount(2, { timeout: 5_000 });
    // La última arriba, destacada con «Nueva» y entera (180 caracteres, sin cortar).
    await expect(pistas(g2).first()).toContainText('Nueva');
    await expect(pistas(g2).first()).toContainText(larga);
    await expect(pistas(descriptora)).toHaveCount(2);
    await campo(descriptora).fill('Tiene una pose de lucha');
    await capturarTamanos(descriptora, 'juego-poke-taboo-describir', { sigue: secretoEn(descriptora) });
    // A 390×844 con el campo enfocado (como con el teclado abierto): el campo, el contador y «Enviar pista» a la vista;
    // arriba, lo prohibido, a la vista y sin tapar.
    await descriptora.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await descriptora.evaluate(() => window.scrollTo(0, 0));
    await expect(descriptora.getByTestId('taboo-forbidden')).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(descriptora.getByTestId('taboo-forbidden')), 'a 390: las palabras prohibidas sin tapar').toBe(true);
    await campo(descriptora).focus();
    await expect(campo(descriptora)).toBeFocused();
    await expect(campo(descriptora)).toBeInViewport({ ratio: 1 });
    await expect(enviar(descriptora)).toBeInViewport({ ratio: 1 });
    await expect(descriptora.getByTestId('taboo-hint-count')).toBeInViewport();
    await descriptora.setViewportSize({ width: 1280, height: 720 });
    await campo(descriptora).fill('');

    // Un fallo de g1: el aviso, la región viva y los intentos públicos (también para g2).
    const fallo = secreto === 'Pikachu' ? 'Bulbasaur' : 'Pikachu';
    await adivinar(g1, fallo);
    await expect(viva(g1)).toContainText(`${fallo} no era.`, { timeout: 5_000 });
    await expect(g2.getByTestId('guess-attempt').filter({ hasText: fallo })).toContainText(`${nombreDe(g1)} probó`, { timeout: 5_000 });
    await expect(g1.getByText('Tu respuesta · 1 intento')).toBeVisible();
    await capturarTamanos(g2, 'juego-poke-taboo-pistas', { sigue: titulo(g2).filter({ hasText: '¿Qué Pokémon describe' }) });
    // A 390×844 sin desplazar: la fase, el plazo y el buscador.
    await g2.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await g2.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [g2.locator('[aria-current="step"]'), g2.getByRole('timer')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase y plazo sin tapar').toBe(true);
    }
    await expect(buscadorRespuesta(g2)).toBeInViewport({ ratio: 1 });
    await expect(pistas(g2).first()).toBeInViewport();
    await g2.setViewportSize({ width: 1280, height: 720 });

    // El acierto de g1 (segundo intento); B retiene la revelación para capturarla.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'poke-taboo')?.phase === 'ROUND_RESULTS');
    await expect(g1.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await adivinar(g1, secreto);
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect(b.page.getByTestId('taboo-reveal-summary')).toHaveText(`${nombreDe(g1)} acertó ${secreto} en 2 intentos.`);
    await expect(viva(b.page)).toHaveText(`Turno 1 terminado. ${nombreDe(g1)} acertó ${secreto} en 2 intentos.`);
    // Al cambiar de fase el foco de quien acertó no cae al `body` (va al título de la placa).
    await expect(titulo(g1)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect.poll(() => g1.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), { timeout: 3_000 }).toBe(true);
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(g1) })).toContainText('Acertó · 2 intentos');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(descriptora) })).toContainText('+2');
    await expect(b.page.getByText(primera, { exact: false }).first()).toBeVisible();
    await capturarTamanos(b.page, 'juego-poke-taboo-revelacion', { sigue: titulo(b.page).filter({ hasText: `¡Era ${secreto}!` }) });
    retenedor.soltar();

    // Turnos 2 y 3: quien adivina acierta a la primera.
    for (const n of [2, 3]) {
      const siguiente = await turno(n);
      await adivinar(siguiente.otras[0], siguiente.secreto);
      await expect(titulo(siguiente.otras[0])).toHaveText(`¡Era ${siguiente.secreto}!`, { timeout: 10_000 });
    }

    // Clasificación: métricas en texto, sin medallas.
    await expect(host.page.getByRole('heading', { name: 'Así ha ido la partida', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ adivinados? · \d+ al primer intento · 1\/1 turnos describiendo con acierto · \+\d+ adivinando · \+2 describiendo$/)).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-poke-taboo-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Sketchmon con tres jugadores y una vuelta (el motor da un dibujo por jugador: tres turnos). En el primero quien dibuja
 * traza con el ratón, cambia el color con el teclado y por nombre, deshace y rehace, borra con la goma, limpia y lo
 * recupera con Ctrl+Z; los demás ven los trazos en directo (`data-stroke-count`) y nunca el secreto. Un fallo, el acierto
 * al segundo intento y la revelación (6 s, retenida en la página de B); los otros dos turnos, a la primera; clasificación
 * con la galería. Capturas de los ajustes, del lienzo de quien dibuja, del de quien adivina, de la revelación y de la
 * clasificación a los tres tamaños.
 */
test('sketchmon: dibujar con herramientas, adivinar con un fallo, la revelación y la galería', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Sketchmon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('radio', { name: '120 s' }).click();
    await expect(host.page.getByRole('radio', { name: '120 s' })).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('slider', { name: 'Vueltas' })).toHaveValue('1');
    for (const nombre of ['Memoria de 3 segundos', 'Pistas automáticas', 'Formas compatibles']) await expect(host.page.getByRole('switch', { name: nombre })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.getByRole('slider', { name: 'Vueltas' }).scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-sketchmon-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 6 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const secretoEn = (page: Page) => page.getByTestId('sketch-secret');
    const lienzo = (page: Page) => page.getByTestId('sketch-canvas');
    const directo = (page: Page) => page.getByTestId('sketch-live');
    const herramientas = (page: Page) => page.getByRole('region', { name: 'Herramientas de dibujo' });
    const trazos = (locator: Locator) => locator.getAttribute('data-stroke-count').then(Number);
    /** Quien dibuja el turno `n`: la única página que pinta el secreto; el nombre se lee de su carta. */
    const turno = async (n: number) => {
      for (const page of paginas) await expect(page.getByText(`Dibujo ${n} de 3 · Vuelta 1 de 1`)).toBeVisible({ timeout: 20_000 });
      const dibujante = await primeraVisible(paginas, (page) => secretoEn(page));
      const secreto = (await secretoEn(dibujante).locator('[data-part="name"]').innerText()).trim();
      return { dibujante, secreto, otras: paginas.filter((page) => page !== dibujante) as [Page, Page] };
    };
    /** Un trazo con el ratón dentro del lienzo, de (x1, y1) a (x2, y2) en fracciones de su tamaño. */
    const trazar = async (page: Page, [x1, y1]: [number, number], [x2, y2]: [number, number]) => {
      const caja = (await lienzo(page).boundingBox())!;
      await page.mouse.move(caja.x + caja.width * x1, caja.y + caja.height * y1);
      await page.mouse.down();
      await page.mouse.move(caja.x + caja.width * x2, caja.y + caja.height * y2, { steps: 10 });
      await page.mouse.up();
    };

    // Turno 1: quien dibuja ve su secreto; los demás, no (ni en el DOM).
    const { dibujante, secreto, otras } = await turno(1);
    const [g1, g2] = otras;
    await expect(titulo(dibujante)).toHaveText(`Dibuja a ${secreto}`);
    await expect(titulo(g1)).toHaveText(`¿Qué Pokémon dibuja ${nombreDe(dibujante)}?`);
    for (const page of otras) {
      await expect(secretoEn(page)).toHaveCount(0);
      await expect(herramientas(page)).toHaveCount(0);
      expect(await page.content(), 'el DOM de quien adivina no tiene el secreto').not.toMatch(comoPalabra(secreto));
      await expect(page.getByText('Esperando el primer trazo…')).toBeVisible();
    }
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);

    // Dos trazos con el ratón: llegan en directo a los demás.
    await trazar(dibujante, [0.2, 0.3], [0.7, 0.35]);
    await trazar(dibujante, [0.3, 0.6], [0.5, 0.8]);
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(2);
    // El color con el teclado (flechas en la paleta) y por su nombre; el nombre del elegido se ve escrito.
    await herramientas(dibujante).getByRole('radio', { name: 'Negro' }).focus();
    await dibujante.keyboard.press('ArrowRight');
    await expect(herramientas(dibujante).getByRole('radio', { name: 'Blanco' })).toBeFocused();
    await expect(dibujante.getByTestId('sketch-color-name')).toHaveText('Color: Blanco');
    await herramientas(dibujante).getByRole('radio', { name: 'Rojo' }).click();
    await expect(dibujante.getByTestId('sketch-color-name')).toHaveText('Color: Rojo');
    await herramientas(dibujante).getByRole('radio', { name: 'Muy grueso' }).click();
    await trazar(dibujante, [0.6, 0.6], [0.85, 0.7]);
    await expect.poll(() => trazos(directo(g2)), { timeout: 5_000 }).toBe(3);
    // Deshacer y rehacer (botones con nombre).
    await herramientas(dibujante).getByRole('button', { name: 'Deshacer último trazo' }).click();
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(2);
    await herramientas(dibujante).getByRole('button', { name: 'Rehacer último trazo' }).click();
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(3);
    // La goma es un trazo más (borra lo que pisa).
    await herramientas(dibujante).getByRole('radio', { name: 'Goma' }).click();
    await expect(lienzo(dibujante)).toHaveAttribute('aria-label', /Goma: arrastra para borrar/);
    await trazar(dibujante, [0.2, 0.3], [0.45, 0.32]);
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(4);
    // Limpiar no pide confirmación (como antes) porque se deshace: Ctrl+Z lo recupera.
    await herramientas(dibujante).getByRole('button', { name: 'Limpiar lienzo' }).click();
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(0);
    await dibujante.keyboard.press('Control+z');
    await expect.poll(() => trazos(directo(g1)), { timeout: 5_000 }).toBe(4);
    await herramientas(dibujante).getByRole('radio', { name: 'Lápiz' }).click();
    // Con el ratón encima del lienzo, quien dibuja ve un punto del color elegido (Rojo) en lugar de la cruz; al salir, se va.
    const cursor = dibujante.getByTestId('sketch-brush-cursor');
    await expect(cursor).toBeHidden();
    const caja = (await lienzo(dibujante).boundingBox())!;
    await dibujante.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await expect(cursor).toBeVisible();
    await expect(lienzo(dibujante)).toHaveCSS('cursor', 'none');
    expect(await cursor.locator('span').evaluate((punto) => getComputedStyle(punto).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(g1.getByTestId('sketch-brush-cursor')).toHaveCount(0);
    await dibujante.mouse.move(caja.x - 20, caja.y - 20);
    await expect(cursor).toBeHidden();
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);

    await capturarTamanos(dibujante, 'juego-sketchmon-dibujar', { sigue: secretoEn(dibujante) });
    // A 1920 el lienzo crece para llenar el hueco.
    const ancho = async (w: number, h: number) => { await dibujante.setViewportSize({ width: w, height: h }); return (await lienzo(dibujante).boundingBox())!.width; };
    const a1280 = await ancho(1280, 720);
    const a1920 = await ancho(1920, 1080);
    test.info().annotations.push({ type: 'lienzo', description: `ancho a 1280: ${Math.round(a1280)} px; a 1920: ${Math.round(a1920)} px` });
    expect(a1920, 'a 1920 el lienzo es mayor que a 1280').toBeGreaterThan(a1280 * 1.4);
    // El lienzo se lleva el alto de la escena (herramientas en la columna del secreto): antes medía 374 y 722 px de ancho.
    expect(a1280, 'a 1280 el lienzo de quien dibuja ocupa la escena').toBeGreaterThan(440);
    expect(a1920, 'a 1920 el lienzo de quien dibuja ocupa la escena').toBeGreaterThan(760);
    // A 390×844 sin desplazar: el lienzo y las herramientas (pegadas abajo) a la vista; con el lienzo arriba, entero y sin tapar.
    await dibujante.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await dibujante.evaluate(() => window.scrollTo(0, 0));
    await expect(lienzo(dibujante)).toBeInViewport();
    await expect(herramientas(dibujante)).toBeInViewport({ ratio: 1 });
    test.info().annotations.push({ type: 'lienzo-390', description: `sin desplazar, a la vista y sin tapar: ${await sinTapar(lienzo(dibujante))}` });
    await lienzo(dibujante).scrollIntoViewIfNeeded();
    await expect(lienzo(dibujante)).toBeInViewport({ ratio: 1 });
    await expect(herramientas(dibujante)).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(lienzo(dibujante)), 'a 390: el lienzo sin tapar por las herramientas').toBe(true);
    await dibujante.setViewportSize({ width: 1280, height: 720 });

    // Un fallo de g1: la región viva y los intentos públicos (también para g2).
    const fallo = secreto === 'Pikachu' ? 'Bulbasaur' : 'Pikachu';
    await adivinar(g1, fallo);
    await expect(viva(g1)).toContainText(`${fallo} no era.`, { timeout: 5_000 });
    await expect(g2.getByTestId('guess-attempt').filter({ hasText: fallo })).toContainText(`${nombreDe(g1)} probó`, { timeout: 5_000 });
    await expect(g1.getByText('Tu respuesta · 1 intento')).toBeVisible();
    await capturarTamanos(g2, 'juego-sketchmon-adivinar', { sigue: titulo(g2).filter({ hasText: '¿Qué Pokémon dibuja' }) });
    // Quien adivina: el lienzo en directo sin barra de título y con la placa del buscador en una fila (antes, 316 px a 1280).
    expect((await directo(g2).boundingBox())!.width, 'a 1280 el lienzo en directo ocupa la escena').toBeGreaterThan(440);
    // A 390×844 sin desplazar: el lienzo en directo y el buscador.
    await g2.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await g2.evaluate(() => window.scrollTo(0, 0));
    await expect(directo(g2)).toBeInViewport();
    await expect(buscadorRespuesta(g2)).toBeInViewport({ ratio: 1 });
    test.info().annotations.push({ type: 'directo-390', description: `lienzo entero y sin tapar sin desplazar: ${await sinTapar(directo(g2))}` });
    await g2.setViewportSize({ width: 1280, height: 720 });

    // El acierto de g1 (segundo intento); B retiene la revelación para capturarla.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'sketchmon')?.phase === 'ROUND_RESULTS');
    await expect(g1.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await adivinar(g1, secreto);
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect(b.page.getByTestId('sketch-reveal-summary')).toContainText(`${nombreDe(g1)} acertó ${secreto} en 2 intentos`);
    await expect(viva(b.page)).toContainText(`Dibujo 1 terminado. ${nombreDe(g1)} acertó ${secreto} en 2 intentos`);
    await expect.poll(() => trazos(b.page.getByTestId('sketch-final'))).toBe(4);
    // Al cambiar de fase el foco de quien acertó no cae al `body`.
    await expect(titulo(g1)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect.poll(() => g1.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), { timeout: 3_000 }).toBe(true);
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(g1) })).toContainText('Acertó · 2 intentos');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(dibujante) })).toContainText('+3');
    await capturarTamanos(b.page, 'juego-sketchmon-revelacion', { sigue: titulo(b.page).filter({ hasText: `¡Era ${secreto}!` }) });
    retenedor.soltar();

    // Turnos 2 y 3: un trazo y quien adivina acierta a la primera.
    for (const n of [2, 3]) {
      const siguiente = await turno(n);
      await trazar(siguiente.dibujante, [0.3, 0.3], [0.6, 0.6]);
      await adivinar(siguiente.otras[0], siguiente.secreto);
      await expect(titulo(siguiente.otras[0])).toHaveText(`¡Era ${siguiente.secreto}!`, { timeout: 10_000 });
    }

    // Clasificación: métricas en texto, sin medallas, y la galería con los tres dibujos.
    await expect(host.page.getByRole('heading', { name: 'La galería de la partida', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ adivinados? · \d+ al primer intento · 1\/1 dibujos descubiertos · \+\d+ adivinando · \+3 dibujando$/)).toHaveCount(3);
    await expect(host.page.getByTestId('sketch-gallery-item')).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-sketchmon-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Pokédex Absurda con tres jugadores y dos partidas seguidas de una ronda (el modo se cambia en el lobby entre ellas).
 * Clásico: los tres escriben (la propia entrada lleva «Tu entrada» y ningún botón), dos votan la entrada del tercero y la
 * revelación enseña al autor con sus puntos. «¿Cuál es la real?»: uno marca la graciosa y pulsa «Es la real»; la revelación
 * enseña «Entrada oficial · …». La página de B retiene la revelación (8 s) para capturarla; escribir y votar se capturan
 * con un jugador pendiente para que la fase no avance sola.
 */
test('pokédex absurda: escribir, votar la más absurda y la real, y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédex Absurda');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 8 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const campo = (page: Page) => page.getByRole('textbox', { name: /^Tu entrada para/ });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const entradas = (page: Page) => page.getByTestId('absurd-entries').locator(':scope > li');
    const entradaDe = (page: Page, autor: Jugador) => entradas(page).filter({ hasText: `Entrada de ${autor.name}` });
    const escribir = async (jugador: Jugador, enviar = true) => {
      await expect(campo(jugador.page)).toBeVisible({ timeout: 20_000 });
      await campo(jugador.page).fill(`Entrada de ${jugador.name}: duerme dentro de un microondas y nadie sabe por qué.`);
      if (enviar) await jugador.page.getByTestId('absurd-send').click();
    };
    const paginas = jugadores.map((j) => j.page);

    // Clásico: la región viva es una sola y la ficha del Pokémon sale en las tres páginas.
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);
    for (const jugador of jugadores) await expect(jugador.page.getByRole('heading', { name: 'Escribe su entrada de Pokédex', level: 1 })).toBeVisible({ timeout: 20_000 });
    await escribir(a);
    await escribir(b);
    await expect(a.page.getByText('Entrada enviada').first()).toBeVisible({ timeout: 10_000 });
    // El host escribe pero no envía: la fase sigue y se captura con A y B listos.
    await escribir(host, false);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-absurd-pokedex-escribir', { sigue: campo(host.page) });
    await host.page.getByTestId('absurd-send').click();

    // Votación: el DOM anónimo no trae autores; la entrada propia no tiene botón y las ajenas, uno solo.
    for (const jugador of jugadores) await expect(entradas(jugador.page)).toHaveCount(3, { timeout: 20_000 });
    for (const jugador of jugadores) {
      const propia = entradaDe(jugador.page, jugador);
      await expect(propia.getByText('Tu entrada')).toBeVisible();
      await expect(propia.getByRole('button')).toHaveCount(0);
      for (const otro of jugadores.filter((j) => j !== jugador)) await expect(entradaDe(jugador.page, otro).getByRole('button', { name: 'La más absurda' })).toBeVisible();
    }
    // A y B votan la del host; con el host sin votar, la fase sigue y se captura en su página.
    await entradaDe(a.page, host).getByRole('button', { name: 'La más absurda' }).click();
    await expect(a.page.getByText('Voto enviado').first()).toBeVisible({ timeout: 10_000 });
    await entradaDe(b.page, host).getByRole('button', { name: 'La más absurda' }).click();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-absurd-pokedex-votar', { sigue: entradaDe(host.page, a).getByRole('button', { name: 'La más absurda' }) });
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'absurd-pokedex')?.phase === 'ROUND_RESULTS');
    await entradaDe(host.page, a).getByRole('button', { name: 'La más absurda' }).click();

    // Revelación (retenida en B): el autor con sus votos y puntos, y los demás ven lo mismo.
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    const revelada = b.page.getByRole('region', { name: 'Entradas reveladas' });
    const entradaGanadora = revelada.getByRole('listitem').filter({ hasText: `Entrada de ${host.name}` });
    await expect(entradaGanadora).toContainText(host.name);
    await expect(entradaGanadora).toContainText('2 votos');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('+4');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Ganó');
    await expect(viva(b.page)).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-absurd-pokedex-revelacion', { sigue: revelada });
    retenedor.soltar();

    // Resultados de la partida y vuelta al lobby (Continuar → clasificación de la sesión → Volver al lobby).
    await expect(host.page.getByRole('heading', { name: 'Las entradas más absurdas', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('+1 por cada voto y +2 a la más votada.')).toBeVisible();
    await host.page.getByRole('button', { name: 'Terminar sesión' }).click();
    await host.page.getByRole('button', { name: 'Volver al lobby' }).click({ timeout: 15_000 });
    await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeAttached({ timeout: 15_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });

    // Segunda partida: solo «¿Cuál es la real?».
    await seleccionarJuego(host.page, 'Pokédex Absurda');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await expect(host.page.getByRole('slider', { name: 'Número de rondas' })).toBeVisible();
    await elegirModo(host.page, '¿Cuál es la real?');
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(paginas);
    for (const jugador of jugadores) await escribir(jugador);
    for (const jugador of jugadores) await expect(entradas(jugador.page)).toHaveCount(4, { timeout: 20_000 });
    // Una de las cuatro es la oficial: el DOM no dice cuál. Dos botones por entrada ajena y ninguno en la propia.
    for (const jugador of jugadores) {
      await expect(entradaDe(jugador.page, jugador).getByRole('button')).toHaveCount(0);
      await expect(entradaDe(jugador.page, jugador).getByText('Tu entrada')).toBeVisible();
      await expect(jugador.page.getByRole('button', { name: 'Es la real' })).toHaveCount(3);
      await expect(jugador.page.getByRole('button', { name: '😂 La más graciosa' })).toHaveCount(3);
      await expect(jugador.page.getByText(/Entrada oficial/)).toHaveCount(0);
    }
    // A marca la graciosa de B (conmutador) y vota la del host como la real; B y el host votan sin graciosa.
    const graciosa = entradaDe(a.page, b).getByRole('button', { name: /La más graciosa/ });
    await graciosa.click();
    await expect(graciosa).toHaveAttribute('aria-pressed', 'true');
    await entradaDe(a.page, host).getByRole('button', { name: 'Es la real' }).click();
    await expect(a.page.getByText('Voto enviado').first()).toBeVisible({ timeout: 10_000 });
    await expect(entradaDe(a.page, b).getByText('😂 Tu graciosa')).toBeVisible();
    await entradaDe(b.page, a).getByRole('button', { name: 'Es la real' }).click();
    // Captura de la papeleta con el host pendiente, con la graciosa de A marcada en su página.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    const graciosaHost = entradaDe(host.page, a).getByRole('button', { name: /La más graciosa/ });
    await graciosaHost.click();
    await expect(graciosaHost).toHaveAttribute('aria-pressed', 'true');
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'absurd-pokedex')?.phase === 'ROUND_RESULTS');
    await entradaDe(host.page, a).getByRole('button', { name: 'Es la real' }).click();

    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    const reveladaReal = b.page.getByRole('region', { name: 'Entradas reveladas' });
    await expect(reveladaReal.getByText(/^Entrada oficial · /)).toHaveCount(1);
    await expect(reveladaReal.getByRole('listitem')).toHaveCount(4);
    await expect(reveladaReal.getByText(/^😂 \d+$/).first()).toBeVisible();
    await expect(b.page.getByText('¿Cuál es la real?', { exact: true }).first()).toBeVisible();
    await capturarTamanos(b.page, 'juego-absurd-pokedex-real', { sigue: reveladaReal });
    retenedor.soltar();

    await expect(host.page.getByRole('heading', { name: 'Las entradas más absurdas', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('Mejor ojo')).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-absurd-pokedex-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Cambia la cantidad de la siguiente `RAISE_BID` que envía la página (su `/ws` pasa por aquí): así se fuerza un
 * rechazo del servidor que la interfaz nunca dejaría enviar (más monedas de las que se tienen).
 */
async function pujasTrucables(page: Page): Promise<{ trucarSiguiente(cantidad: number): void }> {
  let cantidad: number | null = null;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const texto = String(message);
      if (cantidad !== null && texto.includes('"RAISE_BID"')) {
        const nueva = cantidad;
        cantidad = null;
        server.send(texto.replace(/"amount":\s*\d+/, `"amount":${nueva}`));
        return;
      }
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  return { trucarSiguiente(nueva) { cantidad = nueva; } };
}

/**
 * Pokémon Team Auction con tres jugadores, 2 monedas cada uno y 120 s por turno. Lote 1: el título es el lote (sin
 * BST), el turno va en el reloj y quien no tiene el turno ve «Le toca a …» sin controles; quien abre puja 1 (con los
 * atajos) y espera («Tú vas ganando con 1 moneda»), el siguiente intenta una puja que el servidor rechaza (trucada a
 * 999: el aviso global y el foco de vuelta en «Pujar») y luego puja 2; los demás no llegan a 3 y el motor los pasa: se
 * adjudica. Lote 2: la línea del lote anterior, «Sin presupuesto» del ganador y el equipo de un rival en su diálogo.
 * Después, cada turno puja todo hasta agotar las monedas y la clasificación. Se capturan el lote, la espera, la puja, la
 * adjudicación y la clasificación.
 */
test('pokemon-team-auction: pujas que compiten, una rechazada, la adjudicación, los equipos y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Team Auction');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('spinbutton', { name: 'Presupuesto personalizado' }).fill('2');
    await expect(host.page.getByRole('radio', { name: 'Otro' })).toHaveAttribute('aria-checked', 'true');
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por turno' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('120');
    await expect(host.page.getByRole('switch', { name: 'Incluir formas alternativas' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await tiempo.scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-pokemon-team-auction-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    // Todas las páginas pasan su `/ws` por el trucador (quién puja segundo sale del sorteo) y vuelven a la sala.
    const trucadores = new Map<Page, { trucarSiguiente(cantidad: number): void }>();
    for (const { page } of jugadores) {
      trucadores.set(page, await pujasTrucables(page));
      await page.reload();
      await page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
      await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    }
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const viva = (page: Page) => page.getByTestId('auction-screen').locator('[aria-live]');
    const pujar = (page: Page) => page.getByTestId('bid-submit');
    const placa = (page: Page) => page.locator('#bid-controls-title');
    /** La página con el turno: la única con «Pujar» activo (sin turno no hay controles; se cuenta, no se espera al botón). */
    const turno = async (otras: readonly Page[] = paginas) => {
      let encontrada: Page | undefined;
      await expect.poll(async () => {
        for (const page of otras) if (await pujar(page).and(page.locator(':enabled')).count() > 0) { encontrada = page; return true; }
        return false;
      }, { timeout: 20_000 }).toBe(true);
      return encontrada!;
    };
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const reloj = (page: Page) => page.getByRole('timer');

    // Lote 1: el título es el lote, el lote en una carta sin su BST, sin pujas; una sola región viva en cada página.
    for (const page of paginas) {
      await expect(titulo(page)).toHaveText(/^Lote 1 de 18 · \S/, { timeout: 20_000 });
      await expect(page.getByText('Pujas a la vista', { exact: true })).toBeVisible();
      await expect(page.getByText(/^BST \d+$/)).toHaveCount(0);
      await expect(viva(page)).toHaveCount(1);
    }
    const p1 = await turno();
    // El turno vive en el reloj (y marcado en el orden de turno), no en el título.
    await expect(reloj(p1)).toHaveAccessibleName(/^Tu turno: \d+ s$/);
    await expect(placa(p1)).toHaveText('Tu turno');
    await expect(p1.getByTestId('auction-current-bid')).toHaveText('Sin pujas');
    await expect(p1.getByTestId('turn-order-entry')).toHaveCount(3);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="turn"]')).toContainText(`${nombreDe(p1)} (Tú)`);
    await expect(p1.getByTestId('bid-budget')).toContainText('2');
    await expect(p1.getByTestId('bid-step')).toContainText(['Mínima: 1', 'Todo: 2']);
    for (const page of paginas.filter((page) => page !== p1)) {
      await expect(reloj(page)).toHaveAccessibleName(new RegExp(`^Turno de ${nombreDe(p1)}: \\d+ s$`));
      // Sin tu turno: el mensaje, sin controles grises, y el presupuesto a la vista.
      await expect(placa(page)).toHaveText(`Le toca a ${nombreDe(p1)}`);
      await expect(page.getByTestId('bid-controls')).toContainText('Aún no hay pujas en este lote.');
      await expect(pujar(page)).toHaveCount(0);
      await expect(page.getByTestId('bid-budget')).toContainText('2');
    }
    await capturarTamanos(p1, 'juego-pokemon-team-auction-lote', { sigue: placa(p1).filter({ hasText: 'Tu turno' }) });
    // La regla de «Presupuestos y equipos» se lee entera en los tres tamaños (al pie del panel, fuera del desplazamiento).
    const regla = p1.getByText(/^Quien pasa vuelve a participar/);
    for (const { w, h } of SIZES) {
      await p1.setViewportSize({ width: w, height: h });
      await regla.scrollIntoViewIfNeeded();
      expect(await regla.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const panel = el.closest('section')!.getBoundingClientRect();
        return r.height > 0 && r.top >= panel.top && r.bottom <= panel.bottom + 0.5 && el.scrollHeight <= el.clientHeight + 1;
      }), `${w}x${h}: la regla del panel lateral sin recortar`).toBe(true);
    }
    await p1.setViewportSize({ width: 1280, height: 720 });
    // A 390×844 sin desplazar: el lote, la puja actual y los controles.
    await p1.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await p1.evaluate(() => window.scrollTo(0, 0));
    await expect(p1.getByTestId('auction-pokemon')).toBeInViewport();
    await expect(p1.getByTestId('auction-current-bid')).toBeInViewport({ ratio: 1 });
    await expect(pujar(p1)).toBeInViewport({ ratio: 1 });
    await expect(p1.getByTestId('bid-pass')).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(p1.getByTestId('auction-current-bid')), 'a 390: la puja actual sin tapar por los controles').toBe(true);
    expect(await sinTapar(p1.getByTestId('turn-order-entry').last()), 'a 390: el orden de turno sin tapar por los controles').toBe(true);
    await p1.setViewportSize({ width: 1280, height: 720 });

    // Atajos (fuera del campo): 2 pone «Todo», 1 vuelve a la mínima. Escribiendo en el campo no se disparan.
    const campo = p1.getByRole('spinbutton', { name: 'Tu puja (monedas)' });
    await placa(p1).focus();
    await p1.keyboard.press('2');
    await expect(campo).toHaveValue('2');
    await p1.keyboard.press('1');
    await expect(campo).toHaveValue('1');
    await campo.focus();
    await p1.keyboard.press('2');
    await expect(campo).toHaveValue('12');
    await expect(pujar(p1)).toBeDisabled();
    await expect(p1.getByText('No te llega: máximo 2 monedas.')).toBeVisible();
    await campo.fill('1');
    await pujar(p1).click();
    await expect(placa(p1)).toHaveText(/^Le toca a /, { timeout: 5_000 });
    await expect(p1.getByTestId('bid-controls')).toContainText('Tú vas ganando con 1 moneda.');
    await expect(pujar(p1)).toHaveCount(0);
    await expect(p1.getByTestId('auction-leader')).toContainText(nombreDe(p1));

    // La puja que compite: el siguiente turno.
    const p2 = await turno(paginas.filter((page) => page !== p1));
    // Quien va ganando espera: a quién le toca y que va ganando, sin botones grises (captura del estado sin turno).
    await expect(placa(p1)).toHaveText(`Le toca a ${nombreDe(p2)}`);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="leading"]')).toContainText(`${nombreDe(p1)} (Tú)`);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="turn"]')).toContainText(nombreDe(p2));
    await capturarTamanos(p1, 'juego-pokemon-team-auction-espera', { sigue: placa(p1).filter({ hasText: `Le toca a ${nombreDe(p2)}` }) });
    await expect(p2.getByTestId('auction-current-bid')).toContainText('1');
    await expect(p2.getByTestId('auction-leader')).toContainText(nombreDe(p1));
    await expect(p2.getByTestId('bid-history-row').first()).toContainText('Pujó 1 moneda');
    await expect(viva(p2)).toContainText(`${nombreDe(p1)} puja 1 moneda por`);
    await expect(pujar(p2)).toHaveText('Pujar 2');
    await capturarTamanos(p2, 'juego-pokemon-team-auction-puja', { sigue: placa(p2).filter({ hasText: 'Tu turno' }) });

    // Rechazo forzado (999 monedas): el aviso global, el foco de vuelta en «Pujar» y el turno sigue siendo suyo.
    trucadores.get(p2)!.trucarSiguiente(999);
    await pujar(p2).click();
    await expect(p2.getByRole('alert').filter({ hasText: /monedas/ })).toBeVisible({ timeout: 5_000 });
    await expect(pujar(p2)).toBeFocused();
    await expect(placa(p2)).toHaveText('Tu turno');
    // El aviso global tapa la píldora: se puja con el teclado desde el foco devuelto.
    await p2.keyboard.press('Enter');

    // Los demás no llegan a 3: el motor los pasa y adjudica el lote 1. La línea del lote anterior lo dice en el lote 2.
    for (const page of paginas) await expect(titulo(page)).toHaveText(/^Lote 2 de 18 · \S/, { timeout: 10_000 });
    const anterior = p2.getByTestId('auction-previous');
    await expect(anterior).toContainText('Lote 1');
    await expect(anterior).toContainText(nombreDe(p2));
    await expect(anterior).toContainText('2 monedas');
    await expect(placa(p2)).toHaveText('Sin presupuesto');
    await expect(pujar(p2)).toHaveCount(0);
    await expect(p2.getByTestId('budget-row').filter({ hasText: nombreDe(p2) })).toContainText('Equipo 1/6');
    await expect(viva(p2)).toContainText(`Lote 1:`);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
    await capturarTamanos(p2, 'juego-pokemon-team-auction-adjudicacion', { sigue: anterior.filter({ hasText: 'Lote 1' }) });
    // A 390×844, arriba del todo, la placa pegada al fondo no tapa el pie de la tarjeta del estado (el medidor trata esa
    // placa como capa permitida y no lo vería).
    await p2.setViewportSize({ width: 390, height: 844 });
    await p2.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => p2.evaluate(() => {
      const ultima = document.querySelector('[data-testid="auction-status"] > :last-child');
      const placaFija = document.querySelector('[data-layer="screen-bottom"]');
      if (!ultima || !placaFija) return Number.NaN;
      return Math.round(placaFija.getBoundingClientRect().top - ultima.getBoundingClientRect().bottom);
    }), 'la placa no tapa el estado de la puja a 390').toBeGreaterThanOrEqual(0);
    await p2.setViewportSize({ width: 1280, height: 720 });

    // El equipo de un rival en su diálogo; Esc lo cierra y el foco vuelve a su botón.
    const ver = p1.getByRole('button', { name: `Ver equipo de ${nombreDe(p2)}` });
    await ver.click();
    const dialogo = p1.getByRole('dialog', { name: `Equipo de ${nombreDe(p2)}` });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByTestId('team-dialog-summary')).toContainText('Equipo 1/6');
    await expect(dialogo.getByTestId('team-dialog-summary')).toContainText('0 monedas');
    await p1.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(ver).toBeFocused();

    // Cada turno puja todo lo que tiene (el último incremento) hasta que no quedan monedas: la clasificación.
    const final = host.page.getByRole('heading', { name: 'La mesa final', level: 1 });
    while (!(await final.isVisible())) {
      let actual: Page | undefined;
      await expect.poll(async () => {
        if (await final.isVisible()) return true;
        // Contar (no `isEnabled`, que espera al botón y se cuelga si la clasificación ya lo desmontó).
        for (const page of paginas) if (await pujar(page).and(page.locator(':enabled')).count() > 0) { actual = page; return true; }
        return false;
      }, { timeout: 20_000 }).toBe(true);
      if (!actual) break;
      await actual.getByTestId('bid-step').last().click();
      await pujar(actual).click();
      await expect(pujar(actual).and(actual.locator(':enabled'))).toHaveCount(0, { timeout: 5_000 });
    }

    await expect(final).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^BST \d+ · \d+ Pokémon · \d+ legendarios? · \d+ míticos? · 0 monedas · \d+ lotes? ganados?$/)).toHaveCount(3);
    await expect(host.page.getByRole('heading', { name: 'Pokémon sin dueño' })).toBeVisible();
    await expect(host.page.getByText(/🏆|🥇/u)).toHaveCount(0);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-team-auction-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Pokémon Bluff Auction con tres jugadores, 5 rondas, 30 s para demostrar y 120 s por turno. Ronda 1: quien abre puja 1
 * (con el atajo), el segundo puja 2, el tercero abre el `Dialog` de pasar (los atajos no cambian el campo con él abierto)
 * y pasa, y el primero pasa también: el segundo demuestra. Nombra Pikachu dos veces (la segunda, «Ya utilizado»): con
 * una apuesta de 2 nunca llega, así que la ronda acaba por tiempo («no lo consiguió»), sea Pikachu válido o no. B retiene
 * ese resultado (dura 5 s) para capturarlo. Ronda 2: quien abre puja el máximo (el pool entero, siempre imposible); los
 * demás ven «Puja máxima» con «Pasar» activo (arreglo del kit) y pasan: «Apuesta imposible». Las rondas 3–5 igual, hasta
 * la clasificación. Se capturan los ajustes, la subasta, la puja máxima, la búsqueda, la demostración, el resultado y la
 * clasificación.
 */
test('pokemon-bluff-auction: pujas, un pase confirmado, la demostración, el resultado de la ronda, la puja máxima y la clasificación', async ({ browser }) => {
  test.setTimeout(300_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokémon Bluff Auction');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('radiogroup', { name: 'Rondas' }).getByRole('radio', { name: '5', exact: true });
    await rondas.click();
    await expect(rondas).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('radiogroup', { name: 'Tiempo inicial para demostrar' }).getByRole('radio', { name: '30 s' })).toHaveAttribute('aria-checked', 'true');
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por puja' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('120');
    await expect(host.page.getByText('Solo especies normales')).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await tiempo.scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-pokemon-bluff-auction-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (el resultado de la ronda dura 5 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('auction-screen').locator('[aria-live]');
    const pujar = (page: Page) => page.getByTestId('bid-submit');
    const pasar = (page: Page) => page.getByTestId('bid-pass');
    const placa = (page: Page) => page.locator('#bid-controls-title');
    const campo = (page: Page) => page.getByRole('spinbutton', { name: 'Tu puja (Pokémon)' });
    const dialogoPasar = (page: Page) => page.getByRole('dialog', { name: '¿Pasar esta ronda?' });
    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon para demostrar la apuesta' });
    /** La página (de las dadas) en la que el botón se activa: la que tiene el turno. */
    const activa = async (boton: (page: Page) => Locator, otras: readonly Page[] = paginas) => primeraVisible(otras, (page) => boton(page).and(page.locator(':enabled')));
    const pasarConfirmando = async (page: Page) => {
      await pasar(page).click();
      await expect(dialogoPasar(page)).toBeVisible();
      await dialogoPasar(page).getByRole('button', { name: 'Pasar', exact: true }).click();
      await expect(dialogoPasar(page)).toBeHidden();
    };

    // Ronda 1, subasta: la condición, sin pujas; una sola región viva en cada página.
    for (const page of paginas) {
      await expect(page.getByText('Ronda 1 de 5 · Subasta', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(viva(page)).toHaveCount(1);
      await expect(page.getByTestId('bluff-condition')).toBeVisible();
    }
    const p1 = await activa(pujar);
    // El título es la ronda; el turno va en el reloj, el orden de turno y la placa de abajo.
    await expect(titulo(p1)).toHaveText('Ronda 1 de 5');
    await expect(p1.getByRole('timer')).toHaveAccessibleName(/^Tu turno: \d+ s$/);
    await expect(p1.locator('[data-testid="turn-order-entry"][data-state="turn"]')).toContainText(`${nombreDe(p1)} (Tú)`);
    await expect(placa(p1)).toHaveText('Tu turno');
    await expect(p1.getByTestId('auction-current-bid')).toHaveText('Sin pujas');
    await expect(p1.getByTestId('bid-step')).toContainText(['Mínima: 1', '+2: 3', '+5: 6']);
    await expect(p1.getByTestId('bid-step')).toHaveCount(3);
    for (const page of paginas.filter((page) => page !== p1)) {
      await expect(page.getByRole('timer')).toHaveAccessibleName(new RegExp(`^Turno de ${nombreDe(p1)}: \\d+ s$`));
      await expect(placa(page)).toHaveText(`Le toca a ${nombreDe(p1)}`);
      await expect(page.getByTestId('bid-submit')).toHaveCount(0);
    }
    await capturarTamanos(p1, 'juego-pokemon-bluff-auction-subasta', { sigue: placa(p1).filter({ hasText: 'Tu turno' }) });
    // A 390×844 sin desplazar: la condición, la puja actual y los controles.
    await p1.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await p1.evaluate(() => window.scrollTo(0, 0));
    await expect(p1.getByTestId('bluff-condition')).toBeInViewport();
    await expect(p1.getByTestId('auction-current-bid')).toBeInViewport({ ratio: 1 });
    await expect(pujar(p1)).toBeInViewport({ ratio: 1 });
    await expect(pasar(p1)).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(p1.getByTestId('auction-current-bid')), 'a 390: la puja actual sin tapar por los controles').toBe(true);
    await p1.setViewportSize({ width: 1280, height: 720 });

    // Atajo fuera del campo: 2 pone «+2», 1 vuelve a la mínima; puja 1.
    await placa(p1).focus();
    await p1.keyboard.press('2');
    await expect(campo(p1)).toHaveValue('3');
    await p1.keyboard.press('1');
    await expect(campo(p1)).toHaveValue('1');
    await pujar(p1).click();
    await expect(placa(p1)).toHaveText(/^Le toca a /, { timeout: 5_000 });
    await expect(p1.getByTestId('bid-controls')).toContainText('Tú vas ganando con 1 Pokémon.');

    // El segundo ve la puja y el historial, y puja 2.
    const p2 = await activa(pujar, paginas.filter((page) => page !== p1));
    await expect(p2.getByTestId('auction-leader')).toContainText(nombreDe(p1));
    await expect(p2.getByTestId('bid-history-row').first()).toContainText('Pujó 1 Pokémon');
    await expect(viva(p2)).toContainText(`${nombreDe(p1)} puja 1 Pokémon.`);
    await expect(pujar(p2)).toHaveText('Pujar 2');
    await pujar(p2).click();
    await expect(placa(p2)).toHaveText(/^Le toca a /, { timeout: 5_000 });

    // El tercero pasa con el diálogo; con él abierto, los atajos no cambian el campo.
    const p3 = paginas.find((page) => page !== p1 && page !== p2)!;
    await expect(pujar(p3)).toBeEnabled({ timeout: 10_000 });
    await expect(campo(p3)).toHaveValue('3');
    await pasar(p3).click();
    await expect(dialogoPasar(p3)).toBeVisible();
    await expect(dialogoPasar(p3).getByRole('button', { name: 'Seguir pujando' })).toBeFocused();
    await p3.keyboard.press('2');
    await expect(campo(p3)).toHaveValue('3');
    await dialogoPasar(p3).getByRole('button', { name: 'Pasar', exact: true }).click();
    await expect(placa(p3)).toHaveText('Has pasado', { timeout: 5_000 });
    await expect(p3.getByTestId('budget-row').filter({ hasText: nombreDe(p3) })).toContainText('Fuera de la ronda');
    // El primero también pasa: el segundo demuestra su apuesta de 2.
    await expect(pasar(p1)).toBeEnabled({ timeout: 10_000 });
    await pasarConfirmando(p1);

    // Demostración: solo p2 tiene el buscador; los demás ven quién busca.
    for (const page of paginas) await expect(page.getByText('Ronda 1 de 5 · Demostración', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(titulo(p2)).toHaveText('Demuestra tu apuesta');
    await expect(buscador(p2)).toBeVisible();
    for (const page of [p1, p3]) {
      await expect(page.getByText(`${nombreDe(p2)} está buscando`)).toBeVisible();
      await expect(buscador(page)).toHaveCount(0);
    }
    // Al cambiar de fase el foco no cae al `body`.
    await expect.poll(() => p1.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), { timeout: 3_000 }).toBe(true);
    await buscador(p2).fill('Pikachu');
    await p2.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    for (const page of paginas) await expect(page.getByTestId('bluff-attempt')).toHaveCount(1, { timeout: 5_000 });
    await expect(viva(p3)).toContainText(`${nombreDe(p2)}: Pikachu,`);
    await expect(p3.locator('[data-testid="bluff-metric"][data-metric="correct"]')).toContainText(/[01] de 2/);
    await capturarTamanos(p2, 'juego-pokemon-bluff-auction-busqueda', { sigue: buscador(p2) });
    await p2.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await p2.evaluate(() => window.scrollTo(0, 0));
    await expect(buscador(p2)).toBeInViewport({ ratio: 1 });
    await p2.setViewportSize({ width: 1280, height: 720 });
    await capturarTamanos(p3, 'juego-pokemon-bluff-auction-demostracion', { sigue: p3.getByText(`${nombreDe(p2)} está buscando`) });

    // B retiene el resultado; el repetido no cuenta y la apuesta de 2 acaba por tiempo.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'pokemon-bluff-auction')?.phase === 'ROUND_RESULTS');
    await buscador(p2).fill('Pikachu');
    await p2.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    await expect(p2.getByTestId('bluff-attempt').filter({ hasText: 'Ya utilizado' })).toHaveCount(1, { timeout: 5_000 });
    await expect.poll(() => retenedor.retenida(), { timeout: 45_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText(`${nombreDe(p2)} no lo consiguió`, { timeout: 5_000 });
    await expect(b.page.getByText('Ronda 1 de 5 · Resultado', { exact: true })).toBeVisible();
    await expect(b.page.getByTestId('bluff-reason')).toContainText('Se agotó el tiempo');
    await expect(b.page.getByTestId('bluff-round-row')).toHaveCount(3);
    await expect(b.page.getByTestId('bluff-round-row').filter({ hasText: nombreDe(p2) })).toContainText('Farol');
    await expect(b.page.getByTestId('bluff-round-row').filter({ hasText: 'Gana la ronda' })).toHaveCount(2);
    await expect(viva(b.page)).toContainText('no lo consiguió');
    await capturarTamanos(b.page, 'juego-pokemon-bluff-auction-resultado', { sigue: titulo(b.page).filter({ hasText: 'no lo consiguió' }) });
    retenedor.soltar();

    // Ronda 2: quien abre puja el máximo (el pool entero); el siguiente ve «Puja máxima» y puede pasar.
    for (const page of paginas) await expect(page.getByText('Ronda 2 de 5 · Subasta', { exact: true })).toBeVisible({ timeout: 20_000 });
    const q1 = await activa(pujar);
    const maximo = await campo(q1).getAttribute('max');
    await campo(q1).fill(maximo!);
    await pujar(q1).click();
    await expect(placa(q1)).toHaveText(/^Le toca a /, { timeout: 5_000 });
    const q2 = await activa(pasar, paginas.filter((page) => page !== q1));
    await expect(placa(q2)).toHaveText('Puja máxima');
    await expect(q2.getByTestId('auction-status')).toContainText('Puja máxima alcanzada');
    await expect(q2.getByTestId('auction-status')).not.toContainText('Mínimo para superarla');
    // Solo «Pasar esta ronda»: sin campo con un valor imposible ni «Pujar» gris.
    await expect(pujar(q2)).toHaveCount(0);
    await expect(campo(q2)).toHaveCount(0);
    await expect(pasar(q2)).toBeEnabled();
    await capturarTamanos(q2, 'juego-pokemon-bluff-auction-puja-maxima', { sigue: placa(q2).filter({ hasText: 'Puja máxima' }) });
    await pasarConfirmando(q2);
    const q3 = await activa(pasar, paginas.filter((page) => page !== q1 && page !== q2));
    await pasarConfirmando(q3);
    await expect(titulo(host.page)).toHaveText('Apuesta imposible', { timeout: 10_000 });
    await expect(host.page.getByTestId('bluff-reason')).toContainText(`apostó ${maximo}, pero solo existían`);

    // Rondas 3–5 igual, hasta la clasificación.
    const final = host.page.getByRole('heading', { name: 'La mesa final', level: 1 });
    while (!(await final.isVisible())) {
      let actual: Page | undefined;
      let accion: 'pujar' | 'pasar' | undefined;
      await expect.poll(async () => {
        if (await final.isVisible()) return true;
        // Contar (no `isEnabled`, que espera al botón): en el resultado de la ronda no hay controles.
        for (const page of paginas) {
          if (await pujar(page).and(page.locator(':enabled')).count() > 0) { actual = page; accion = 'pujar'; return true; }
          if (await pasar(page).and(page.locator(':enabled')).count() > 0) { actual = page; accion = 'pasar'; return true; }
        }
        return false;
      }, { timeout: 30_000 }).toBe(true);
      if (!actual) break;
      if (accion === 'pujar') {
        await campo(actual).fill((await campo(actual).getAttribute('max'))!);
        await pujar(actual).click();
        await expect(pujar(actual).and(actual.locator(':enabled'))).toHaveCount(0, { timeout: 5_000 });
      } else {
        await pasarConfirmando(actual);
        // Deshabilitado o, si cerró la subasta, ya sin controles (el resultado de la ronda).
        await expect(pasar(actual).and(actual.locator(':enabled'))).toHaveCount(0, { timeout: 5_000 });
      }
    }

    await expect(final).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ rondas? ganadas? · \d+\/\d+ apuestas cumplidas · récord \d+ · \d+ correctos? · \d+ imposibles?$/)).toHaveCount(3);
    await expect(host.page.getByRole('heading', { name: 'Mayor apuesta cumplida' })).toBeVisible();
    await expect(host.page.getByText(/🏆|🥇|🥈|🥉/u)).toHaveCount(0);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-bluff-auction-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Cambia el `pokemonId` del siguiente `GUESS_POKEMON` que envía la página (su `/ws` pasa por aquí) por uno que no está en
 * el tablero: así se fuerza un rechazo del servidor que la interfaz nunca dejaría enviar.
 */
async function adivinanzasTrucables(page: Page): Promise<{ trucarSiguiente(): void }> {
  let trucar = false;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const texto = String(message);
      if (trucar && texto.includes('"GUESS_POKEMON"')) {
        trucar = false;
        server.send(texto.replace(/"pokemonId":\s*"[^"]*"/, '"pokemonId":"missingno-e2e"'));
        return;
      }
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  return { trucarSiguiente() { trucar = true; } };
}

/**
 * Quién es Quién Pokémon con tres jugadores (el Equipo Azul tiene dos y abre la partida), el secreto elegido por cada
 * equipo sin plazo y 90 s por turno. Cada equipo elige su secreto en el diálogo; el secreto solo está en el DOM de su
 * equipo. Turno 1 (Azul): cartas bajadas y levantadas con ratón y teclado (compartidas con el compañero, nunca con el
 * rival), el cursor del compañero sobre el tablero (sin tapar las cartas ni animarse con movimiento reducido), un
 * intento que el servidor rechaza (el aviso global, el foco de vuelta en «Confirmar» y el cursor sin borrar el aviso) y
 * un fallo que pasa el turno. Turno 2 (Rojo): acierta el secreto azul, leído de la página de Azul. Se capturan los
 * ajustes, el tablero con el cursor, el diálogo, el turno del rival y la clasificación.
 */
test('who-is-who-pokemon: secretos elegidos, cartas bajadas, cursores, un rechazo, un fallo, el acierto y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Quién es Quién — Pokémon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('radio', { name: 'Por el equipo' }).click();
    await expect(host.page.getByRole('radio', { name: 'Por el equipo' })).toHaveAttribute('aria-checked', 'true');
    const plazo = host.page.getByRole('slider', { name: 'Tiempo para elegir secreto' });
    await plazo.focus();
    await plazo.press('Home');
    await plazo.blur();
    await expect(plazo).toHaveValue('0');
    await expect(host.page.getByText('Sin límite', { exact: true })).toBeVisible();
    await host.page.getByRole('radio', { name: '90 s' }).click();
    await expect(host.page.getByRole('radio', { name: '90 s' })).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('switch', { name: 'Incluir formas regionales y variantes' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.getByRole('radio', { name: '90 s' }).scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-who-is-who-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    const trucadores = new Map<Page, { trucarSiguiente(): void }>();
    for (const { page } of jugadores) {
      trucadores.set(page, await adivinanzasTrucables(page));
      await page.reload();
      await page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
      await expect(page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    }
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const secretoEn = (page: Page) => page.getByTestId('who-secret');
    const tablero = (page: Page) => page.getByTestId('who-board');
    const carta = (page: Page, nombre: string) => tablero(page).getByRole('button', { name: `Bajar ${nombre}`, exact: true });
    const placa = (page: Page) => page.locator('#social-plate-title');
    const adivinar = (page: Page) => page.getByRole('button', { name: 'Adivinar Pokémon' });
    const sinBody = (page: Page) => page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body);
    const leerSecreto = async (page: Page) => (await secretoEn(page).locator('[data-part="name"]').innerText()).trim();

    // Equipos: Azul abre la partida con dos jugadores (por el reparto alterno del motor); Rojo, con uno.
    for (const page of paginas) await expect(titulo(page)).toHaveText(/Elegid vuestro Pokémon secreto/, { timeout: 20_000 });
    const azules: Page[] = [];
    for (const page of paginas) if (await page.getByRole('heading', { name: 'Tablero del Equipo Azul' }).isVisible()) azules.push(page);
    expect(azules, 'el Equipo Azul tiene dos jugadores').toHaveLength(2);
    const [azul, companero] = azules as [Page, Page];
    const rojo = paginas.find((page) => !azules.includes(page))!;
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);

    // Cada equipo elige su secreto en el diálogo (con el buscador del tablero, sin plazo).
    const elegir = async (page: Page, indice: number) => {
      await page.getByRole('button', { name: 'Elegir nuestro Pokémon' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Elige vuestro Pokémon secreto' });
      await expect(dialogo).toBeVisible();
      await dialogo.locator('[data-candidate]').nth(indice).click();
      await dialogo.getByTestId('who-confirm').click();
      await expect(dialogo).toBeHidden({ timeout: 5_000 });
    };
    await elegir(azul, 0);
    await expect(placa(rojo)).toHaveText('Elegid vuestro Pokémon secreto');
    await expect(rojo.getByTestId('who-team-BLUE')).toContainText('Secreto elegido');
    await elegir(rojo, 1);
    await expect(titulo(azul)).toHaveText('Vuestro turno', { timeout: 10_000 });
    const secretoAzul = await leerSecreto(azul);
    const secretoRojo = await leerSecreto(rojo);
    // El compañero ve el mismo secreto; el rival solo el suyo (el secreto ajeno no está en ningún panel de su DOM).
    expect(await leerSecreto(companero)).toBe(secretoAzul);
    await expect(secretoEn(rojo)).toHaveCount(1);
    await expect(secretoEn(rojo)).not.toContainText(secretoAzul);
    await expect(secretoEn(azul)).not.toContainText(secretoRojo);
    await expect(titulo(rojo)).toHaveText('Turno del Equipo Azul');
    await expect(placa(rojo)).toHaveText('Os toca responder');
    await expect(rojo.getByRole('button', { name: 'Terminar turno' })).toHaveCount(0);
    await expect(adivinar(rojo)).toBeDisabled();
    await expect(viva(azul)).toHaveText('Turno 1: os toca a vosotros.');

    // Cartas que no son ninguno de los secretos (y un fallo para luego).
    const nombres = (await tablero(azul).locator('[data-pokemon-id] [data-part="name"]').allInnerTexts()).map((nombre) => nombre.trim());
    const libres = nombres.filter((nombre) => nombre !== secretoAzul && nombre !== secretoRojo);
    const [c1, c2, c3, fallo] = libres as [string, string, string, string];
    // Ratón: baja c1; el compañero la ve bajada; el rival, no.
    await carta(azul, c1).click();
    await expect(carta(azul, c1)).toHaveAttribute('aria-pressed', 'true');
    await expect(carta(azul, c1)).toContainText('Bajada');
    await expect(carta(companero, c1)).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await expect(carta(rojo, c1)).toHaveAttribute('aria-pressed', 'false');
    // Teclado: Tab entra en una sola carta (la última usada), las flechas se mueven y Espacio baja.
    await carta(azul, c2).focus();
    await azul.keyboard.press('Space');
    await expect(carta(azul, c2)).toHaveAttribute('aria-pressed', 'true');
    await azul.keyboard.press('End');
    await expect(tablero(azul).locator('button[data-pokemon-id]').last()).toBeFocused();
    await azul.keyboard.press('Home');
    await expect(tablero(azul).locator('button[data-pokemon-id]').first()).toBeFocused();
    await expect(tablero(azul).locator('button[data-pokemon-id][tabindex="0"]')).toHaveCount(1);
    // Ratón otra vez: levanta c2 y baja c3.
    await carta(azul, c2).click();
    await expect(carta(azul, c2)).toHaveAttribute('aria-pressed', 'false');
    await carta(azul, c3).click();
    await expect(carta(companero, c3)).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await expect(azul.getByText(`2 de ${nombres.length} bajadas`)).toBeVisible();

    // El cursor del compañero: se ve en la página de Azul con su nombre y no tapa la carta que señala.
    const cursorDe = (page: Page, nombre: string) => page.getByTestId('who-cursor').and(page.locator(`[data-player="${nombre}"]`));
    const senalar = async (page: Page, nombre: string) => {
      const caja = (await carta(page, nombre).boundingBox())!;
      await page.mouse.move(caja.x + caja.width * 0.3, caja.y + caja.height * 0.3);
      await page.mouse.move(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5, { steps: 4 });
    };
    await senalar(companero, c1);
    await expect(cursorDe(azul, nombreDe(companero))).toBeVisible({ timeout: 5_000 });
    expect(await sinTapar(carta(azul, c1)), 'el cursor no tapa la carta (no captura el puntero)').toBe(true);
    // La etiqueta va fuera de la franja del nombre de la carta señalada y, quieta 1,5 s, se apaga (queda la flecha).
    const etiqueta = cursorDe(azul, nombreDe(companero)).getByTestId('who-cursor-name');
    await expect(etiqueta).toHaveAttribute('data-quiet', 'false');
    const [cajaEtiqueta, cajaNombre] = await Promise.all([etiqueta.boundingBox(), carta(azul, c1).locator('[data-part="name"]').boundingBox()]);
    const pisa = cajaEtiqueta!.x < cajaNombre!.x + cajaNombre!.width && cajaNombre!.x < cajaEtiqueta!.x + cajaEtiqueta!.width && cajaEtiqueta!.y < cajaNombre!.y + cajaNombre!.height && cajaNombre!.y < cajaEtiqueta!.y + cajaEtiqueta!.height;
    expect(pisa, 'la etiqueta del cursor no pisa el nombre de la carta señalada').toBe(false);
    // Ni la marca «Bajada» de la carta señalada (c1 está bajada).
    const marca = await carta(azul, c1).getByText('Bajada', { exact: true }).boundingBox();
    if (marca) {
      const tapa = cajaEtiqueta!.x < marca.x + marca.width && marca.x < cajaEtiqueta!.x + cajaEtiqueta!.width && cajaEtiqueta!.y < marca.y + marca.height && marca.y < cajaEtiqueta!.y + cajaEtiqueta!.height;
      expect(tapa, 'la etiqueta del cursor no tapa la marca «Bajada»').toBe(false);
    }
    await expect(etiqueta).toHaveAttribute('data-quiet', 'true', { timeout: 3_000 });
    await senalar(companero, c1);
    // Con movimiento reducido (por defecto en la suite) no se anima; sin él, una transición corta de `transform`.
    expect(await cursorDe(azul, nombreDe(companero)).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await conMovimiento(azul);
    expect(await cursorDe(azul, nombreDe(companero)).evaluate((el) => `${getComputedStyle(el).transitionProperty} ${getComputedStyle(el).transitionDuration}`)).toBe('transform 0.08s');
    await azul.emulateMedia({ reducedMotion: 'reduce' });
    // El rival nunca recibe los cursores de Azul.
    await expect(rojo.getByTestId('who-cursor')).toHaveCount(0);
    // Tablero con el cursor a los tres tamaños (el cursor caduca a los 4 s quieto: se mueve antes de cada captura).
    const cartas: Record<number, number> = {};
    for (const { w, h } of SIZES) {
      await azul.setViewportSize({ width: w, height: h });
      await azul.evaluate(() => window.scrollTo(0, 0));
      await senalar(companero, c1);
      await expect(cursorDe(azul, nombreDe(companero))).toBeVisible({ timeout: 5_000 });
      await azul.waitForFunction(() => [...document.images].every((img) => img.complete), undefined, { timeout: 3_000 }).catch(() => undefined);
      const { id, problems } = await layoutProblems(azul, 'juego-who-is-who-tablero', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
      cartas[w] = Number(await tablero(azul).getAttribute('data-card'));
      // En escritorio el tablero de 24 cabe entero: su panel no se desplaza.
      if (w >= 1024) expect(await tablero(azul).evaluate((el) => { const cuerpo = el.closest('[role="region"]')!; return cuerpo.scrollHeight - cuerpo.clientHeight; }), `${w}: el tablero cabe sin desplazar`).toBeLessThanOrEqual(1);
    }
    test.info().annotations.push({ type: 'cartas', description: `ancho de carta a 1280: ${cartas[1280]} px; a 1920: ${cartas[1920]} px; a 390: ${cartas[390]} px` });
    expect(cartas[1920]!, 'a 1920 las cartas crecen').toBeGreaterThan(cartas[1280]! * 1.25);
    // A 390×844 sin desplazar: el tablero y las acciones del turno.
    await azul.evaluate(() => window.scrollTo(0, 0));
    await expect(tablero(azul)).toBeInViewport();
    await expect(adivinar(azul)).toBeInViewport({ ratio: 1 });
    await expect(azul.getByRole('button', { name: 'Terminar turno' })).toBeInViewport({ ratio: 1 });
    // Placa compacta: se ven al menos dos filas enteras del tablero, sin tapar.
    const columnas = Number(await tablero(azul).getAttribute('data-columns'));
    const segundaFila = tablero(azul).locator('button[data-pokemon-id]').nth(columnas);
    await expect(segundaFila).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(segundaFila), 'a 390: la segunda fila del tablero sin tapar por la placa').toBe(true);
    await azul.setViewportSize({ width: 1280, height: 720 });

    // «Adivinar Pokémon»: el diálogo del catálogo con todas las cartas (las bajadas lo dicen) y el buscador.
    await adivinar(azul).click();
    const dialogo = azul.getByRole('dialog', { name: 'Adivinar Pokémon' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.locator('[data-candidate]')).toHaveCount(nombres.length);
    await expect(dialogo.getByRole('button', { name: `${c1} (bajada)` })).toBeVisible();
    await expect(dialogo.getByRole('textbox', { name: 'Buscar en el tablero' })).toBeFocused();
    await dialogo.getByRole('textbox', { name: 'Buscar en el tablero' }).fill(fallo);
    await dialogo.getByRole('button', { name: fallo, exact: true }).click();
    await expect(dialogo.getByTestId('who-confirm')).toHaveText(`Confirmar ${fallo}`);
    await capturarTamanos(azul, 'dialogo-who-is-who-adivinar', { sigue: dialogo });
    // Un intento que el servidor rechaza: el aviso global lo dice, el diálogo sigue abierto y el foco vuelve a «Confirmar».
    trucadores.get(azul)!.trucarSiguiente();
    await dialogo.getByTestId('who-confirm').click();
    await expect(azul.getByRole('alert').filter({ hasText: 'Ese Pokémon no está en el tablero.' })).toBeVisible({ timeout: 5_000 });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByTestId('who-confirm')).toBeFocused();
    // Cerrar y mover el ratón por el tablero (cursores por su canal propio): el aviso sigue ahí.
    await azul.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await senalar(azul, c3);
    await expect(cursorDe(companero, nombreDe(azul))).toBeVisible({ timeout: 5_000 });
    await expect(azul.getByRole('alert').filter({ hasText: 'Ese Pokémon no está en el tablero.' })).toBeVisible();
    // El fallo de verdad: pasa el turno al Equipo Rojo.
    await adivinar(azul).click();
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('textbox', { name: 'Buscar en el tablero' }).fill(fallo);
    await dialogo.getByRole('button', { name: fallo, exact: true }).click();
    await dialogo.getByTestId('who-confirm').click();
    await expect(dialogo).toBeHidden({ timeout: 5_000 });
    await expect(titulo(azul)).toHaveText('Turno del Equipo Rojo', { timeout: 5_000 });
    await expect.poll(() => sinBody(azul), { timeout: 3_000 }).toBe(true);
    await expect(azul.getByText(`Tu intento con ${fallo} no era: turno terminado.`)).toBeVisible();
    await expect(viva(rojo)).toHaveText(`${nombreDe(azul)} (Equipo Azul) probó ${fallo}: no era. Turno 2: os toca a vosotros.`);
    await expect(titulo(rojo)).toHaveText('Vuestro turno');
    await expect(rojo.getByTestId('who-guess').first()).toContainText(fallo);
    await expect(rojo.getByTestId('who-guess').first()).toContainText('No era');
    await capturarTamanos(rojo, 'juego-who-is-who-turno-rival', { sigue: titulo(rojo).filter({ hasText: 'Vuestro turno' }) });

    // Turno 2: Rojo acierta el secreto azul (leído de la página de Azul) y gana.
    await adivinar(rojo).click();
    const dialogoRojo = rojo.getByRole('dialog', { name: 'Adivinar Pokémon' });
    await dialogoRojo.getByRole('textbox', { name: 'Buscar en el tablero' }).fill(secretoAzul);
    await dialogoRojo.getByRole('button', { name: new RegExp(`^${secretoAzul.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(bajada\\))?$`) }).click();
    await dialogoRojo.getByTestId('who-confirm').click();
    for (const page of paginas) await expect(page.getByRole('heading', { name: '¡Ganó el Equipo Rojo!', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByTestId('who-result-BLUE')).toContainText(`Secreto: ${secretoAzul}`);
    await expect(host.page.getByTestId('who-result-RED')).toContainText(`Secreto: ${secretoRojo}`);
    await expect(host.page.getByText('El Equipo Rojo adivinó el secreto rival: cada uno de sus jugadores suma 10 puntos.')).toBeVisible();
    await expect(host.page.getByText('1 acierto · 0 fallos')).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-who-is-who-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Modos de juego (Fase 3): un recorrido por modo, filtrable con `-g "<nombre del modo>"`. Cada uno marca solo ese modo en
// los ajustes del juego, comprueba el chip de la carta del lobby, juega con ajustes mínimos hasta los resultados y captura la
// pantalla de juego y la de resultados a los tres tamaños.
// ---------------------------------------------------------------------------------------------------------------------

/** Deja marcado solo `modo` en «Modos que se juegan» de los ajustes del juego (lo marca y desmarca Clásico). */
async function elegirModo(host: Page, modo: string): Promise<void> {
  await host.getByRole('tab', { name: 'Configuración' }).click();
  // «Modos que se juegan»: se marca el modo y se desmarca Clásico, así la sesión solo juega ese modo.
  const modos = host.getByRole('group', { name: 'Modos que se juegan' });
  const opcion = modos.getByRole('button', { name: modo, exact: true });
  const clasico = modos.getByRole('button', { name: 'Clásico', exact: true });
  await opcion.click();
  await expect(opcion).toHaveAttribute('aria-pressed', 'true');
  await clasico.click();
  await expect(clasico).toHaveAttribute('aria-pressed', 'false');
}

/** Pone un deslizador del panel de ajustes en su mínimo o su máximo. */
async function ajustarRango(page: Page, nombre: string, tecla: 'Home' | 'End', valor: string): Promise<void> {
  const rango = page.getByRole('slider', { name: nombre });
  await rango.focus();
  await rango.press(tecla);
  await rango.blur();
  await expect(rango).toHaveValue(valor);
}

/** La carta del juego en el lobby lleva el chip con el nombre del modo. */
async function comprobarChipDeCarta(page: Page, juego: string, modo: string): Promise<Locator> {
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
  const carta = page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').filter({ has: page.getByText(juego, { exact: true }) });
  await expect(carta.getByText(modo, { exact: true })).toBeVisible();
  // La carta con el chip a la vista (la lista del lobby se desplaza por dentro) para que la captura la enseñe.
  await carta.scrollIntoViewIfNeeded();
  return carta;
}

/** Capturas a los tres tamaños con `objetivo` a la vista en cada uno (el cambio de tamaño devuelve el desplazamiento al principio). */
async function capturarMostrando(page: Page, nombre: string, objetivo: Locator, { sigue }: { sigue?: Locator } = {}): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    // Al centro de la vista: lo que queda justo sobre la pantalla inferior fija (en el móvil) cuenta como visible para Playwright.
    await objetivo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(objetivo, `${nombre}: el objetivo se ve a ${w}×${h}`).toBeInViewport();
    const { id, problems } = await layoutProblems(page, nombre, true);
    if (sigue) await expect(sigue, `${nombre}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 });
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** El título de la cabecera de sala a 1280×720 lleva «<Juego> · <Modo>» mientras se juega. */
async function comprobarTituloDeCabecera(page: Page, titulo: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('header, [data-layer="screen-top"]').getByText(titulo, { exact: true }).first()).toBeVisible();
}

/** Las cartas de una misma fila del lobby miden lo mismo: el chip del modo no estira solo la carta del juego con modo. */
async function comprobarAlturaDeCartas(page: Page): Promise<void> {
  const cajas = await page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').evaluateAll((items) => items.map((item) => { const r = item.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; }));
  const porFila = new Map<number, Set<number>>();
  for (const { top, height } of cajas) porFila.set(top, (porFila.get(top) ?? new Set<number>()).add(height));
  for (const [top, alturas] of porFila) expect(alturas.size, `cartas de la fila en y=${top} con alturas distintas: ${[...alturas].join(', ')}`).toBe(1);
}

test('pokedex-distance: modo Por puntos, tres rondas sin eliminar a nadie y clasificación por puntos', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokédex Distance');
    await elegirModo(host.page, 'Por puntos');
    await ajustarRango(host.page, 'Número de rondas', 'Home', '3');
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    const carta = await comprobarChipDeCarta(host.page, 'Pokédex Distance', 'Por puntos');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-por-puntos', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(buscador(host.page)).toBeVisible({ timeout: 20_000 });
    // Cabecera de la ronda: «Ronda 1 de 3», chip del modo y puntos.
    await expect(host.page.getByText('Ronda 1 de 3', { exact: true }).first()).toBeVisible();
    await expect(host.page.getByText('Por puntos', { exact: true }).first()).toBeVisible();
    await comprobarTituloDeCabecera(host.page, 'Pokédex Distance · Por puntos');
    // Elige solo el host: el resto sigue pensando y el juego se captura a los tres tamaños.
    await elegirPokemon(host.page, 'Pikachu');
    await expect(host.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ })).toBeVisible({ timeout: 10_000 });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-por-puntos', { sigue: host.page.getByText('Ronda 1 de 3', { exact: true }).first() });
    for (const { page } of invitados) await elegirPokemon(page, 'Pikachu');

    // Rondas 2 y 3: todos eligen; nadie cae en ninguna.
    for (const ronda of [2, 3]) {
      for (const { page } of jugadores) {
        await expect(page.getByText(`Ronda ${ronda} de 3`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
        await expect(buscador(page)).toBeVisible({ timeout: 20_000 });
        await elegirPokemon(page, 'Pikachu');
      }
    }
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion).toBeVisible({ timeout: 30_000 });
    await expect(clasificacion.getByRole('listitem')).toHaveCount(3);
    await expect(host.page.getByText('Pokédex Distance · Por puntos', { exact: false }).first()).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-por-puntos-resultados', { sigue: clasificacion, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('higher-lower: modo Racha infinita, fallos que eliminan y clasificación por racha', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Higher or Lower');
    await elegirModo(host.page, 'Racha infinita');
    // Sin número de rondas en este modo.
    await expect(host.page.getByRole('slider', { name: 'Número de rondas' })).toHaveCount(0);
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    const carta = await comprobarChipDeCarta(host.page, 'Higher or Lower', 'Racha infinita');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-racha-infinita', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const boton = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });
    await expect(boton(host.page, 'Mayor')).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('Racha infinita', { exact: true }).first()).toBeVisible();
    await expect(host.page.getByText('Ronda 1', { exact: true }).first()).toBeVisible();
    await comprobarTituloDeCabecera(host.page, 'Higher or Lower · Racha infinita');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-racha-infinita', { sigue: boton(host.page, 'Mayor') });

    // Cada uno responde distinto: Igual casi nunca acierta, así que cae al menos uno en cada ronda hasta que no quede nadie.
    const respuestas = ['Mayor', 'Menor', 'Igual'];
    const fin = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower' });
    let capturadaRonda2 = false;
    for (let ronda = 1; ronda <= 40 && !(await fin.isVisible()); ronda += 1) {
      await expect.poll(async () => {
        if (await fin.isVisible()) return true;
        for (const { page } of jugadores) if (await boton(page, 'Mayor').isVisible()) return true;
        return false;
      }, { timeout: 30_000 }).toBe(true);
      if (await fin.isVisible()) break;
      // A partir de la segunda ronda queda alguien con racha: su columna «N racha» a los tres tamaños.
      if (ronda === 2 && !capturadaRonda2) {
        capturadaRonda2 = true;
        const vivo = (await Promise.all(jugadores.map(async ({ page }) => (await boton(page, 'Mayor').isVisible()) ? page : null))).find(Boolean)!;
        await expect(vivo.locator('[data-streak]').filter({ hasText: /^\d+ racha$/ }).first()).toBeVisible();
        await capturarMostrando(vivo, 'juego-modo-racha-infinita-racha', vivo.locator('[data-streak]').filter({ hasText: /^\d+ racha$/ }).first(), { sigue: boton(vivo, 'Mayor') });
      }
      for (const [i, { page }] of jugadores.entries()) {
        if (await boton(page, 'Mayor').isVisible()) await boton(page, respuestas[i]!).click().catch(() => undefined);
      }
    }
    await expect(fin).toBeVisible({ timeout: 30_000 });
    await expect(host.page.getByText(/Higher or Lower · Racha infinita · \d+ rondas?/)).toBeVisible();
    await expect(host.page.getByText(/^Racha \d+$/).first()).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-racha-infinita-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('shiny-vote: modo Supervivencia, un fallo elimina y clasificación por rondas', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Shiny Quiz');
    await elegirModo(host.page, 'Supervivencia');
    await ajustarRango(host.page, 'Duración de la revelación', 'Home', '3');
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    const carta = await comprobarChipDeCarta(host.page, 'Shiny Quiz', 'Supervivencia');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-supervivencia', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const opcion = (page: Page, letra: string) => page.locator(`[data-shiny-option="${letra}"]`);
    await expect(opcion(host.page, 'A')).toBeEnabled({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ candidatos$/).first()).toBeVisible();
    await comprobarTituloDeCabecera(host.page, 'Shiny Quiz · Supervivencia');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-supervivencia', { sigue: opcion(host.page, 'A') });

    // Cada uno vota una opción distinta: como mucho uno acierta; los demás caen. Se sigue hasta que no queda nadie. Solo
    // quien sigue en pie tiene las cartas como botones («Opción A: …»); cada uno vota una vez por ronda.
    const letras = ['A', 'B', 'C'];
    const fin = host.page.getByRole('heading', { name: 'Clasificación shiny' });
    const votaEnRonda = new Map<Page, string>();
    let capturadaRonda2 = false;
    await expect.poll(async () => {
      if (await fin.isVisible()) return true;
      for (const [i, { page }] of jugadores.entries()) {
        const carta = page.getByRole('button', { name: new RegExp(`^Opción ${letras[i]}:`) });
        if (!(await carta.isVisible())) continue;
        const ronda = await page.getByText(/^Ronda \d+ de \d+$/).first().innerText();
        if (votaEnRonda.get(page) === ronda) continue;
        if (ronda.startsWith('Ronda 2 ') && !capturadaRonda2) {
          capturadaRonda2 = true;
          await capturarTamanos(page, 'juego-modo-supervivencia-ronda-2', { sigue: carta });
        }
        votaEnRonda.set(page, ronda);
        await carta.click();
        await page.getByRole('button', { name: 'Confirmar voto' }).click();
      }
      return false;
    }, { timeout: 150_000, intervals: [400] }).toBe(true);
    await expect(fin).toBeVisible({ timeout: 30_000 });
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-supervivencia-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('type-duel: modo Cooperativo, búsqueda conjunta contra el reloj y resultado del grupo', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Type Duel');
    await elegirModo(host.page, 'Cooperativo');
    // Sin los tiempos del duelo: solo la búsqueda conjunta (30 s, el mínimo) y una ronda.
    await expect(host.page.getByRole('slider', { name: 'Tiempo para elegir tipo' })).toHaveCount(0);
    await expect(host.page.getByRole('slider', { name: 'Tiempo para buscar' })).toHaveCount(0);
    await ajustarRango(host.page, 'Tiempo de búsqueda conjunta', 'Home', '30');
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    const carta = await comprobarChipDeCarta(host.page, 'Type Duel', 'Cooperativo');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-cooperativo', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    await comprobarTituloDeCabecera(host.page, 'Type Duel · Cooperativo');

    // La combinación es pública: se busca en la BD un Pokémon de ese tipo exacto (nombre sin guiones) y lo dice el primer invitado.
    const tablero = (page: Page) => page.getByTestId('type-duel-coop-board');
    await expect(tablero(host.page)).toBeVisible({ timeout: 20_000 });
    const tipos = [...new Set(await tablero(host.page).locator('[data-type]').evaluateAll((els) => els.map((el) => el.getAttribute('data-type')!)))];
    const nombres = psql(
      `SELECT p.id FROM "Pokemon" p WHERE p."isDefault" AND p.id !~ '-' AND (SELECT array_agg(a."typeId" ORDER BY a."typeId") FROM "PokemonTypeAssignment" a WHERE a."pokemonId" = p.id) = (SELECT array_agg(t ORDER BY t) FROM unnest(string_to_array(:'tipos', ',')) AS t) ORDER BY p."nationalDexNumber" LIMIT 3;`,
      { tipos: tipos.join(',') },
    ).split('\n').filter(Boolean);
    test.info().annotations.push({ type: 'coop', description: `combinación ${tipos.join('/')}; candidatos ${nombres.join(', ')}` });
    expect(nombres.length, `Pokémon de la combinación ${tipos.join('/')} en la BD`).toBeGreaterThan(0);

    const primero = invitados[0]!.page;
    const buscador = primero.getByLabel('Buscar Pokémon con esos tipos');
    await expect(buscador).toBeVisible({ timeout: 10_000 });
    // Búsqueda abierta (antes de decir nada: con una sola solución, el primer acierto cierra la ronda).
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-cooperativo', { sigue: tablero(host.page) });
    const candidatos = primero.locator('.pokemon-selector-results button');
    await buscador.fill(nombres[0]!);
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    await expect(candidatos.first()).toBeEnabled({ timeout: 5_000 });
    await buscador.press('Enter');
    // El acierto cuenta para todos: aparece en la lista «Encontrados» de cada página, con quién lo encontró.
    for (const { page } of jugadores) await expect(page.getByText(/Lo encontr(ó|aste)/).first()).toBeVisible({ timeout: 10_000 });

    // Con una sola solución la ronda cierra al encontrarla; con varias, al agotarse los 30 s: resultado del grupo.
    const resultado = host.page.getByTestId('type-duel-coop-result');
    await expect(resultado).toBeVisible({ timeout: 45_000 });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-cooperativo-ronda', { sigue: resultado });
    await host.page.getByRole('button', { name: 'Ver clasificación' }).click();
    const fin = host.page.getByRole('heading', { name: 'Resultado del grupo' });
    await expect(fin).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/Type Duel · Cooperativo · 1 ronda/)).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-cooperativo-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
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

test('pokemon-impostor: modo Una palabra, dos vueltas de pistas por ronda, votación y victoria por tres rondas sin expulsión', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await elegirModo(host.page, 'Una palabra');
    const carta = await comprobarChipDeCarta(host.page, 'Pokémon Impostor', 'Una palabra');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-una-palabra', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(pages);
    await comprobarTituloDeCabecera(host.page, 'Pokémon Impostor · Una palabra');

    const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
    const saltar = (page: Page) => page.getByRole('button', { name: 'Saltar', exact: true });
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    // Tres rondas sin expulsión (todos saltan): en cada una, dos vueltas de pistas (3 turnos cada una) con la insignia
    // «Ronda c · Vuelta k» y, tras la segunda vuelta, la votación con «Ronda c» a secas.
    for (const ronda of [1, 2, 3]) {
      for (const vuelta of [1, 2]) {
        for (let turno = 0; turno < 3; turno++) {
          const page = await primeraVisible(pages, campo, 30_000);
          await expect(page.getByText(`Ronda ${ronda} · Vuelta ${vuelta}`, { exact: true }).first()).toBeVisible();
          await expect(page.getByText(/^Una sola palabra · \d+\//)).toBeVisible();
          if (ronda === 1 && vuelta === 2 && turno === 1) await capturarTamanos(page, 'juego-modo-una-palabra', { sigue: campo(page) });
          // Se espera a ver la pista en el orden de turnos (se mantiene toda la ronda) antes de pasar al turno siguiente: quien cierra
          // una vuelta abre la siguiente y su campo puede seguir a la vista.
          const pista = `pista${ronda}${vuelta}${turno}`;
          await campo(page).fill(pista);
          await campo(page).press('Enter');
          // El último turno de la segunda vuelta pasa a la votación: ahí se espera a «Saltar».
          if (vuelta === 1 || turno < 2) await expect(page.getByText(`«${pista}»`).first()).toBeVisible();
        }
      }
      for (const page of pages) await expect(saltar(page)).toBeVisible({ timeout: 20_000 });
      await expect(host.page.getByText(`Ronda ${ronda}`, { exact: true }).first()).toBeVisible();
      await expect(host.page.getByText(/Vuelta \d/)).toHaveCount(0);
      if (ronda === 1) await capturarTamanos(host.page, 'juego-modo-una-palabra-votacion', { sigue: saltar(host.page) });
      for (const page of pages) {
        await saltar(page).click();
        await confirmar(page).click();
      }
      for (const page of pages) await expect(page.getByText('Se salta la votación: nadie es expulsado')).toBeVisible({ timeout: 10_000 });
    }
    const titulo = host.page.getByRole('heading', { name: 'Ganan los impostores' });
    await expect(titulo).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/Una palabra/).first()).toBeVisible();
    await capturarTamanos(host.page, 'juego-modo-una-palabra-resultados', { sigue: titulo, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
