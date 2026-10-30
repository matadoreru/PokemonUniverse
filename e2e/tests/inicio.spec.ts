import { expect, test } from '@playwright/test';
import { capture, collectErrors, SIZES } from '../src/helpers.js';

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
