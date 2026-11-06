import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  abrirAmigos, anadirJuegos, borrarCuentas, capture, cartaDeJuego, cerrarAmigos, collectErrors, comprobarBdE2E, conmutarJuego,
  createRoom, hacerAmigosPorApi, nuevaCuenta, registrarPorApi, SIZES, type CuentaE2E,
} from '../src/helpers.js';

// Amigos e invitaciones de punta a punta con cuentas registradas, cada una en su contexto de navegador: solicitud por
// nombre en mayúsculas, aceptación, presencia, invitación desde el lobby, aviso con «Unirse» (también desde otra sala) y
// una invitación a una sala que ya no existe; además, otra página de la misma cuenta fuera de la sala no le quita el asiento. Cada pareja solo admite una invitación cada 30 s: cuentas nuevas por tamaño.
const cuentas: CuentaE2E[] = [];

test.beforeAll(() => {
  comprobarBdE2E();
});

test.afterAll(() => {
  borrarCuentas(cuentas.map((c) => c.email), () => undefined);
});

interface Persona {
  cuenta: CuentaE2E;
  context: BrowserContext;
  page: Page;
  errors: string[];
}

async function persona(browser: Browser, prefijo: string, w: number, h: number): Promise<Persona> {
  const cuenta = nuevaCuenta(prefijo);
  cuentas.push(cuenta);
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await registrarPorApi(page, cuenta);
  await page.goto('/play');
  await expect(page.getByRole('button', { name: '¡Crear sala!' })).toBeEnabled();
  return { cuenta, context, page, errors };
}

const aviso = (page: Page) => page.getByRole('group', { name: 'Invitaciones' });

