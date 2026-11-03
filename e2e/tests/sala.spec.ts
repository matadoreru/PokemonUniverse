import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { capture, collectErrors, createRoom, joinRoom, loginAsGuest, saltarIntro, SIZES, uniqueName } from '../src/helpers.js';

interface Jugador {
  context: BrowserContext;
  page: Page;
  errors: string[];
  name: string;
}

/** Abre un contexto aislado (cookies propias) y entra como invitado. */
async function nuevoJugador(browser: Browser, prefijo: string, w = 1280, h = 720): Promise<Jugador> {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const name = uniqueName(prefijo);
  try {
    await loginAsGuest(page, name);
  } catch (error) {
    await context.close();
    throw error;
  }
  return { context, page, errors, name };
}

/** Fixture `crearJugador`: cierra todos los contextos abiertos al acabar, aunque el test falle. */
const test = base.extend<{ crearJugador: (prefijo: string, w?: number, h?: number) => Promise<Jugador> }>({
  crearJugador: async ({ browser }, use) => {
    const abiertos: Jugador[] = [];
    await use(async (prefijo, w, h) => {
      const jugador = await nuevoJugador(browser, prefijo, w, h);
      abiertos.push(jugador);
      return jugador;
    });
    await Promise.all(abiertos.map((j) => j.context.close()));
  },
});

/** En la página del host, el invitado aparece en la lista y el contador marca 2 / 8. */
async function esperarInvitado(host: Page, nombre: string): Promise<void> {
  await expect(host.getByText(nombre, { exact: true }).first()).toBeVisible();
  await expect(host.locator('.chip').filter({ hasText: /2\s*\/\s*8/ })).toBeVisible();
}

