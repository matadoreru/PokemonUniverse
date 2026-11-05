import { expect, test } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, loginAsGuest, nuevaCuenta, registrarPorApi, SIZES, uniqueName } from '../src/helpers.js';

for (const { w, h } of SIZES) {
  test(`acceso a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/auth');
    await expect(page.getByRole('tab', { name: 'Entrar' })).toHaveAttribute('aria-selected', 'true');
    await capture(page, 'acceso-entrar');

    // Foco inicial en el primer campo.
    await expect(page.getByLabel('Email o usuario')).toBeFocused();

    // Login inválido: el aviso, en español, recibe el foco.
    await page.getByLabel('Email o usuario').fill('nadie@example.com');
    await page.getByLabel('Contraseña').fill('x');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    const alerta = page.getByRole('alert');
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText('El usuario, el email o la contraseña no son correctos.');
    await expect(alerta).not.toContainText('Invalid');
    await expect(page.locator('[tabindex="-1"]:focus')).toContainText('No se pudo iniciar sesión');
    await capture(page, 'acceso-error');

    // Registro: solo se muestra el formulario, no se envía.
    await page.getByRole('tab', { name: 'Registro' }).click();
    await expect(page.getByLabel('Nombre de usuario')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await capture(page, 'acceso-registro');

    await page.getByRole('tab', { name: 'Invitado' }).click();
    await expect(page.getByLabel('Tu nombre temporal')).toBeVisible();

    // El invitado solo pone un nombre: no elige ni sube avatar (usa la inicial de su nombre).
    await expect(page.getByRole('button', { name: /mi imagen/ })).toHaveCount(0);
    // Ventajas de crear una cuenta, con el atajo a la pestaña Registro.
    const ventajas = page.getByRole('region', { name: 'Con una cuenta gratis, además:' });
    await expect(ventajas.getByRole('listitem')).toHaveCount(6);
    await expect(ventajas).toContainText('Tu propia imagen como avatar');
    await capture(page, 'acceso-invitado');
    await ventajas.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('tab', { name: 'Registro' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Nombre de usuario')).toBeVisible();

    // «Entrar como invitado» de la portada abre la pestaña Invitado.
    await page.goto('/auth?mode=guest');
    await expect(page.getByRole('tab', { name: 'Invitado' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Tu nombre temporal')).toBeFocused();

    await loginAsGuest(page, uniqueName('E2E'));
    await expect(page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();
    // Con la sala conectada: el aviso «Conectando» de la cabecera no entra en la captura.
    await expect(page.getByRole('button', { name: '¡Crear sala!' })).toBeEnabled();
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

// Entrar escribiendo el nombre de usuario (en otras mayúsculas) en vez del email. Necesita PostgreSQL para borrar la
// cuenta al acabar.
test('entrar con el nombre de usuario', async ({ browser }) => {
  comprobarBdE2E();
  const cuenta = nuevaCuenta('e2e_login');
  const registro = await browser.newContext();
  try {
    await registrarPorApi(await registro.newPage(), cuenta);
    const page = await browser.newPage();
    const errors = collectErrors(page);
    await page.goto('/auth');
    await page.getByLabel('Email o usuario').fill(cuenta.username.toUpperCase());
    await page.getByLabel('Contraseña').fill(cuenta.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('link', { name: `Abrir perfil de ${cuenta.username}` }).first()).toBeAttached();
    expect(errors).toEqual([]);
    await page.close();
  } finally {
    await registro.close();
    borrarCuentas([cuenta.email], () => undefined);
  }
});
