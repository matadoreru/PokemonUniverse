import { expect, test } from '@playwright/test';
import { capture, collectErrors, layoutProblems, loginAsGuest, SIZES, uniqueName } from '../src/helpers.js';

for (const { w, h } of SIZES) {
  test(`portada a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/');
    const empezar = page.getByRole('link', { name: 'Empezar a jugar' });
    await expect(empezar).toBeVisible();
    await capture(page, 'portada');

    await empezar.click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible();

    expect(errors).toEqual([]);
  });
}

// Tema único: una preferencia de tema claro de la versión anterior se ignora.
test('ignora un tema claro guardado', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('pokemon-universe-theme', 'light'));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Empezar a jugar' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  // Fondo del body: --band (#060B22).
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(6, 11, 34)');
  expect(errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`cabecera con el botón de sonido a ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    // Con sesión la cabecera lleva también el perfil y «Cerrar sesión»: es la fila más llena.
    await loginAsGuest(page, uniqueName('Sonido'));
    await expect(page.getByRole('button', { name: 'Ajustes de sonido' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    const { id, problems } = await layoutProblems(page, 'cabecera-sonido', true);
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  });
}
