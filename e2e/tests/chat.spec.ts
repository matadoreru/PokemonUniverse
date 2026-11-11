import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  abrirChat, borrarCuentas, capture, collectErrors, comprobarBdE2E, createRoom, escribirEnChat, joinRoom, loginAsGuest,
  nuevaCuenta, registrarPorApi, SIZES, uniqueName, type CuentaE2E,
} from '../src/helpers.js';

// Chat del lobby de punta a punta: el host es una cuenta registrada (su columna lateral lleva también «Invitar amigos», el
// caso más alto a 1280×720) y los demás, invitados. Escribir, historial para quien entra después, filtro de palabras,
// moderar (eliminar y silenciar), recarga con historial y límite de ritmo.
const cuentas: CuentaE2E[] = [];
const MUTED = 'Un moderador te ha silenciado en el chat de esta sala.';
const RITMO = 'Estás enviando mensajes muy rápido; espera unos segundos.';

test.beforeAll(() => {
  comprobarBdE2E();
});

test.afterAll(() => {
  borrarCuentas(cuentas.map((c) => c.email), () => undefined);
});

interface Persona {
  context: BrowserContext;
  page: Page;
  nombre: string;
  errors: string[];
}

async function invitado(browser: Browser, w: number, h: number, prefijo: string): Promise<Persona> {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const nombre = uniqueName(prefijo);
  await loginAsGuest(page, nombre);
  return { context, page, nombre, errors };
}

const mensajes = (page: Page) => page.getByRole('list', { name: 'Mensajes del chat' });

