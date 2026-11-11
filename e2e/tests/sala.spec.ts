import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { capture, capturarATresTamaños, cartaDeJuego, collectErrors, conmutarJuego, crearSalaConJugadores, createRoom, joinRoom, loginAsGuest, esperarPartida, SIZES, uniqueName } from '../src/helpers.js';

interface Jugador {
  context: BrowserContext;
  page: Page;
  errors: string[];
  name: string;
}

/** Abre un contexto aislado (cookies propias) y entra como invitado. */
async function nuevoJugador(browser: Browser, prefijo: string, w = 1280, h = 720): Promise<Jugador> {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const name = uniqueName(prefijo);
  try {
    await loginAsGuest(page, name);
  } catch (error) {
    await context.close();
    throw error;
  }
  return { context, page, errors, name };
}

/** Fixture `crearJugador`: cierra todos los contextos abiertos al acabar, aunque el test falle. */
const test = base.extend<{ crearJugador: (prefijo: string, w?: number, h?: number) => Promise<Jugador> }>({
  crearJugador: async ({ browser }, use) => {
    const abiertos: Jugador[] = [];
    await use(async (prefijo, w, h) => {
      const jugador = await nuevoJugador(browser, prefijo, w, h);
      abiertos.push(jugador);
      return jugador;
    });
    await Promise.all(abiertos.map((j) => j.context.close()));
  },
});

/** Alto de cada carta (su `li`) de la lista «Minijuegos» del lobby. */
async function cartasDelLobby(page: Page): Promise<number[]> {
  return page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
}

/** En la página del host, el invitado aparece en la lista y el contador marca 2 / 8. */
async function esperarInvitado(host: Page, nombre: string): Promise<void> {
  await expect(host.getByText(nombre, { exact: true }).first()).toBeVisible();
  await expect(host.getByRole('region', { name: 'Jugadores' }).getByText('2 / 8', { exact: true })).toBeVisible();
}

