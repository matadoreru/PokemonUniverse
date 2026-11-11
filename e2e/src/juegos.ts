/**
 * Helpers de los E2E de minijuegos (`tests/juegos.spec.ts` y `tests/juegos/<id>.spec.ts`) que usan varios specs: capturas
 * a los tres tamaños con sus reglas de encaje, buscadores, tramas del `/ws` y ajustes de los modos de juego.
 */
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { layoutProblems, SIZES } from './helpers.js';

export const ASSET_URL = /^\/api\/rooms\/[^/]+\/games\/[^/]+\/rounds\/[^/]+\/options\/[^/]+\/(sprite|audio)$/;

/**
 * Literales con los que el servidor declara un juego no disponible
 * con los datos de la BD local. Solo se salta el test si el lobby muestra exactamente esto.
 */
export const UNAVAILABLE: Record<string, RegExp> = {
  'tcg-higher-lower': /No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros\./,
  'pokemon-palette-guess': /No hay suficientes paletas en PostgreSQL para las generaciones y tamaño seleccionados\.|No hay paletas persistidas para esta configuración\./,
};

/** WebSocket de la sala (`frontend/src/lib/socket.ts`): siempre el `/ws` de Java, nunca Socket.IO. */
export const JAVA_WS = /^wss?:\/\/[^/]+\/ws$/;
export const SOCKET_IO = /\/socket\.io\//;

/**
 * Capturas de revisión de una pantalla a los tres tamaños, con `measureLayout` vacío en todos. Si se pasa `sigue`,
 * después de cada captura se comprueba que sigue visible: una fase que avanza sola no debe fotografiar la siguiente.
 * Con `completa`, el PNG es de página completa (para paneles más altos que la vista; el medidor ya mide toda la página).
 */
