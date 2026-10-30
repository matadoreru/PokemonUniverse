import { expect, test } from '@playwright/test';

test('la portada carga sin errores y lleva al acceso', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  const empezar = page.getByRole('link', { name: 'Empezar a jugar' });
  await expect(empezar).toBeVisible();

  await empezar.click();
  await expect(page).toHaveURL(/\/auth$/);

  expect(errors).toEqual([]);
});