test('dos jugadores crean una sala, se unen y empiezan la partida', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible();
  // Solo, el host no puede empezar (faltan jugadores para el minijuego por defecto).
  await expect(host.page.locator('#start-help')).not.toHaveText('La sala está lista.');
  await expect(host.page.getByRole('button', { name: 'Empezar partida' })).toBeDisabled();
  await capture(host.page, 'lobby-host-solo');

  const guest = await crearJugador('Inv');
  await joinRoom(guest.page, code);
  await expect(guest.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible();
  await esperarInvitado(host.page, guest.name);
  await capture(guest.page, 'lobby-invitado');

  await guest.page.getByRole('button', { name: 'Marcarme listo' }).click();
  await expect(guest.page.getByRole('button', { name: 'Estoy listo' })).toHaveAttribute('aria-pressed', 'true');

  await expect(host.page.locator('#start-help')).toHaveText('La sala está lista.');
  await capture(host.page, 'lobby-host-lista');
  await host.page.getByRole('button', { name: 'Empezar partida' }).click();
  // Pokédex Distance (el juego por defecto) empieza con su intro: los dos la saltan.
  await saltarIntro([host.page, guest.page]);
  await expect(host.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 });
  await capture(host.page, 'juego-pokedex-distance');

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`un código inexistente muestra el error en el campo a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await loginAsGuest(page, uniqueName('E2E'));
    // Se pega en minúsculas y con guion: el campo lo normaliza.
    await page.locator('#room-code').fill('zzz-zzz');
    await expect(page.locator('#room-code')).toHaveValue('ZZZZZZ');
    await page.getByRole('button', { name: 'Unirse a la sala' }).click();
    // El servidor responde en inglés ('Room not found'); la pantalla lo da en español en el campo, que recibe el foco,
    // y el aviso global de la sala no repite el texto en inglés.
    const alerta = page.getByRole('alert').filter({ hasText: 'No hay ninguna sala con ese código.' });
    await expect(alerta).toBeVisible();
    await expect(page.locator('#room-code')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#room-code')).toBeFocused();
    await expect(page.getByText(/room not found/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/play$/);
    await capture(page, 'entrar-en-partida-error', { minFontPx: 13, noPageScroll: true });

    // Un código incompleto no viaja al servidor: el campo dice cuánto falta.
    await page.locator('#room-code').fill('AB');
    await page.getByRole('button', { name: 'Unirse a la sala' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Faltan 4 caracteres del código.' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('con una sala activa, Jugar ofrece volver o salir sin solaparse con la fila de la sala', async ({ page }) => {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  await createRoom(page);
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Ya tienes una sala activa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a la sala' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Salir de la sala' })).toBeEnabled();
  await capture(page, 'entrar-en-partida-sala-activa', { minFontPx: 13, noPageScroll: true });
  await page.getByRole('button', { name: 'Salir de la sala' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`lobby a ${w}×${h}`, async ({ crearJugador }) => {
    const host = await crearJugador('Host', w, h);
    const code = await createRoom(host.page);
    const guest = await crearJugador('Inv', w, h);
    await joinRoom(guest.page, code);
    await esperarInvitado(host.page, guest.name);
    await capture(host.page, 'lobby');

    expect(host.errors).toEqual([]);
    expect(guest.errors).toEqual([]);
  });
}

/**
 * Fija el aviso de conexión sin depender de lo que tarde el backend en frío. Con `perdida = false` el `/ws` de la sala
 * se queda en CONNECTING para siempre («Conectando con la sala»); con `perdida = true` el primero abre y se cae al
 * momento y los siguientes intentos se quedan en CONNECTING («Conexión perdida»). El resto de WebSockets (HMR de
 * Vite) usan el nativo.
 */
async function salaSinConexion(page: Page, perdida: boolean): Promise<void> {
  await page.addInitScript((perderLaPrimera) => {
    const Native = window.WebSocket;
    let intentos = 0;
    class Pending extends EventTarget {
      readyState: number = Native.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror = null;
      constructor(readonly url: string, abreYCae: boolean) {
        super();
        if (!abreYCae) return;
        setTimeout(() => { this.readyState = Native.OPEN; this.onopen?.(new Event('open')); }, 50);
        setTimeout(() => { this.readyState = Native.CLOSED; this.onclose?.(new CloseEvent('close', { code: 1006 })); }, 150);
      }
      send(): void {}
      close(): void {}
    }
    class Pendiente extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        if (new URL(String(url), location.href).pathname === '/ws') return new Pending(String(url), perderLaPrimera && intentos++ === 0) as unknown as Pendiente;
        super(url, protocols);
      }
    }
    window.WebSocket = Pendiente;
  }, perdida);
}

async function avisoDeConexion(page: Page, perdida = false): Promise<void> {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  await salaSinConexion(page, perdida);
  await page.goto('/play');
  const aviso = page.getByRole('status').filter({ hasText: perdida ? 'Conexión perdida' : 'Conectando con la sala' });
  await expect(aviso).toBeVisible();
  // El aviso nunca tapa la fila de marca y navegación de la cabecera: empieza donde ella acaba o más abajo.
  const marca = await page.locator('header > div').first().boundingBox();
  const caja = await aviso.locator('.connection-notice').boundingBox();
  expect(marca && caja && caja.y >= marca.y + marca.height - 1, 'el aviso queda bajo la fila de marca').toBe(true);
  await capture(page, `sala-${perdida ? 'conexion-perdida' : 'conectando'}`);
  expect(errors).toEqual([]);
}

for (const { w, h } of SIZES) {
  test(`aviso de conexión de la sala a ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await avisoDeConexion(page);
  });

  test(`aviso de conexión perdida a ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await avisoDeConexion(page, true);
  });
}

test('una entrada normal en la sala no muestra el aviso de conexión', async ({ page }) => {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  // Primera conexión de calentamiento: el `/ws` en frío puede tardar más que el retardo del aviso.
  await expect(page.getByRole('button', { name: '¡Crear sala!' })).toBeEnabled();
  // Desde aquí se anota si el aviso llega a pintarse en algún momento, aunque sea un instante.
  await page.addInitScript(() => {
    const w = window as unknown as { avisoVisto: boolean };
    w.avisoVisto = false;
    new MutationObserver(() => { if (document.querySelector('.connection-notice')) w.avisoVisto = true; })
      .observe(document, { childList: true, subtree: true });
  });
  await page.goto('/play');
  await createRoom(page);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { avisoVisto: boolean }).avisoVisto), 'el aviso de conexión no debe aparecer').toBe(false);
  expect(errors).toEqual([]);
});
