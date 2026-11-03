/**
 * Galería del catálogo Arcade DS (`/dev/ui`, solo en desarrollo): cada componente en todos sus estados. Captura cada
 * figura en `e2e/screenshots/galeria/<id>.png` y la página a los tres tamaños (`galeria-<w>x<h>.png`), mide encaje y
 * legibilidad con el mínimo de 13 px del sistema y comprueba el diálogo nativo con un aviso encima.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { capture, collectErrors, SIZES } from '../src/helpers.js';

const DIR = 'screenshots/galeria';

/** Abre la galería en modo estático (sin animaciones) y espera a las fuentes. */
async function abrirGaleria(page: Page): Promise<void> {
  await page.goto('/dev/ui?static');
  await expect(page.getByTestId('gallery')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/\bstatic\b/);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('la galería muestra el catálogo y se captura figura a figura', async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  const errors = collectErrors(page);
  await abrirGaleria(page);

  const secciones = await page.locator('[data-gallery-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gallery-section')));
  expect(secciones.length).toBeGreaterThanOrEqual(15);
  expect(new Set(secciones).size, 'secciones repetidas').toBe(secciones.length);

  const figuras = page.locator('figure[data-gallery]');
  const ids = await figuras.evaluateAll((els) => els.map((e) => e.getAttribute('data-gallery') ?? ''));
  expect(ids.length).toBeGreaterThanOrEqual(60);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(repetidos, 'ids de figura repetidos').toEqual([]);
  // Cada figura lleva su pie.
  expect(await page.locator('figure[data-gallery]:not(:has(> figcaption))').count()).toBe(0);

  for (const id of ids) {
    const figura = page.locator(`figure[data-gallery="${id}"]`);
    await figura.scrollIntoViewIfNeeded();
    await figura.screenshot({ path: `${DIR}/${id}.png`, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`galería a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await abrirGaleria(page);
    // Sin scroll horizontal y `measureLayout(page, 13)` vacío (la página sí se desplaza en vertical).
    await capture(page, 'galeria', { minFontPx: 13 });
    expect(errors).toEqual([]);
  });
}

test('el aviso queda encima del diálogo abierto y Esc devuelve el foco', async ({ page }) => {
  const errors = collectErrors(page);
  await abrirGaleria(page);

  const abrir = page.getByRole('button', { name: 'Abrir diálogo' });
  await abrir.scrollIntoViewIfNeeded();
  await abrir.click();
  const dialogo = page.getByRole('dialog', { name: 'Diálogo de ejemplo' });
  await expect(dialogo).toBeVisible();

  await dialogo.getByRole('button', { name: 'Lanzar aviso' }).click();
  const aviso = page.locator('[popover]').getByText('Aviso sobre el diálogo');
  await expect(aviso).toBeVisible();
  // El punto central del aviso cae dentro del aviso: el popover está por encima del `<dialog>` en la capa superior.
  const encima = await aviso.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const toast = el.closest('[popover] > *');
    return hit !== null && toast !== null && toast.contains(hit);
  });
  expect(encima).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(abrir).toBeFocused();
  expect(errors).toEqual([]);
});