for (const { w, h } of SIZES) {
  test(`chat del lobby a ${w}×${h}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const movil = w < 1024;
    const cuenta = nuevaCuenta('e2e_chat');
    cuentas.push(cuenta);
    const hostCtx = await browser.newContext({ viewport: { width: w, height: h } });
    const host = await hostCtx.newPage();
    const hostErrors = collectErrors(host);
    await registrarPorApi(host, cuenta);
    await host.goto('/play');
    const codigo = await createRoom(host);
    const a = await invitado(browser, w, h, 'Ana');
    await joinRoom(a.page, codigo);
    const personas: Persona[] = [a];
    try {
      // 1. Los dos se escriben y cada uno ve el mensaje del otro. En el móvil, el host cuenta 1 sin leer antes de abrir la pestaña.
      await escribirEnChat(a.page, 'Hola desde Ana');
      if (movil) {
        await expect(host.getByRole('tab', { name: /^Chat/ })).toContainText('1');
        await expect(host.getByRole('tab', { name: /^Chat/ })).toContainText('sin leer');
      }
      await abrirChat(host);
      await expect(mensajes(host)).toContainText('Hola desde Ana');
      await escribirEnChat(host, 'Hola desde el host');
      await expect(mensajes(a.page)).toContainText('Hola desde el host');
      await capture(host, movil ? 'chat-pestana' : 'chat-lobby');

      // 1b. En el móvil, con más de una pantalla de mensajes, al abrir la pestaña se ve lo último.
      if (movil) {
        await host.getByRole('tab', { name: /^Minijuegos/ }).click();
        for (let i = 1; i <= 14; i++) await escribirEnChat(a.page, `Mensaje de relleno número ${i} para que la lista pase de una pantalla`);
        await expect(host.getByRole('tab', { name: /^Chat/ })).toContainText('sin leer');
        await abrirChat(host);
        await expect(mensajes(host)).toContainText('relleno número 14');
        await expect.poll(() => mensajes(host).evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(8);
        expect(await mensajes(host).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      }

      // 2. Un tercer jugador entra y ve los mensajes anteriores.
      const b = await invitado(browser, w, h, 'Blas');
      personas.push(b);
      await joinRoom(b.page, codigo);
      await abrirChat(b.page);
      await expect(mensajes(b.page)).toContainText('Hola desde Ana');
      await expect(mensajes(b.page)).toContainText('Hola desde el host');

      // 3. El filtro de palabras.
      await escribirEnChat(a.page, 'eres un capullo');
      await expect(mensajes(host)).toContainText('eres un ***');
      await expect(mensajes(host)).not.toContainText('capullo');

      // 4. El host abre la moderación del mensaje, lo elimina y desaparece en las dos páginas.
      await host.getByRole('button', { name: `Moderar el mensaje de ${a.nombre}` }).last().click();
      const dialogo = host.getByRole('dialog', { name: `Mensaje de ${a.nombre}` });
      await expect(dialogo).toBeVisible();
      await capture(host, 'chat-moderar');
      await dialogo.getByRole('button', { name: 'Eliminar mensaje' }).click();
      await expect(dialogo).toBeHidden();
      await expect(mensajes(host)).not.toContainText('eres un ***');
      await expect(mensajes(a.page)).not.toContainText('eres un ***');

      // 5. El host silencia a Ana desde el diálogo; ella ve el motivo y el chip «Silenciado», y el host quita el silencio.
      await escribirEnChat(a.page, 'Un último mensaje');
      await host.getByRole('button', { name: `Moderar el mensaje de ${a.nombre}` }).last().click();
      await host.getByRole('dialog', { name: `Mensaje de ${a.nombre}` }).getByRole('button', { name: `Silenciar a ${a.nombre} en el chat` }).click();
      await abrirChat(a.page, { conCampo: false });
      await expect(a.page.getByText(MUTED)).toBeVisible();
      await expect(a.page.getByLabel('Escribe un mensaje')).toHaveCount(0);
      await expect(a.page.getByText('Silenciado en el chat', { exact: true })).toBeVisible();
      await capture(a.page, 'chat-silenciado');
      await host.getByRole('button', { name: `Gestionar a ${a.nombre}` }).click();
      await host.getByRole('dialog', { name: `Gestionar a ${a.nombre}` }).getByRole('button', { name: 'Quitar el silencio del chat' }).click();
      await expect(a.page.getByLabel('Escribe un mensaje')).toBeVisible();
      await expect(a.page.getByText(MUTED)).toHaveCount(0);

      if (w === 1280) {
        // 6. Ana recarga en el lobby y vuelve a ver el historial.
        // Recargar manda a «Ya tienes una sala activa»: «Volver a la sala» re-ata el socket (`session:attach` → `restore`).
        await a.page.reload();
        await a.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
        await expect(mensajes(a.page)).toContainText('Hola desde el host');
        await expect(mensajes(a.page)).toContainText('Un último mensaje');

        // 7. 46 mensajes seguidos de Ana (ya había enviado 3 antes de la ráfaga): el 46.º no pasa y el límite de ritmo sale
        // en el aviso de la sala.
        const campo = a.page.getByLabel('Escribe un mensaje');
        for (let i = 1; i <= 43; i++) {
          await campo.fill(`ráfaga ${i}`);
          await campo.press('Enter');
          if (i < 43) await expect(campo).toHaveValue('', { timeout: 10_000 });
        }
        await expect(a.page.getByText(RITMO)).toBeVisible();
      }
      for (const p of [{ errors: hostErrors }, ...personas]) expect(p.errors).toEqual([]);
    } finally {
      await hostCtx.close();
      for (const p of personas) await p.context.close();
    }
  });
}

test('el mensaje a medio escribir vuelve tras recargar y se borra al enviarlo', async ({ browser }) => {
  const yo = await invitado(browser, 1280, 720, 'Borrador');
  try {
    await createRoom(yo.page);
    const volver = async () => {
      await yo.page.reload();
      await yo.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
      await expect(yo.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    };
    let campo = await abrirChat(yo.page);
    await campo.fill('Un borrador sin enviar');
    await volver();
    campo = await abrirChat(yo.page);
    await expect(campo).toHaveValue('Un borrador sin enviar');
    await campo.press('Enter');
    await expect(campo).toHaveValue('');
    await expect(mensajes(yo.page)).toContainText('Un borrador sin enviar');
    await volver();
    await expect(await abrirChat(yo.page)).toHaveValue('');
    expect(yo.errors).toEqual([]);
  } finally {
    await yo.context.close();
  }
});
