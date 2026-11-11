/**
 * Un test por minijuego del registro (`backend/src/main/resources/games/registry.json`) contra el `/ws`
 * del backend Java (`npm run test:e2e -- juegos`):
 * sala nueva con `max(3, minPlayers)` invitados, selección del juego, listos, «Empezar partida» y
 * comprobación de que la partida sale del lobby y pinta su pantalla sin desbordes a 1280×720.
 * Aquí también van los tests del lobby con varios minijuegos; los recorridos de cada juego están en
 * `tests/juegos/<id>.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Response } from '@playwright/test';
import { anadirJuegos, crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, SIZES, type SalaConJugadores } from '../src/helpers.js';
import { ASSET_URL, capturarTamanos, JAVA_WS, SOCKET_IO, UNAVAILABLE } from '../src/juegos.js';

interface Manifest {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers?: number;
}

const registry = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/games/registry.json', import.meta.url), 'utf8')) as Manifest[];

/** Juegos que piden al servidor un sprite o un audio por opción de ronda. */
const ASSET_GAMES = new Set(['whos-that-pokemon', 'zoomed-pokemon', 'shiny-vote', 'pokemon-cry-quiz']);

/** Un juego de cada lote de la etapa 2B: se captura a los tres tamaños de revisión (Higher or Lower, en su propio test). */
const SCREENSHOT_GAMES = new Set(['shiny-vote', 'type-duel', 'poke-taboo', 'most-likely-to', 'learnset-guess', 'whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess', 'pokemon-cry-quiz', 'pokedex-entry-guess', 'guess-from-stats', 'pokeddle-race', 'type-chain', 'pokemon-trivia', 'tcg-higher-lower', 'pokemon-connections', 'who-is-who-pokemon', 'pokemon-bingo', 'sketchmon', 'absurd-pokedex', 'unown-translator', 'who-am-i', 'pokemon-team-auction', 'pokemon-bluff-auction']);

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
