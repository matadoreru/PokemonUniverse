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
    // Captura de página completa, sin scroll horizontal y `measureLayout(page, 13)` vacío (la página sí se desplaza en vertical).
    await capture(page, 'galeria', { minFontPx: 13, fullPage: true });
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
  // Con el `<dialog>` modal abierto el resto del documento es inerte y `elementFromPoint` atraviesa el aviso: se compara
  // por píxeles. Si el aviso quedara bajo el fondo del diálogo, el recorte con el diálogo abierto saldría oscurecido.
  const caja = await aviso.locator('xpath=ancestor::*[parent::*[@popover]][1]').boundingBox();
  expect(caja).not.toBeNull();
  // Rectángulo interior: fuera quedan las esquinas redondeadas de la píldora, transparentes, por donde se ve el fondo del
  // diálogo con él abierto.
  const { x, y, width, height } = caja!;
  const left = Math.ceil(x + height / 2 + 2);
  const right = Math.floor(x + width - height / 2 - 2);
  const top = Math.ceil(y + 4);
  const bottom = Math.floor(y + height - 4);
  expect(right - left).toBeGreaterThan(0);
  expect(bottom - top).toBeGreaterThan(0);
  const clip = { x: left, y: top, width: right - left, height: bottom - top };
  const conDialogo = await page.screenshot({ clip, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(abrir).toBeFocused();
  // El aviso dura 20 s: sigue a la vista tras cerrar el diálogo.
  await expect(aviso).toBeVisible();
  const sinDialogo = await page.screenshot({ clip, animations: 'disabled' });
  expect(Buffer.compare(conDialogo, sinDialogo), 'el aviso se ve igual con el diálogo abierto que sin él').toBe(0);
  expect(errors).toEqual([]);
});

test('con el diálogo abierto el aviso se monta dentro de él y se cierra con su botón', async ({ page }) => {
  const errors = collectErrors(page);
  await abrirGaleria(page);

  const abrir = page.getByRole('button', { name: 'Abrir diálogo' });
  await abrir.scrollIntoViewIfNeeded();
  await abrir.click();
  const dialogo = page.getByRole('dialog', { name: 'Diálogo de ejemplo' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Lanzar aviso' }).click();

  // Dentro del `<dialog>` modal el aviso no es inerte: está en el árbol de accesibilidad y se anuncia.
  const pila = dialogo.locator('[popover]');
  await expect(pila.getByText('Aviso sobre el diálogo')).toBeVisible();
  await expect(dialogo.getByRole('status').filter({ hasText: 'Aviso sobre el diálogo' })).toHaveCount(1);
  await capture(page, 'galeria-aviso-sobre-dialogo', { minFontPx: 13 });

  await pila.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(page.getByText('Aviso sobre el diálogo', { exact: true })).toHaveCount(0);
  // Cerrar el aviso no cierra el diálogo.
  await expect(dialogo).toBeVisible();
  expect(errors).toEqual([]);
});