export async function capturarTamanos(page: Page, nombre: string, { sigue, completa = false }: { sigue?: Locator; completa?: boolean } = {}): Promise<void> {
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
export async function primeraVisible(pages: readonly Page[], localizar: (page: Page) => Locator, timeout = 20_000): Promise<Page> {
  let encontrada: Page | undefined;
  await expect.poll(async () => {
    for (const page of pages) if (await localizar(page).isVisible()) { encontrada = page; return true; }
    return false;
  }, { timeout }).toBe(true);
  return encontrada!;
}

/** Respuesta del catálogo del buscador (`GET /api/pokemon/selector`): solo id, nombre y sprite opaco. */
export const SELECTOR_PATH = '/api/pokemon/selector';

export const esSelector = (r: Response) => new URL(r.url()).pathname === SELECTOR_PATH && r.status() === 200;

/** Elige un Pokémon con el buscador de Pokédex Distance (o de cualquier juego con el buscador por defecto). */
export async function elegirPokemon(page: Page, nombre: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Buscar Pokémon' }).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/** Capturas de una fase que dura poco: lo que mida `measureLayout` se anota en vez de hacer fallar el test. */
export async function capturarAnotando(page: Page, nombre: string, sigue: Locator, sizes: readonly { w: number; h: number }[] = SIZES): Promise<void> {
  for (const { w, h } of sizes) {
    await page.setViewportSize({ width: w, height: h });
    const { id, problems } = await layoutProblems(page, nombre, true);
    await expect(sigue, `${id}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 });
    if (problems.length) test.info().annotations.push({ type: 'encaje', description: `${id}: ${problems.join(' · ')}` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/**
 * Buscador de respuesta de los juegos de adivinar: su etiqueta lleva la ronda, la paleta o el grito («Buscar respuesta
 * para la ronda 3», «… para la paleta 1», «… para el grito 2»). `elegirPokemon` usa el de «Buscar Pokémon».
 */
export const BUSCADOR_RESPUESTA = /^Buscar respuesta para (la|el) (ronda|paleta|grito|dibujo) \d+$/;

export const buscadorRespuesta = (page: Page) => page.getByRole('textbox', { name: BUSCADOR_RESPUESTA });

/** Elige un Pokémon con el buscador de respuesta de un juego de adivinar. */
export async function adivinar(page: Page, nombre: string): Promise<void> {
  await buscadorRespuesta(page).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/**
 * Prueba los candidatos por orden hasta que la placa diga `titulo` («¡Acertado!»); cada fallo espera su enfriamiento
 * (1 s). Devuelve el que acertó, o '' si ninguno (el `expect` de quien llama lo dice).
 */
export async function acertarEnOrden(page: Page, candidatos: readonly string[], titulo: string): Promise<string> {
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
 * Busca en una trama del `/ws` el estado público del juego dado: el primer objeto con ese `gameId`, `phase` y
 * `roundNumber` (así no se confunde con otro objeto que solo nombre el juego, como el juego elegido de la sala).
 */
export function juegoEnTrama<T>(payload: string | Buffer, gameId: string): T | null {
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

/** Espera a que se desmonte el «+N» (`ScorePop`, 400 ms) del ganador: mientras sube, pisa la línea de métricas. */
export async function sinScorePop(page: Page): Promise<void> {
  await expect(page.getByTestId('score-pop')).toHaveCount(0, { timeout: 3_000 });
}

/** Texto, `alt` y `title` de `main`: lo que vería quien busca la respuesta en el DOM. */
export async function textoDeMain(page: Page): Promise<string> {
  return page.locator('main').evaluate((main) => [(main as HTMLElement).innerText, ...[...main.querySelectorAll('[alt], [title]')].map((el) => `${el.getAttribute('alt') ?? ''} ${el.getAttribute('title') ?? ''}`)].join('\n'));
}

/**
 * Retiene en la página las tramas que manda el servidor por el `/ws` después de la primera que cumpla `cuando` (esa sí
 * llega) hasta `soltar()`: así una fase que dura poco (la revelación de elecciones, ~650 ms por jugador; el resultado de la
 * ronda, 6 s) se queda en pantalla para las capturas. Lo que manda la página siempre llega al servidor. Instálalo antes de
 * que la página abra el `/ws` (y recárgala): `page.routeWebSocket` solo intercepta conexiones nuevas.
 */
export async function tramasRetenibles(page: Page): Promise<{ retenerDesde(cuando: (payload: string) => boolean): void; retenida(): boolean; soltar(): void }> {
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

/** Un nombre como palabra suelta (sin letras pegadas), para buscar el secreto de Taboo en el DOM. */
export const comoPalabra = (nombre: string) => new RegExp(`(^|[^\\p{L}])${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u');

// ---------------------------------------------------------------------------------------------------------------------
// Modos de juego (Fase 3): los specs de cada juego tienen un recorrido por modo, filtrable con `-g "<nombre del modo>"`.
// Cada uno marca solo ese modo en los ajustes del juego, comprueba el chip de la carta del lobby, juega con ajustes mínimos
// hasta los resultados y captura la pantalla de juego y la de resultados a los tres tamaños.
// ---------------------------------------------------------------------------------------------------------------------

/** Deja marcado solo `modo` en «Modos que se juegan» de los ajustes del juego (lo marca y desmarca Clásico). */
export async function elegirModo(host: Page, modo: string): Promise<void> {
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
export async function ajustarRango(page: Page, nombre: string, tecla: 'Home' | 'End', valor: string): Promise<void> {
  const rango = page.getByRole('slider', { name: nombre });
  await rango.focus();
  await rango.press(tecla);
  await rango.blur();
  await expect(rango).toHaveValue(valor);
}

/** La carta del juego en el lobby lleva el chip con el nombre del modo. */
export async function comprobarChipDeCarta(page: Page, juego: string, modo: string): Promise<Locator> {
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
  const carta = page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').filter({ has: page.getByText(juego, { exact: true }) });
  await expect(carta.getByText(modo, { exact: true })).toBeVisible();
  // La carta con el chip a la vista (la lista del lobby se desplaza por dentro) para que la captura la enseñe.
  await carta.scrollIntoViewIfNeeded();
  return carta;
}

/** Capturas a los tres tamaños con `objetivo` a la vista en cada uno (el cambio de tamaño devuelve el desplazamiento al principio). */
export async function capturarMostrando(page: Page, nombre: string, objetivo: Locator, { sigue }: { sigue?: Locator } = {}): Promise<void> {
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
export async function comprobarTituloDeCabecera(page: Page, titulo: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('header, [data-layer="screen-top"]').getByText(titulo, { exact: true }).first()).toBeVisible();
}

/** Las cartas de una misma fila del lobby miden lo mismo: el chip del modo no estira solo la carta del juego con modo. */
export async function comprobarAlturaDeCartas(page: Page): Promise<void> {
  const cajas = await page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').evaluateAll((items) => items.map((item) => { const r = item.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; }));
  const porFila = new Map<number, Set<number>>();
  for (const { top, height } of cajas) porFila.set(top, (porFila.get(top) ?? new Set<number>()).add(height));
  for (const [top, alturas] of porFila) expect(alturas.size, `cartas de la fila en y=${top} con alturas distintas: ${[...alturas].join(', ')}`).toBe(1);
}
