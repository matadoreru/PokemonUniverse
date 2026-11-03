/**
 * Un test por minijuego del registro (`backend/src/main/resources/games/registry.json`), igual con
 * Socket.IO (`npm run test:e2e -- juegos`) que con el `/ws` de Java (`npm run test:e2e:java -- juegos`):
 * sala nueva con `max(3, minPlayers)` invitados, selección del juego, listos, «Empezar partida» y
 * comprobación de que la partida sale del lobby y pinta su pantalla sin desbordes a 1280×720.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Response } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, seleccionarJuego, SIZES, type SalaConJugadores } from '../src/helpers.js';

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
 * Literales con los que el servidor (Node y Java dicen lo mismo) declara un juego no disponible
 * con los datos de la BD local. Solo se salta el test si el lobby muestra exactamente esto.
 */
const UNAVAILABLE: Record<string, RegExp> = {
  'tcg-higher-lower': /No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros\./,
  'pokemon-palette-guess': /No hay suficientes paletas en PostgreSQL para las generaciones y tamaño seleccionados\.|No hay paletas persistidas para esta configuración\./,
};

/** WebSocket de la sala según el transporte (`frontend/src/lib/socket.ts`). */
const JAVA_WS = /^wss?:\/\/[^/]+\/ws$/;
const SOCKET_IO = /^wss?:\/\/[^/]+\/socket\.io\/\?/;

/** Lo que el backend Java dice de un juego sin motor portado: nunca debe salir. */
const NOT_PORTED = 'Este minijuego todavía no está disponible en el servidor Java.';

/** Un juego de cada lote de la etapa 2B: se captura a los tres tamaños de revisión. */
const SCREENSHOT_GAMES = new Set(['type-duel', 'poke-taboo', 'most-likely-to', 'learnset-guess', 'whos-that-pokemon', 'who-is-who-pokemon', 'pokemon-bingo', 'sketchmon']);

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
      // La sala va por el transporte de esta pasada (`/ws` de Java o Socket.IO de Node) y no por el otro.
      const java = test.info().project.name.endsWith('-java');
      const [transporte, otro] = java ? [JAVA_WS, SOCKET_IO] : [SOCKET_IO, JAVA_WS];
      for (const jugador of jugadores) {
        expect(jugador.websockets, `${jugador.name}: WebSocket de la sala`).toContainEqual(expect.stringMatching(transporte));
        expect(jugador.websockets, `${jugador.name}: sin WebSocket del otro transporte`).not.toContainEqual(expect.stringMatching(otro));
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
