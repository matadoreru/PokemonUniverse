/**
 * Audio (F2): apagado por defecto, el `AudioContext` solo nace con un gesto con el sonido activado, ajustes en la
 * cabecera, atajo `M`, persistencia y ningún aviso de autoplay. Lee el estado con `window.__puAudio.state()` (solo dev).
 */
import { expect, test, type Page } from '@playwright/test';
import { capture, collectErrors, loginAsGuest, SIZES, uniqueName } from '../src/helpers.js';

interface Estado {
  unlocked: boolean;
  muted: boolean;
  recent: string[];
}

const estado = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __puAudio: { state(): Estado } }).__puAudio.state());

/** Avisos y errores de consola que mencionan el contexto de audio o el autoplay. */
function avisosDeAudio(page: Page): string[] {
  const avisos: string[] = [];
  page.on('console', (m) => {
    if (/AudioContext|autoplay/i.test(m.text())) avisos.push(`${m.type()}: ${m.text()}`);
  });
  return avisos;
}

async function abrirAjustes(page: Page) {
  await page.getByRole('button', { name: 'Ajustes de sonido' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Ajustes de sonido' });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

test('primera visita: apagado y un clic no desbloquea el audio', async ({ page }) => {
  const errors = collectErrors(page);
  const avisos = avisosDeAudio(page);
  await page.goto('/');
  const empezar = page.getByRole('link', { name: 'Empezar a jugar' });
  await expect(empezar).toBeVisible();
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(true);
  // El enlace no navega: solo importa el gesto.
  await page.getByRole('button', { name: 'Ajustes de sonido' }).click();
  await page.keyboard.press('Escape');
  const e = await estado(page);
  expect(e.muted).toBe(true);
  expect(e.unlocked).toBe(false);
  expect(e.recent).toEqual([]);
  expect(avisos).toEqual([]);
  expect(errors).toEqual([]);
});

test('activar el sonido en los ajustes desbloquea y registra los efectos', async ({ page }) => {
  const errors = collectErrors(page);
  const avisos = avisosDeAudio(page);
  await page.goto('/');
  const dialogo = await abrirAjustes(page);
  await expect(dialogo.getByRole('slider', { name: 'Música' })).toBeDisabled();

  await dialogo.getByRole('switch', { name: 'Sonido' }).click();
  await expect(dialogo.getByRole('switch', { name: 'Sonido' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(false);
  await expect.poll(() => estado(page).then((e) => e.unlocked)).toBe(true);

  // Mover un deslizador de volumen suena como `ui.tick`.
  await dialogo.getByRole('slider', { name: 'Música' }).fill('40');
  await expect.poll(() => estado(page).then((e) => e.recent)).toContain('ui.tick');

  // Un botón de la cabecera hecho con `Pill` suena como `ui.confirm` (o `ui.tap` si es ghost o cream).
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialogo).toBeHidden();
  await page.getByRole('button', { name: 'Ajustes de sonido' }).click();
  await expect.poll(() => estado(page).then((e) => e.recent.some((id) => id === 'ui.tap' || id === 'ui.confirm'))).toBe(true);
  expect((await estado(page)).recent).toEqual(expect.arrayContaining(['ui.open']));

  expect(avisos).toEqual([]);
  expect(errors).toEqual([]);
});

test('la tecla M silencia y activa fuera de un campo de texto', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Empezar a jugar' })).toBeVisible();
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(false);
  await page.keyboard.press('m');
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(true);
  expect(errors).toEqual([]);
});

test('los ajustes se recuerdan al recargar', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  let dialogo = await abrirAjustes(page);
  await dialogo.getByRole('switch', { name: 'Sonido' }).click();
  await dialogo.getByRole('slider', { name: 'Música' }).fill('35');
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(false);

  await page.reload();
  await expect.poll(() => estado(page).then((e) => e.muted)).toBe(false);
  dialogo = await abrirAjustes(page);
  await expect(dialogo.getByRole('switch', { name: 'Sonido' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialogo.getByRole('slider', { name: 'Música' })).toHaveValue('35');
  expect(errors).toEqual([]);
});

test('los ajustes de sonido con sesión no dejan avisos de autoplay', async ({ page }) => {
  const errors = collectErrors(page);
  const avisos = avisosDeAudio(page);
  await loginAsGuest(page, uniqueName('Audio'));
  const dialogo = await abrirAjustes(page);
  await dialogo.getByRole('switch', { name: 'Sonido' }).click();
  await dialogo.getByRole('slider', { name: 'Efectos' }).fill('60');
  await page.reload();
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  expect(avisos).toEqual([]);
  expect(errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`diálogo de ajustes de sonido a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    const dialogo = await abrirAjustes(page);
    await dialogo.getByRole('switch', { name: 'Sonido' }).click();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await capture(page, 'ajustes-sonido');
    expect(errors).toEqual([]);
  });
}