for (const { w, h } of SIZES) {
  test(`amigos e invitaciones a ${w}×${h}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await persona(browser, 'e2e_amA', w, h);
    const b = await persona(browser, 'e2e_amB', w, h);
    const c = await persona(browser, 'e2e_amC', w, h);
    const d = await persona(browser, 'e2e_amD', w, h);
    try {
      // 1. A abre «Amigos» (vacío) y pide la amistad a B con el nombre en mayúsculas.
      const panelA = await abrirAmigos(a.page);
      await expect(panelA.getByText('Aún no tienes amigos')).toBeVisible();
      await capture(a.page, 'amigos-vacio');
      await panelA.getByLabel('Nombre de usuario').fill(b.cuenta.username.toUpperCase());
      await panelA.getByRole('button', { name: 'Enviar solicitud' }).click();
      await expect(panelA.getByText(`Solicitud enviada a ${b.cuenta.username}.`)).toBeVisible();
      await expect(panelA.getByRole('button', { name: `Cancelar la solicitud a ${b.cuenta.username}` })).toBeVisible();
      await cerrarAmigos(a.page);

      // 2. B ve el contador en la placa, abre el panel y acepta.
      await expect(b.page.getByRole('button', { name: 'Amigos, 1 solicitud pendiente' })).toBeVisible();
      const panelB = await abrirAmigos(b.page);
      await expect(panelB.getByRole('button', { name: `Aceptar a ${a.cuenta.username}` })).toBeVisible();
      await capture(b.page, 'amigos-solicitud');
      await panelB.getByRole('button', { name: `Aceptar a ${a.cuenta.username}` }).click();
      await expect(panelB.getByRole('button', { name: `Quitar a ${a.cuenta.username}` })).toBeVisible();
      await cerrarAmigos(b.page);
      await expect(b.page.getByRole('button', { name: 'Amigos', exact: true })).toBeVisible();

      // 3. A ve a B «Conectado».
      const panelA2 = await abrirAmigos(a.page);
      const filaB = panelA2.getByRole('listitem').filter({ hasText: b.cuenta.username });
      await expect(filaB).toContainText('Conectado');
      await capture(a.page, 'amigos-lista');
      await cerrarAmigos(a.page);

      // 4. A crea una sala; en el lobby, B aparece con «Invitar».
      const codigo = await createRoom(a.page);

      // 4b. Otra página de A en Inicio (mismo contexto) abre el `/ws` por los amigos sin quitarle el asiento a la pestaña
      // de la sala: no recibe la sala, y la pestaña de la sala sigue mandando mientras está abierta y después de cerrarla.
      const otra = await a.context.newPage();
      // El `/ws` del backend, no el socket de recarga en caliente de Vite.
      const socketOtra = otra.waitForEvent('websocket', { predicate: (ws) => new URL(ws.url()).pathname === '/ws' });
      await otra.goto('/');
      const wsOtra = await socketOtra;
      const tramasOtra: string[] = [];
      wsOtra.on('framereceived', ({ payload }) => { tramasOtra.push(String(payload)); });
      const panelOtra = await abrirAmigos(otra);
      await expect(panelOtra.getByRole('listitem').filter({ hasText: b.cuenta.username })).toContainText('Conectado');
      await anadirJuegos(a.page, ['Shiny Quiz']);
      await otra.close();
      // Órdenes tras el cierre (cada una espera su estado): la segunda ya llega con el cierre procesado; la última deja
      // la selección como estaba.
      await conmutarJuego(cartaDeJuego(a.page, 'Shiny Quiz'), false);
      await conmutarJuego(cartaDeJuego(a.page, 'Shiny Quiz'), true);
      await conmutarJuego(cartaDeJuego(a.page, 'Shiny Quiz'), false);
      await expect(a.page.getByText(/dos pestañas/)).toHaveCount(0);
      expect(tramasOtra.filter((trama) => trama.includes('session:restored') || trama.includes('room:state'))).toEqual([]);
      await a.page.getByRole('button', { name: /^Invitar amigos/ }).click();
      const panelLobby = a.page.getByRole('dialog', { name: 'Amigos' });
      await expect(panelLobby.getByRole('button', { name: `Invitar a ${b.cuenta.username}` })).toBeEnabled();
      await capture(a.page, 'lobby-invitar');
      await panelLobby.getByRole('button', { name: `Invitar a ${b.cuenta.username}` }).click();
      await expect(panelLobby.getByRole('button', { name: `${b.cuenta.username} invitado` })).toBeVisible();
      await cerrarAmigos(a.page);

      // 5. B, en /play, ve el aviso, pulsa «Unirse» y llega a la sala de A.
      await expect(aviso(b.page)).toContainText(`${a.cuenta.username} te invita a su sala`);
      await expect(aviso(b.page)).toContainText(codigo);
      await capture(b.page, 'invitacion');
      await aviso(b.page).getByRole('button', { name: 'Unirse' }).click();
      await expect(b.page).toHaveURL(/\/room$/);
      await expect(b.page.getByRole('button', { name: new RegExp(`Copiar código de sala.*${codigo}$`) })).toBeVisible();
      await expect(aviso(b.page)).toHaveCount(0);

      // 6. Variante: B ya está en la sala de A; C (su amigo) lo invita a otra y B confirma salir de la suya.
      await hacerAmigosPorApi({ page: c.page, cuenta: c.cuenta }, { page: b.page, cuenta: b.cuenta });
      const codigoC = await createRoom(c.page);
      await c.page.getByRole('button', { name: /^Invitar amigos/ }).click();
      await c.page.getByRole('dialog', { name: 'Amigos' }).getByRole('button', { name: `Invitar a ${b.cuenta.username}` }).click();
      await expect(c.page.getByRole('button', { name: `${b.cuenta.username} invitado` })).toBeVisible();
      await cerrarAmigos(c.page);
      await expect(aviso(b.page)).toContainText(`${c.cuenta.username} te invita a su sala`);
      await aviso(b.page).getByRole('button', { name: 'Unirse' }).click();
      const confirmar = b.page.getByRole('dialog', { name: '¿Cambiar de sala?' });
      await expect(confirmar).toContainText(`Saldrás de tu sala actual. ¿Unirte a la sala de ${c.cuenta.username}?`);
      await confirmar.getByRole('button', { name: 'Unirme' }).click();
      await expect(b.page.getByRole('button', { name: new RegExp(`Copiar código de sala.*${codigoC}$`) })).toBeVisible();

      // 7. D invita a B y cierra su sala antes de que B pulse «Unirse»: B ve el error traducido.
      await hacerAmigosPorApi({ page: d.page, cuenta: d.cuenta }, { page: b.page, cuenta: b.cuenta });
      const codigoD = await createRoom(d.page);
      await d.page.getByRole('button', { name: /^Invitar amigos/ }).click();
      await d.page.getByRole('dialog', { name: 'Amigos' }).getByRole('button', { name: `Invitar a ${b.cuenta.username}` }).click();
      await expect(d.page.getByRole('button', { name: `${b.cuenta.username} invitado` })).toBeVisible();
      await cerrarAmigos(d.page);
      await expect(aviso(b.page)).toContainText(codigoD);
      await d.page.getByRole('button', { name: 'Salir de la sala' }).click();
      await expect(d.page).toHaveURL(/\/play$/);
      await aviso(b.page).getByRole('button', { name: 'Unirse' }).click();
      await b.page.getByRole('dialog', { name: '¿Cambiar de sala?' }).getByRole('button', { name: 'Unirme' }).click();
      await expect(b.page.getByText('No hay ninguna sala con ese código. Revísalo con quien la creó.')).toBeVisible();
      await expect(aviso(b.page)).toHaveCount(0);

      // Chromium registra sin URL los 4xx esperados; el resto de errores de consola debe estar vacío.
      for (const p of [a, b, c, d]) expect(p.errors, p.cuenta.username).toEqual([]);
    } finally {
      for (const p of [a, b, c, d]) await p.context.close();
    }
  });
}
