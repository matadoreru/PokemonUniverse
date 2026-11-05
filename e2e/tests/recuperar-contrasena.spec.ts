import { expect, test } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, nuevaCuenta, registrarPorApi, SIZES, ultimoCorreoDe, type CuentaE2E } from '../src/helpers.js';

// Flujo completo de «¿Has olvidado la contraseña?»: pide el enlace, lo lee del correo en Mailpit, elige la contraseña
// nueva, entra con ella y comprueba que el enlace es de un solo uso. Necesita PostgreSQL y Mailpit (npm run db:up).
const cuentas: CuentaE2E[] = [];

test.beforeAll(async () => {
  comprobarBdE2E();
  try {
    const respuesta = await fetch('http://127.0.0.1:8025/api/v1/messages');
    if (!respuesta.ok) throw new Error(String(respuesta.status));
  } catch {
    throw new Error('Mailpit no responde en :8025: arráncalo con npm run db:up');
  }
});

test.afterAll(() => {
  borrarCuentas(cuentas.map((c) => c.email), () => undefined);
});

for (const { w, h } of SIZES) {
  test(`recuperar la contraseña a ${w}×${h}`, async ({ page, browser }) => {
    // Una cuenta por tamaño: el backend solo manda un correo de recuperación por cuenta cada 60 s.
    const cuenta = nuevaCuenta('e2e_rec');
    cuentas.push(cuenta);
    const registro = await browser.newContext();
    try {
      await registrarPorApi(await registro.newPage(), cuenta);
    } finally {
      await registro.close();
    }
    const nueva = 'otra-contrasena-e2e-9';

    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/auth');
    await page.getByRole('link', { name: '¿Has olvidado la contraseña?' }).click();
    await expect(page).toHaveURL(/\/auth\/recuperar$/);
    await expect(page.getByLabel('Email o usuario')).toBeFocused();
    await capture(page, 'recuperar');

    await page.getByLabel('Email o usuario').fill(cuenta.username);
    await page.getByRole('button', { name: /enlace/i }).click();
    await expect(page.getByText('Si existe una cuenta, te hemos enviado un enlace a su email. Caduca en 30 minutos.')).toBeVisible();
    // El botón desaparece al enviar: el foco pasa a la confirmación (WCAG 2.4.3).
    await expect(page.getByTestId('recuperar-enviado')).toBeFocused();
    await capture(page, 'recuperar-enviado');

    const correo = await ultimoCorreoDe(cuenta.email);
    const enlace = /\/auth\/nueva-contrasena\?token=[A-Za-z0-9_-]{43}/.exec(correo.text)?.[0];
    expect(enlace, `enlace en el correo «${correo.subject}»`).toBeTruthy();

    // El token sale de la barra de direcciones, pero el formulario sigue usándolo (viene de una ref).
    await page.goto(enlace!);
    await expect(page.getByRole('heading', { name: 'Elige tu contraseña nueva' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).search).not.toContain('token=');
    await capture(page, 'nueva-contrasena');

    await page.getByLabel('Contraseña nueva', { exact: true }).fill(nueva);
    await page.getByLabel('Repite la contraseña').fill(`${nueva}x`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByLabel('Repite la contraseña')).toHaveAccessibleDescription(/Las contraseñas no coinciden\./);
    await expect(page.getByLabel('Repite la contraseña')).toBeFocused();

    await page.getByLabel('Repite la contraseña').fill(nueva);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page).toHaveURL(/\/play$/);

    // Con la sesión cerrada, entra con la contraseña nueva.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.goto('/auth');
    await page.getByLabel('Email o usuario').fill(cuenta.username);
    await page.getByLabel('Contraseña').fill(nueva);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/play$/);

    // El enlace ya se usó: no sirve una segunda vez (la sesión abierta no importa, la ruta es pública).
    await page.goto(enlace!);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(`${nueva}-2`);
    await page.getByLabel('Repite la contraseña').fill(`${nueva}-2`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Este enlace no es válido o ha caducado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toBeVisible();
    await expect(page.getByTestId('enlace-no-valido')).toBeFocused();
    await capture(page, 'nueva-contrasena-caducado');

    // El enlace reutilizado provoca (a propósito) un 400 que Chromium registra como error de consola sin URL.
    // Se descuenta exactamente una vez; el resto debe estar vacío.
    const mensaje400 = 'Failed to load resource: the server responded with a status of 400 (Bad Request)';
    const i = errors.indexOf(mensaje400);
    if (i >= 0) errors.splice(i, 1);
    expect(errors).toEqual([]);
  });
}
