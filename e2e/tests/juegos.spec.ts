/**
 * Un test por minijuego del registro (`backend/src/main/resources/games/registry.json`) contra el `/ws`
 * del backend Java (`npm run test:e2e -- juegos`):
 * sala nueva con `max(3, minPlayers)` invitados, selección del juego, listos, «Empezar partida» y
 * comprobación de que la partida sale del lobby y pinta su pantalla sin desbordes a 1280×720.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, psql, seleccionarJuego, SIZES, type Jugador, type SalaConJugadores } from '../src/helpers.js';

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

/** Un juego de cada lote de la etapa 2B (y Higher or Lower, de la Fase 0): se captura a los tres tamaños de revisión. */
const SCREENSHOT_GAMES = new Set(['type-duel', 'higher-lower', 'poke-taboo', 'most-likely-to', 'learnset-guess', 'whos-that-pokemon', 'who-is-who-pokemon', 'pokemon-bingo', 'sketchmon']);

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
 * Con `claro`, añade `<nombre>-claro` (a 1280×720 o al tamaño dado) cambiando el tema en caliente (como hace el selector de tema).
 * Con `completa`, el PNG es de página completa (para paneles más altos que la vista; el medidor ya mide toda la página).
 */
async function capturarTamanos(page: Page, nombre: string, { sigue, claro = false, completa = false }: { sigue?: Locator; claro?: boolean | { w: number; h: number }; completa?: boolean } = {}): Promise<void> {
  const comprobar = async () => { if (sigue) await expect(sigue, `${nombre}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 }); };
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), undefined, { timeout: 3_000 }).catch(() => undefined);
    const { id, problems } = await layoutProblems(page, nombre, true, completa);
    await comprobar();
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  }
  if (claro) {
    const { w, h } = claro === true ? SIZES[0] : claro;
    await page.setViewportSize({ width: w, height: h });
    const previo = await page.evaluate(() => { const actual = document.documentElement.dataset.theme ?? 'dark'; document.documentElement.dataset.theme = 'light'; return actual; });
    const { id, problems } = await layoutProblems(page, `${nombre}-claro`, true, completa);
    await page.evaluate((tema) => { document.documentElement.dataset.theme = tema; }, previo);
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

test('type-duel: resultado con tipos', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Type Duel');
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    for (const { page } of jugadores) await expect(page.getByRole('heading', { name: 'Elegid un tipo en secreto' })).toBeVisible({ timeout: 20_000 });
    // Los dos duelistas son las páginas con los botones de tipo; los dos eligen Fuego.
    let elegidos = 0;
    for (const { page } of jugadores) {
      const fuego = page.getByRole('button', { name: 'Elegir tipo Fuego' });
      if (await fuego.isVisible()) { await fuego.click(); elegidos++; }
    }
    expect(elegidos, 'duelistas que eligen tipo').toBe(2);

    // Nadie busca: la búsqueda de 20 s termina en «Tiempo agotado» y el host no pulsa «Siguiente ronda».
    const titulo = host.page.getByRole('heading', { name: 'Tiempo agotado' });
    await expect(titulo).toBeVisible({ timeout: 30_000 });
    const tarjeta = host.page.locator('.card').filter({ hasText: 'Resultado del duelo' });
    await expect(tarjeta.locator('[aria-label="Tipo Fuego"]')).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-resultado', { sigue: titulo, claro: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokemon-impostor: votación con Saltar', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await iniciarPartida(host.page, invitados.map((j) => j.page));

    // Tres turnos de pista: cada vez, la página con el campo visible escribe y envía.
    const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
    for (let turno = 0; turno < 3; turno++) {
      const page = await primeraVisible(pages, campo);
      await campo(page).fill('pista');
      await campo(page).press('Enter');
      await expect(campo(page)).toBeHidden();
    }

    const saltar = (page: Page) => page.getByRole('button', { name: 'Saltar', exact: true });
    for (const page of pages) await expect(saltar(page)).toBeVisible({ timeout: 15_000 });
    await capturarTamanos(host.page, 'juego-pokemon-impostor-votacion', { sigue: saltar(host.page), claro: true });

    for (const page of pages) {
      await saltar(page).click();
      await page.getByRole('button', { name: 'Confirmar voto' }).click();
    }
    await expect(host.page.getByText('Se salta la votación: nadie es expulsado')).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText('Ronda 2', { exact: true })).toBeVisible({ timeout: 15_000 });
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
    // En claro a 1920×1080, donde caben el panel y el aviso de la columna de la sala.
    await capturarTamanos(host.page, 'lobby-config-pokemon-impostor', { claro: { w: 1920, h: 1080 } });
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
    await capturarTamanos(page, 'lobby-rotacion-impostor-omitido', { claro: { w: 1920, h: 1080 } });
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
    await capturarTamanos(page, 'lobby-como-se-juega', { sigue: dialogo, claro: true });
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
    await capturarTamanos(page, 'lobby-rotacion', { claro: true, completa: true });
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
    await iniciarPartida(host.page, invitados.map((j) => j.page));

    // Todos responden: la ronda se revela en cuanto contesta el último y el revelado dura 3 s. Se captura un solo
    // tamaño (390×844, el de los botones de respuesta), fijado antes de la última respuesta; la pantalla activa ya está
    // a los tres tamaños en el test por juego. El host contesta primero (su clic desplaza la página) y la última
    // respuesta es de un invitado.
    const mayor = (page: Page) => page.getByRole('button', { name: 'Mayor', exact: true });
    await mayor(host.page).click({ timeout: 20_000 });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    for (const { page } of invitados) await mayor(page).click({ timeout: 20_000 });
    const revelado = host.page.getByText(/^Respuesta: (Mayor|Igual|Menor)$/);
    await expect(revelado).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText(/^Clasificación en \ds…$/)).toBeVisible();
    const { id, problems } = await layoutProblems(host.page, 'juego-higher-lower-revelado', true);
    await expect(revelado, `${id}: el revelado sigue en pantalla`).toBeVisible({ timeout: 1_000 });
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    await host.page.setViewportSize({ width: 1280, height: 720 });

    const clasificacion = host.page.getByRole('heading', { name: 'Clasificación Higher or Lower' });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    // Plurales de las estadísticas: nunca «1 aciertos» ni «1 iguales».
    await expect(host.page.getByText(/\d+ aciertos? · \d+ igual(es)? · mejor racha/).first()).toBeVisible();
    await expect(host.page.getByText(/(^|\D)1 (aciertos|iguales)/)).toHaveCount(0);
    await capturarTamanos(host.page, 'juego-higher-lower-clasificacion', { claro: true });
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
    const ocultas = host.page.getByRole('button', { name: 'Ocultas', exact: true });
    const visibles = host.page.getByRole('button', { name: 'Visibles', exact: true });
    await expect(ocultas).toHaveAttribute('aria-pressed', 'true');
    const aviso = host.page.getByText('Permite copiar: los demás ven tu elección al momento.');
    await expect(aviso).toHaveCount(0);
    await visibles.click();
    await expect(visibles).toHaveAttribute('aria-pressed', 'true');
    await expect(aviso).toBeVisible();
    // Desde arriba, como el resto de capturas del lobby: con la página desplazada la cabecera fija solapa las pestañas.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    // Página completa: a 390×844 el grupo «Elecciones de los rivales» queda bajo las generaciones.
    await capturarTamanos(host.page, 'lobby-config-pokedex-distance', { claro: { w: 1920, h: 1080 }, completa: true });
    await ocultas.click();
    await expect(ocultas).toHaveAttribute('aria-pressed', 'true');
    await expect(aviso).toHaveCount(0);
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));

    // Un invitado elige: él ve su confirmación (estado privado) y el host solo ve que ya ha elegido, nunca el Pokémon.
    const [eligeAntes] = invitados;
    const buscador = eligeAntes!.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await buscador.fill('Pikachu', { timeout: 20_000 });
    // El catálogo del buscador llega por HTTP: se espera a la coincidencia antes de elegirla.
    await eligeAntes!.page.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    await expect(eligeAntes!.page.getByRole('heading', { name: /Selección confirmada|EXACT HIT/ })).toBeVisible({ timeout: 10_000 });
    const yaHaElegido = host.page.getByText('✓ Ya ha elegido', { exact: true });
    await expect(yaHaElegido).toHaveCount(1, { timeout: 10_000 });
    await expect(host.page.getByText(/→ Pikachu/)).toHaveCount(0);
    await expect(host.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-oculta', { sigue: yaHaElegido, claro: true });
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
    await capturarTamanos(host.page, 'juego-pokedex-distance-ronda-oculta', { sigue: enLaRonda, claro: true });

    // El tercero recarga: la app le ofrece «Volver a la sala» y vuelve al buscador antes de que venza la gracia de 10 s,
    // con la ronda aún abierta.
    const inicio = Date.now();
    await tercero.page.reload();
    await tercero.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(buscador(tercero.page)).toBeVisible({ timeout: 8_000 });
    expect(Date.now() - inicio, 'vuelta al buscador tras recargar (ms)').toBeLessThan(10_000);
    await expect(tercero.page.getByText('Estás observando')).toHaveCount(0);
    await expect(host.page.getByText('Resultado de la ronda')).toHaveCount(0);
    await expect(enLaRonda).toBeVisible();
    await expect(tercero.page.getByText(DISTANCE_PICKED, { exact: true })).toHaveCount(2);
    await elegirPokemon(tercero.page, 'Charmander');

    await expect(host.page.getByText('Resultado de la ronda')).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByRole('heading', { name: '⏱️ Tiempo agotado' })).toHaveCount(0);
    const tarjeta = host.page.locator('article').filter({ hasText: tercero.name });
    await expect(tarjeta).toContainText('Charmander');
    await expect(tarjeta).not.toContainText('Sin respuesta');
    expect(antiguas, 'peticiones a /api/pokemon').toEqual([]);
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
    // 60 s por ronda: caben las capturas a los tres tamaños y en claro.
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

    const buscador = host.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(buscador).toBeVisible({ timeout: 20_000 });
    // Autofoco sin desplazar la página: la cabecera fija no tapa nada.
    await expect(buscador).toBeFocused();
    expect(await host.page.evaluate(() => window.scrollY), 'desplazamiento tras el autofoco').toBe(0);
    await buscador.fill('zzzz');
    const vacio = host.page.getByText('No hay ningún Pokémon que coincida con “zzzz”.');
    await expect(vacio).toBeVisible({ timeout: 10_000 });
    const borrar = host.page.getByRole('button', { name: 'Borrar búsqueda' });
    await expect(borrar).toBeVisible();
    await capturarTamanos(host.page, 'juego-buscador-vacio', { sigue: vacio, claro: true });
    await borrar.click();
    await expect(buscador).toHaveValue('');
    await expect(buscador).toBeFocused();
    await expect(vacio).toHaveCount(0);

    const alerta = invitado.page.getByRole('alert').filter({ hasText: 'No se pudo cargar el buscador de Pokémon.' });
    await expect(alerta).toBeVisible({ timeout: 20_000 });
    await capturarTamanos(invitado.page, 'juego-buscador-error', { sigue: alerta, claro: true });
    bloqueado = false;
    await alerta.getByRole('button', { name: 'Reintentar' }).click();
    await expect(alerta).toHaveCount(0, { timeout: 10_000 });
    await elegirPokemon(invitado.page, 'Pikachu');
    await expect(invitado.page.getByRole('heading', { name: /Selección confirmada|EXACT HIT/ })).toBeVisible({ timeout: 10_000 });
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
    await expect(host.page.locator('article').filter({ hasText: invitado.name })).toContainText('Eliminado');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarAnotando(host.page, 'juego-pokedex-distance-empate-forzado', forzado);
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
    await iniciarPartida(host.page, [invitado.page]);
    const opcionA = (page: Page) => page.locator('[data-shiny-option="A"]');
    for (const { page } of jugadores) await expect(opcionA(page)).toBeEnabled({ timeout: 20_000 });
    const votantes = (page: Page) => page.locator('[data-testid^="shiny-voters-"]');

    // El host vota: el invitado ve que ha votado, pero ninguna carta muestra votantes hasta el revelado.
    await opcionA(host.page).click();
    await host.page.getByRole('button', { name: 'Confirmar voto' }).click();
    await expect(host.page.getByText('Voto confirmado:')).toBeVisible({ timeout: 10_000 });
    await expect(invitado.page.getByText('Votó', { exact: true })).toHaveCount(1, { timeout: 10_000 });
    for (const { page } of jugadores) await expect(votantes(page)).toHaveCount(0);
    await expect(invitado.page.getByText('Votos al revelar')).toBeVisible();
    await invitado.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(invitado.page, 'juego-shiny-vote-votos-al-revelar', { sigue: invitado.page.getByRole('button', { name: 'Confirmar voto' }), claro: true });

    // Vota el invitado: la ronda se revela y aparecen los votantes en las cartas.
    await opcionA(invitado.page).click();
    await invitado.page.getByRole('button', { name: 'Confirmar voto' }).click();
    for (const { page } of jugadores) await expect(votantes(page).first()).toBeVisible({ timeout: 10_000 });
    await expect(votantes(host.page).filter({ hasText: '2 votos' })).toHaveCount(1);
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
    const alRevelar = page.getByRole('button', { name: 'Al revelar', exact: true });
    const enDirecto = page.getByRole('button', { name: 'En directo', exact: true });
    const aviso = page.getByText('Permite copiar: los demás ven tu elección al momento.');
    await expect(alRevelar).toHaveAttribute('aria-pressed', 'true');
    await expect(enDirecto).toHaveAttribute('aria-pressed', 'false');
    await expect(aviso).toHaveCount(0);
    // El grupo de visibilidad queda bajo las categorías y la dificultad: captura de página completa desde arriba (con la
    // página desplazada, la cabecera fija taparía las categorías y el medidor lo cuenta como solape).
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(page, 'lobby-config-higher-lower', { claro: { w: 1920, h: 1080 }, completa: true });

    await enDirecto.click();
    await expect(enDirecto).toHaveAttribute('aria-pressed', 'true');
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
  visibleGroups: Array<{ level: number | null; moves: Array<{ moveId: string }> }>;
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
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));

    const seleccion = host.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(seleccion).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => (estado as LearnsetVisible | null)?.visibleGroups.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
    const candidatos = [...new Set(candidatosLearnset(estado!).map((id) => nombres.get(id)).filter((n): n is string => Boolean(n)))];
    test.info().annotations.push({ type: 'learnset', description: `candidatos: ${candidatos.join(', ')}` });
    // El host prueba como mucho cuatro (cada fallo tiene enfriamiento): fuera de 1..4 el test no es fiable y lo dice ya.
    expect(candidatos.length, `candidatos a la respuesta con los movimientos visibles (1..4): ${candidatos.join(', ') || 'ninguno'}`).toBeGreaterThanOrEqual(1);
    expect(candidatos.length, `demasiados candidatos para probarlos antes del final de la ronda: ${candidatos.join(', ')}`).toBeLessThanOrEqual(4);

    // El host prueba los candidatos hasta acertar; con dos jugadores, su acierto deja al invitado como el último.
    const acierto = host.page.getByRole('heading', { name: '¡Has acertado!' });
    for (const nombre of candidatos) {
      await expect(host.page.getByText(/^Espera .*s para confirmar otro intento\.$/)).toHaveCount(0, { timeout: 10_000 });
      await elegirPokemon(host.page, nombre);
      const resultado = await Promise.race([
        acierto.waitFor({ timeout: 5_000 }).then(() => true, () => false),
        host.page.getByText(/^Espera .*s para confirmar otro intento\.$/).waitFor({ timeout: 5_000 }).then(() => false, () => false),
      ]);
      if (resultado || await acierto.isVisible()) break;
    }
    await expect(acierto).toBeVisible({ timeout: 5_000 });
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
