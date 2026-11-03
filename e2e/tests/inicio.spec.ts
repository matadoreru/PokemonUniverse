import { expect, test } from '@playwright/test';
import { capture, collectErrors, layoutProblems, loginAsGuest, SIZES, uniqueName } from '../src/helpers.js';

for (const { w, h } of SIZES) {
  test(`portada a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/');
    // El `colorScheme: 'dark'` de la configuración deja la app en su tema por defecto.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const empezar = page.getByRole('link', { name: 'Empezar a jugar' });
    await expect(empezar).toBeVisible();
    await capture(page, 'portada');

    await empezar.click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible();

    expect(errors).toEqual([]);
  });
}

test('botón de sonido apagado por defecto que se recuerda al recargar', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const activar = page.getByRole('button', { name: 'Activar sonido' });
  await expect(activar).toHaveAttribute('aria-pressed', 'false');

  await activar.click();
  const silenciar = page.getByRole('button', { name: 'Silenciar sonido' });
  await expect(silenciar).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Silenciar sonido' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`cabecera con el botón de sonido a ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    // Con sesión la cabecera lleva también el perfil y «Cerrar sesión»: es la fila más llena.
    await loginAsGuest(page, uniqueName('Sonido'));
    await expect(page.getByRole('button', { name: 'Activar sonido' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    const { id, problems } = await layoutProblems(page, 'cabecera-sonido', true);
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  });
}
