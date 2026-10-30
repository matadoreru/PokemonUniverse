import { expect, test } from '@playwright/test';
import { capture, collectErrors, loginAsGuest, pinTheme, SIZES, uniqueName } from '../src/helpers.js';

for (const { w, h } of SIZES) {
  test(`acceso a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/auth');
    await expect(page.getByRole('tab', { name: 'Entrar' })).toHaveAttribute('aria-selected', 'true');
    await capture(page, 'acceso-entrar');

    // Login inválido: el alert debe mostrar un mensaje.
    await page.getByLabel('Email').fill('nadie@example.com');
    await page.getByLabel('Contraseña').fill('x');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    const alerta = page.getByRole('alert');
    await expect(alerta).toBeVisible();
    await expect(alerta).not.toHaveText('');
    await capture(page, 'acceso-error');

    // Registro: solo se muestra el formulario, no se envía.
    await page.getByRole('tab', { name: 'Registro' }).click();
    await expect(page.getByLabel('Nombre de usuario')).toBeVisible();
    await capture(page, 'acceso-registro');

    await page.getByRole('tab', { name: 'Invitado' }).click();
    await expect(page.getByLabel('Tu nombre temporal')).toBeVisible();
    await capture(page, 'acceso-invitado');

    await loginAsGuest(page, uniqueName('E2E'));
    await expect(page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();
    await capture(page, 'entrar-en-partida');

    // El login inválido provoca (a propósito) un 401 de `/api/auth/login`, que Chromium registra
    // como error de consola sin URL. Se descuenta exactamente una vez ese mensaje; el resto debe
    // estar vacío.
    const mensaje401 = 'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
    const i = errors.indexOf(mensaje401);
    if (i >= 0) errors.splice(i, 1);
    expect(errors).toEqual([]);
  });
}

test('acceso en tema claro a 1280×720', async ({ page, context }) => {
  const errors = collectErrors(page);
  await pinTheme(context, 'light');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/auth');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await capture(page, 'acceso-entrar-claro');
  expect(errors).toEqual([]);
});
