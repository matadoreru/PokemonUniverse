/**
 * Ajustes (E8): el movimiento en `<html data-motion>` (Sistema sigue al sistema, que la suite emula en reducido) y el
 * texto «Muy grande» (125 % de la letra raíz) sin scroll horizontal a 1280×720 ni a 390×844 en la sala, un juego de
 * cada kit (adivinar, social, subasta y Bingo, con cabecera propia) y los resultados.
 */
import { expect, test, type Page } from '@playwright/test';
import { capture, collectErrors, conMovimiento, crearSalaConJugadores, esperarPartida, iniciarPartida, seleccionarJuego, type Jugador, type SalaConJugadores } from '../src/helpers.js';

/** Los dos tamaños del criterio de aceptación de E8. */
const TAMANOS = [{ w: 1280, h: 720 }, { w: 390, h: 844 }] as const;

const html = (page: Page) => page.locator('html');

async function abrirAjustes(page: Page) {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

/** Pone el texto en «Muy grande» desde el diálogo y comprueba la letra raíz (125 % de 16 px). */
async function textoMuyGrande(page: Page): Promise<void> {
  const dialogo = await abrirAjustes(page);
  await dialogo.getByRole('radio', { name: 'Muy grande' }).click();
  await expect(html(page)).toHaveAttribute('data-text', 'xlarge');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px');
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialogo).toBeHidden();
}

/** Captura a los dos tamaños del criterio, sin scroll horizontal y con `measureLayout` vacío. */
async function capturarGrande(page: Page, nombre: string): Promise<void> {
  for (const { w, h } of TAMANOS) {
    await page.setViewportSize({ width: w, height: h });
    // Con «Grande» y «Muy grande» E8 permite el scroll vertical (de `main` y de la página): la letra crece y lo que no
    // cabe a lo alto se desplaza. El horizontal sigue prohibido.
    await capture(page, nombre, { allowPageScroll: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** Sala de `n` jugadores con el host en «Muy grande» y `juego` elegido. */
async function salaGrande(browser: Parameters<typeof crearSalaConJugadores>[0], n: number, juego: string): Promise<SalaConJugadores> {
  const sala = await crearSalaConJugadores(browser, n);
  await textoMuyGrande(sala.host.page);
  await seleccionarJuego(sala.host.page, juego);
  return sala;
}

async function empezar(sala: SalaConJugadores): Promise<void> {
  await iniciarPartida(sala.host.page, sala.invitados.map((j) => j.page));
  await esperarPartida(sala.jugadores.map((j) => j.page));
}

test('ajustes: Sistema sigue al sistema; Reducido, Completo y el texto se recuerdan al recargar', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Empezar a jugar' })).toBeVisible();
  // La suite emula `prefers-reduced-motion: reduce`: con «Sistema» (por defecto) el movimiento va reducido.
  await expect(html(page)).toHaveAttribute('data-motion', 'reduce');
  await conMovimiento(page);
  await expect(html(page)).not.toHaveAttribute('data-motion');

  let dialogo = await abrirAjustes(page);
  await expect(dialogo.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
  await dialogo.getByRole('radio', { name: 'Reducido' }).click();
  await expect(html(page)).toHaveAttribute('data-motion', 'reduce');
  await dialogo.getByRole('radio', { name: 'Grande', exact: true }).click();
  await expect(html(page)).toHaveAttribute('data-text', 'large');
  await page.keyboard.press('Escape');
  // Tras recargar, los dos ya están en <html> antes de pintar (los aplica el primer módulo de la app).
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-motion', 'reduce');
  await expect(html(page)).toHaveAttribute('data-text', 'large');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('18px');

  dialogo = await abrirAjustes(page);
  await dialogo.getByRole('radio', { name: 'Completo' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(html(page)).not.toHaveAttribute('data-motion');
  // Una sola clave de ajustes, con el sonido incluido.
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('pokemon-universe-preferences') ?? 'null') as unknown);
  expect(guardado).toMatchObject({ motion: 'full', text: 'large', audio: { muted: true } });
  expect(errors).toEqual([]);
});

test('texto muy grande: sala, Would You Rather y sus resultados', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await salaGrande(browser, 3, 'Would You Rather Pokémon');
  try {
    const { host, invitados, jugadores } = sala;
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await capturarGrande(host.page, 'texto-grande-sala');
    await empezar(sala);

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    await expect(titulo(host.page)).toHaveText('¿Qué preferirías?', { timeout: 20_000 });
    await capturarGrande(host.page, 'texto-grande-social');
    for (const { page } of [host, ...(invitados as Jugador[])]) {
      await page.getByTestId('choice-options').locator('[data-choice-option="A"]').getByRole('button').click();
      await page.getByRole('button', { name: 'Mayoría A', exact: true }).click();
      await page.getByTestId('wyr-confirm').click();
    }
    await expect(host.page.getByRole('heading', { name: 'Quien mejor leyó la sala' })).toBeVisible({ timeout: 30_000 });
    await capturarGrande(host.page, 'texto-grande-resultados');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

for (const { juego, n, nombre, listo } of [
  { juego: '¿Quién es ese Pokémon?', n: 2, nombre: 'texto-grande-adivinar', listo: (page: Page) => page.getByRole('img', { name: 'Silueta de un Pokémon misterioso' }) },
  { juego: 'Pokémon Team Auction', n: 2, nombre: 'texto-grande-subasta', listo: (page: Page) => page.getByTestId('auction-screen') },
  { juego: 'Pokémon Bingo', n: 2, nombre: 'texto-grande-bingo', listo: (page: Page) => page.getByRole('group', { name: /^Tu tablero/ }) },
]) {
  test(`texto muy grande: ${juego}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const sala = await salaGrande(browser, n, juego);
    try {
      await empezar(sala);
      await expect(listo(sala.host.page)).toBeVisible({ timeout: 20_000 });
      await capturarGrande(sala.host.page, nombre);
      for (const jugador of sala.jugadores) expect(jugador.errors, jugador.name).toEqual([]);
    } finally {
      await sala.cerrar();
    }
  });
}