test('dos jugadores crean una sala, se unen y empiezan la partida', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible();
  // Solo, el host no puede empezar (faltan jugadores para el minijuego por defecto).
  await expect(host.page.locator('#start-help')).not.toHaveText('La sala está lista.');
  await expect(host.page.getByRole('button', { name: 'Empezar partida' })).toBeDisabled();
  await capture(host.page, 'lobby-host-solo');

  const guest = await crearJugador('Inv');
  await joinRoom(guest.page, code);
  await expect(guest.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible();
  await esperarInvitado(host.page, guest.name);
  await capture(guest.page, 'lobby-invitado');

  await guest.page.getByRole('button', { name: 'Marcarme listo' }).click();
  await expect(guest.page.getByRole('button', { name: 'Estoy listo' })).toHaveAttribute('aria-pressed', 'true');

  await expect(host.page.locator('#start-help')).toHaveText('La sala está lista.');
  await capture(host.page, 'lobby-host-lista');
  await host.page.getByRole('button', { name: 'Empezar partida' }).click();
  // Pokédex Distance (el juego por defecto) empieza al momento.
  await esperarPartida([host.page, guest.page]);
  await expect(host.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 });
  await capture(host.page, 'juego-pokedex-distance');

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`un código inexistente muestra el error en el campo a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await loginAsGuest(page, uniqueName('E2E'));
    // Se pega en minúsculas y con guion: el campo lo normaliza.
    await page.locator('#room-code').fill('zzz-zzz');
    await expect(page.locator('#room-code')).toHaveValue('ZZZZZZ');
    await page.getByRole('button', { name: 'Unirse a la sala' }).click();
    // El servidor responde en inglés ('Room not found'); la pantalla lo da en español en el campo, que recibe el foco,
    // y el aviso global de la sala no repite el texto en inglés.
    const alerta = page.getByRole('alert').filter({ hasText: 'No hay ninguna sala con ese código.' });
    await expect(alerta).toBeVisible();
    await expect(page.locator('#room-code')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#room-code')).toBeFocused();
    await expect(page.getByText(/room not found/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/play$/);
    await capture(page, 'entrar-en-partida-error');

    // Un código incompleto no viaja al servidor: el campo dice cuánto falta.
    await page.locator('#room-code').fill('AB');
    await page.getByRole('button', { name: 'Unirse a la sala' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Faltan 4 caracteres del código.' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('con una sala activa, Jugar ofrece volver o salir sin solaparse con la fila de la sala', async ({ page }) => {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  await createRoom(page);
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Ya tienes una sala activa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a la sala' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Salir de la sala' })).toBeEnabled();
  await capture(page, 'entrar-en-partida-sala-activa');
  await page.getByRole('button', { name: 'Salir de la sala' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const { w, h } of SIZES) {
  test(`lobby a ${w}×${h}`, async ({ crearJugador }) => {
    const host = await crearJugador('Host', w, h);
    const code = await createRoom(host.page);
    const guest = await crearJugador('Inv', w, h);
    await joinRoom(guest.page, code);
    await esperarInvitado(host.page, guest.name);
    // Escritorio: sin scroll de página ni del `main`, y «¡Empezar partida!» a la vista sin desplazar.
    await capture(host.page, 'lobby');
    await expect(host.page.getByRole('button', { name: '¡Empezar partida!' })).toBeInViewport({ ratio: 1 });
    // Todas las cartas de la rejilla miden lo mismo, también las de filas con un nombre a dos líneas.
    const altos = await cartasDelLobby(host.page);
    expect(altos.length).toBeGreaterThan(1);
    for (const alto of altos) expect(Math.abs(alto - altos[0]!), `alto de carta a ${w}×${h}: ${altos.join(', ')}`).toBeLessThanOrEqual(1);
    // Con pocas cartas, las filas no se estiran para llenar el panel: miden lo que pide su carta, nunca más.
    await host.page.getByLabel('Buscar minijuego').fill('Shiny');
    await expect(host.page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').first()).toBeVisible();
    const pocas = await cartasDelLobby(host.page);
    expect(pocas.length).toBeLessThan(altos.length);
    for (const alto of pocas) expect(alto, `alto con pocas cartas: ${pocas.join(', ')}`).toBeLessThanOrEqual(altos[0]! + 1);
    await host.page.getByLabel('Buscar minijuego').fill('');
    await expect(guest.page.getByRole('button', { name: 'Marcarme listo' })).toBeInViewport({ ratio: 1 });

    expect(host.errors).toEqual([]);
    expect(guest.errors).toEqual([]);
  });
}

test('el host quita el único minijuego: no se puede empezar hasta elegir otro', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  const guest = await crearJugador('Inv');
  await joinRoom(guest.page, code);
  await esperarInvitado(host.page, guest.name);
  await guest.page.getByRole('button', { name: 'Marcarme listo' }).click();
  await expect(host.page.locator('#start-help')).toHaveText('La sala está lista.');

  // Pokédex Distance es el único elegido: pulsarlo lo quita y la selección queda vacía.
  const empezar = host.page.getByRole('button', { name: 'Empezar partida' });
  await conmutarJuego(cartaDeJuego(host.page, 'Pokédex Distance'), false);
  const lista = host.page.getByRole('list', { name: 'Minijuegos' });
  await expect(lista.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(host.page.getByText('0 elegidos', { exact: false })).toBeVisible();
  await expect(host.page.locator('#start-help')).toHaveText('Elige al menos un minijuego para empezar.');
  await expect(empezar).toBeDisabled();
  await capturarATresTamaños(host.page, 'lobby-seleccion-vacia', { restaurar: false });

  // Configuración: un estado vacío en lugar de los ajustes; el modo se sigue pudiendo cambiar.
  await host.page.getByRole('tab', { name: 'Configuración' }).click();
  await expect(host.page.getByText('Elige uno o varios minijuegos')).toBeVisible();
  await host.page.getByRole('tab', { name: 'Modo y sesión' }).click();
  const aviso = host.page.getByRole('status').filter({ hasText: 'Elige al menos un minijuego.' });
  await expect(aviso).toBeVisible();
  // En la primera vista del panel (sin scroll), no solo presente: a 390 el panel tiene scroll interno.
  await capturarATresTamaños(host.page, 'lobby-modo-seleccion-vacia', { antes: () => expect(aviso).toBeInViewport({ ratio: 1 }), restaurar: false });
  await host.page.getByRole('button', { name: /^Votación/ }).click();
  await expect(host.page.getByRole('button', { name: /^Votación/ })).toHaveAttribute('aria-pressed', 'true');

  // Elegir otro minijuego vuelve a dejar empezar.
  await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
  await conmutarJuego(cartaDeJuego(host.page, 'Shiny Quiz'), true);
  await expect(host.page.locator('#start-help')).toHaveText('La sala está lista.');
  await expect(empezar).toBeEnabled();

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

test('lobby: pestañas del invitado, modo de la sesión y búsqueda sin resultados', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  const guest = await crearJugador('Inv');
  await joinRoom(guest.page, code);
  await esperarInvitado(host.page, guest.name);

  // Invitado: la configuración del juego en solo lectura, enmarcada en su panel.
  await guest.page.getByRole('tab', { name: 'Configuración' }).click();
  await expect(guest.page.getByRole('heading', { name: 'Ajustes de Pokédex Distance' })).toBeVisible();
  await expect(guest.page.getByText('Solo el host y los co-hosts pueden cambiar estos ajustes.')).toBeVisible();
  await capturarATresTamaños(guest.page, 'lobby-invitado-configuracion', { restaurar: false });

  // Host: el modo de la sesión con el orden de los minijuegos elegidos (por defecto, «Por orden»).
  await host.page.getByRole('tab', { name: 'Modo y sesión' }).click();
  await expect(host.page.getByRole('button', { name: /^Por orden/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(host.page.getByRole('button', { name: /^Infinita/ })).toHaveAttribute('aria-pressed', 'true');
  await capturarATresTamaños(host.page, 'lobby-modo-sesion', { restaurar: false });

  // Búsqueda de minijuegos sin coincidencias: estado vacío con acción para volver a la rejilla.
  await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
  const buscar = host.page.getByLabel('Buscar minijuego');
  await buscar.fill('zzzz');
  await expect(host.page.getByText('No hay minijuegos que coincidan con “zzzz”.')).toBeVisible();
  await capturarATresTamaños(host.page, 'lobby-busqueda-vacia', { restaurar: false });
  await host.page.getByRole('button', { name: 'Borrar búsqueda' }).click();
  await expect(buscar).toHaveValue('');
  await expect(host.page.getByRole('list', { name: 'Minijuegos' })).toBeVisible();

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

test('el host gestiona a un jugador desde su franja y lo expulsa tras confirmarlo', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  const guest = await crearJugador('Inv');
  await joinRoom(guest.page, code);
  await esperarInvitado(host.page, guest.name);
  const gestionar = host.page.getByRole('button', { name: `Gestionar a ${guest.name}` });

  // Esc cierra el menú y el foco vuelve a la píldora.
  await gestionar.click();
  const menu = host.page.getByRole('dialog', { name: `Gestionar a ${guest.name}` });
  await expect(menu).toBeVisible();
  await capture(host.page, 'lobby-gestionar-jugador');
  await host.page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(gestionar).toBeFocused();

  // Expulsar pide confirmación; «Cancelar» tiene el foco y no expulsa.
  await gestionar.click();
  await menu.getByRole('button', { name: 'Expulsar de la sala' }).click();
  const confirmar = host.page.getByRole('dialog', { name: `¿Expulsar a ${guest.name}?` });
  await expect(confirmar).toBeVisible();
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await capture(host.page, 'lobby-expulsar-confirmacion');
  await confirmar.getByRole('button', { name: 'Expulsar de la sala' }).click();
  await expect(confirmar).toBeHidden();
  await expect(host.page.getByRole('region', { name: 'Jugadores' }).getByText('1 / 8', { exact: true })).toBeVisible();
  await expect(host.page.getByText(guest.name, { exact: true })).toHaveCount(0);
  // La franja expulsada ya no existe: el foco no cae al `body`, va al título del panel de jugadores.
  await expect(host.page.getByRole('heading', { name: 'Jugadores' })).toBeFocused();

  expect(host.errors).toEqual([]);
});

test('si el host sale del lobby, el invitado pasa a host con sus controles y sin botones muertos', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  const guest = await crearJugador('Inv');
  await joinRoom(guest.page, code);
  await esperarInvitado(host.page, guest.name);
  await expect(guest.page.getByRole('button', { name: 'Marcarme listo' })).toBeVisible();
  await expect(guest.page.getByRole('button', { name: 'Empezar partida' })).toHaveCount(0);

  // En el lobby «Salir» no pide confirmación: el host vuelve a Jugar.
  await host.page.getByRole('button', { name: 'Salir de la sala' }).click();
  await expect(host.page.getByRole('dialog')).toHaveCount(0);
  await expect(host.page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();

  // El invitado hereda el Host: «¡Empezar partida!» (deshabilitado solo, con el motivo a la vista) y no «Marcarme listo».
  const jugadores = guest.page.getByRole('region', { name: 'Jugadores' });
  await expect(jugadores.getByText('1 / 8', { exact: true })).toBeVisible();
  await expect(jugadores.getByRole('listitem').filter({ hasText: guest.name })).toContainText('Host');
  const empezar = guest.page.getByRole('button', { name: 'Empezar partida' });
  await expect(empezar).toBeVisible();
  await expect(guest.page.getByRole('button', { name: /Marcarme listo|Estoy listo/ })).toHaveCount(0);
  await expect(empezar).toHaveAttribute('aria-describedby', 'start-help');
  await expect(guest.page.locator('#start-help')).toHaveText('Se necesitan al menos 2 jugadores conectados.');
  // Ya puede cambiar el minijuego (la rejilla no es de solo lectura).
  await expect(guest.page.getByText('Solo lectura')).toHaveCount(0);
  await capture(guest.page, 'lobby-host-heredado');

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

test('un rechazo del servidor sale una sola vez, en español, en el aviso de la sala', async ({ crearJugador }) => {
  const host = await crearJugador('Host');
  const code = await createRoom(host.page);
  const guest = await crearJugador('Inv');
  // El `/ws` del invitado pasa por aquí: «listo» recibe el rechazo en inglés que manda el servidor fuera del lobby.
  await guest.page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const frame = JSON.parse(String(message)) as { id?: string; event?: string };
      if (frame.event === 'room:set-ready' && frame.id) ws.send(JSON.stringify({ id: frame.id, ok: false, error: 'This setting can only be changed in the lobby' }));
      else server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  await guest.page.reload();
  await joinRoom(guest.page, code);
  await esperarInvitado(host.page, guest.name);

  await guest.page.getByRole('button', { name: 'Marcarme listo' }).click();
  const aviso = guest.page.getByRole('alert');
  await expect(aviso).toHaveCount(1);
  await expect(aviso).toContainText('Este ajuste solo se puede cambiar en el lobby.');
  await expect(guest.page.getByText('This setting can only be changed in the lobby')).toHaveCount(0);
  await capturarATresTamaños(guest.page, 'sala-aviso-error', { restaurar: false });
  await aviso.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(guest.page.getByRole('alert')).toHaveCount(0);

  expect(host.errors).toEqual([]);
});

test('lobby con 8 jugadores a 390×844: la lista tiene tope y las pestañas siguen cerca', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 8, { width: SIZES[2].w, height: SIZES[2].h });
  try {
    const { host, jugadores } = sala;
    const cuerpo = host.page.getByRole('region', { name: 'Lista de jugadores' });
    const caja = await cuerpo.boundingBox();
    // `max-height: min(40dvh, 22rem)`: 337,6 px a 844 de alto.
    expect(caja && caja.height <= Math.min(0.4 * SIZES[2].h, 352) + 1, `alto de la lista: ${caja?.height}`).toBe(true);
    expect(await cuerpo.evaluate((el) => el.scrollHeight > el.clientHeight), 'la lista se desplaza por dentro').toBe(true);
    // Las pestañas quedan en la primera pantalla y media (antes la lista las empujaba muy abajo).
    const pestañas = await host.page.getByRole('tablist').first().boundingBox();
    expect(pestañas && pestañas.y < SIZES[2].h * 1.5, `pestañas en y=${pestañas?.y}`).toBe(true);
    await capture(host.page, 'lobby-8-jugadores');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * Fija el aviso de conexión sin depender de lo que tarde el backend en frío. Con `perdida = false` el `/ws` de la sala
 * se queda en CONNECTING para siempre («Conectando con la sala»); con `perdida = true` el primero abre y se cae al
 * momento y los siguientes intentos se quedan en CONNECTING («Conexión perdida»). El resto de WebSockets (HMR de
 * Vite) usan el nativo.
 */
async function salaSinConexion(page: Page, perdida: boolean): Promise<void> {
  await page.addInitScript((perderLaPrimera) => {
    const Native = window.WebSocket;
    // React (StrictMode en desarrollo) monta, desmonta y vuelve a montar el proveedor: el primer `/ws` se cierra al
    // momento. Solo abre y cae el primero que la aplicación sigue usando; los demás se quedan CONNECTING.
    let yaAbrio = false;
    class Pending extends EventTarget {
      readyState: number = Native.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror = null;
      private cerradoPorLaApp = false;
      constructor(readonly url: string, abreYCae: boolean) {
        super();
        if (!abreYCae) return;
        // El `/ws` ya está abierto en toda página, antes de que monte la sala: la conexión solo «se pierde» cuando el
        // aviso de la sala está en pantalla (si cae antes de montarlo, el aviso no la vio nunca abierta).
        const espera = setInterval(() => {
          if (this.cerradoPorLaApp || yaAbrio) { clearInterval(espera); return; }
          if (!document.querySelector('.connection-notice-region')) return;
          clearInterval(espera);
          yaAbrio = true;
          this.readyState = Native.OPEN; this.onopen?.(new Event('open'));
          setTimeout(() => { this.readyState = Native.CLOSED; this.onclose?.(new CloseEvent('close', { code: 1006 })); }, 300);
        }, 50);
      }
      send(): void {}
      close(): void { this.cerradoPorLaApp = true; }
    }
    class Pendiente extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        if (new URL(String(url), location.href).pathname === '/ws') return new Pending(String(url), perderLaPrimera) as unknown as Pendiente;
        super(url, protocols);
      }
    }
    window.WebSocket = Pendiente;
  }, perdida);
}

async function avisoDeConexion(page: Page, perdida = false): Promise<void> {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  await salaSinConexion(page, perdida);
  await page.goto('/play');
  const aviso = page.getByRole('status').filter({ hasText: perdida ? 'Conexión perdida' : 'Conectando con la sala' });
  await expect(aviso).toBeVisible();
  // El aviso nunca tapa la fila de marca y navegación de la cabecera: empieza donde ella acaba o más abajo.
  const marca = await page.locator('header > div').first().boundingBox();
  const caja = await aviso.locator('.connection-notice').boundingBox();
  expect(marca && caja && caja.y >= marca.y + marca.height - 1, 'el aviso queda bajo la fila de marca').toBe(true);
  await capture(page, `sala-${perdida ? 'conexion-perdida' : 'conectando'}`);
  expect(errors).toEqual([]);
}

for (const { w, h } of SIZES) {
  test(`aviso de conexión de la sala a ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await avisoDeConexion(page);
  });

  test(`aviso de conexión perdida a ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await avisoDeConexion(page, true);
  });
}

test('una entrada normal en la sala no muestra el aviso de conexión', async ({ page }) => {
  const errors = collectErrors(page);
  await loginAsGuest(page, uniqueName('E2E'));
  // Primera conexión de calentamiento: el `/ws` en frío puede tardar más que el retardo del aviso.
  await expect(page.getByRole('button', { name: '¡Crear sala!' })).toBeEnabled();
  // Desde aquí se anota si el aviso llega a pintarse en algún momento, aunque sea un instante.
  await page.addInitScript(() => {
    const w = window as unknown as { avisoVisto: boolean };
    w.avisoVisto = false;
    new MutationObserver(() => { if (document.querySelector('.connection-notice')) w.avisoVisto = true; })
      .observe(document, { childList: true, subtree: true });
  });
  await page.goto('/play');
  await createRoom(page);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { avisoVisto: boolean }).avisoVisto), 'el aviso de conexión no debe aparecer').toBe(false);
  expect(errors).toEqual([]);
});
