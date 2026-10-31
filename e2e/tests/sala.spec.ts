import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { capture, collectErrors, createRoom, joinRoom, loginAsGuest, SIZES, uniqueName } from '../src/helpers.js';

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
  await expect(host.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 });
  await capture(host.page, 'juego-pokedex-distance');

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

test('un código inexistente muestra error', async ({ page }) => {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  await page.locator('#room-code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Unirse a la sala' }).click();
  // Puede haber más de un alert (error de PlayPage y banner de conexión): se busca el del error.
  // El servidor responde en inglés: manager.ts lanza 'Room not found' y PlayPage lo muestra tal cual.
  const alerta = page.getByRole('alert').filter({ hasText: /room not found/i }).first();
  await expect(alerta).toBeVisible();
  await expect(page).toHaveURL(/\/play$/);
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
