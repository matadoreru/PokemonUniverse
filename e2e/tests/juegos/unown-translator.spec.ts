/**
 * E2E de Traductor Unown (`unown-translator`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, terminarSesion, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, juegoEnTrama, sinScorePop, tramasRetenibles, ajustarRango } from '../../src/juegos.js';

/**
 * Lo que dice el mensaje de Traductor Unown con lo que ya se ve, palabra a palabra: cada pieza es un glifo oculto (`?`),
 * una letra revelada en su lugar (imagen «letra X») o un literal.
 */
async function leerMensajeUnown(page: Page): Promise<string> {
  return page.getByTestId('unown-message').evaluate((mensaje) => [...mensaje.children].map((palabra) => [...palabra.children].map((pieza) => {
    const glifo = pieza.querySelector('[role="img"][aria-label]');
    if (!glifo) return pieza.textContent ?? '';
    const etiqueta = glifo.getAttribute('aria-label') ?? '';
    return etiqueta.startsWith('letra ') ? etiqueta.slice('letra '.length) : '?';
  }).join('')).join(' '));
}

/** Espera a que las pistas destapen todo el mensaje (ningún «glifo oculto») y lo envía como respuesta. */
async function descifrarUnown(page: Page): Promise<string> {
  const mensaje = page.getByTestId('unown-message');
  await expect(mensaje.getByRole('img', { name: /^letra / }).first()).toBeVisible({ timeout: 20_000 });
  await expect(mensaje.getByRole('img', { name: 'glifo oculto' })).toHaveCount(0, { timeout: 55_000 });
  const texto = await leerMensajeUnown(page);
  await page.getByRole('textbox', { name: /^Respuesta para la ronda/ }).fill(texto);
  await page.getByTestId('unown-send').click();
  return texto;
}

/** «Modos que se juegan» de Traductor Unown: marca `modo` y desmarca `quitar`, así la sesión solo juega ese modo. */
async function elegirModoUnown(host: Page, modo: string, quitar: string): Promise<void> {
  const modos = host.getByRole('group', { name: 'Modos que se juegan' });
  const opcion = modos.getByRole('button', { name: modo, exact: true });
  const otro = modos.getByRole('button', { name: quitar, exact: true });
  if ((await opcion.getAttribute('aria-pressed')) !== 'true') await opcion.click();
  await expect(opcion).toHaveAttribute('aria-pressed', 'true');
  if ((await otro.getAttribute('aria-pressed')) === 'true') await otro.click();
  await expect(otro).toHaveAttribute('aria-pressed', 'false');
}

/** Ajustes de Traductor Unown para el test: `rondas` rondas de 60 s con una letra cada 3 s. */
async function ajustarUnown(host: Page, rondas: 1 | 2): Promise<void> {
  await ajustarRango(host, 'Número de rondas', 'Home', '1');
  if (rondas === 2) {
    const rango = host.getByRole('slider', { name: 'Número de rondas' });
    await rango.focus();
    await rango.press('ArrowRight');
    await rango.blur();
    await expect(rango).toHaveValue('2');
  }
  await ajustarRango(host, 'Tiempo entre letras', 'Home', '3');
  await expect(host.getByRole('slider', { name: 'Tiempo por ronda' })).toHaveValue('60');
}

/**
 * Traductor Unown con dos jugadores: una partida de dos rondas en Pokémon (`CLASSIC`) y otra de una en Movimientos.
 * En la primera ronda el host falla (ve «No es eso» con el envío bloqueado 3 s) y se captura la ronda con glifos aún
 * ocultos; el invitado espera a que las pistas lo destapen todo, lo lee y lo descifra, y el host acierta después para
 * que la ronda acabe antes de los 60 s. La página del invitado retiene la revelación (6 s) para capturarla.
 */
test('traductor unown: pistas, fallo, acierto y clasificación', async ({ browser }) => {
  test.setTimeout(300_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [b] = invitados as [Jugador];
    const paginas = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Traductor Unown');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await ajustarUnown(host.page, 2);
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 6 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(paginas);

    const mensaje = (page: Page) => page.getByTestId('unown-message');
    const viva = (page: Page) => page.getByTestId('unown-screen').locator('[aria-live]');
    for (const page of paginas) await expect(page.getByRole('heading', { name: 'Descifra el mensaje' })).toBeVisible({ timeout: 20_000 });
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);
    await expect(host.page.getByText('Pokémon', { exact: true }).first()).toBeVisible();

    // La ronda empieza con una o dos letras reveladas, en el mensaje (en el sitio del glifo) y en el alfabeto.
    await expect(mensaje(host.page).getByRole('img', { name: /^letra / }).first()).toBeVisible({ timeout: 10_000 });
    await expect(mensaje(host.page).locator('[data-reveal="replace"]').first()).toBeVisible();
    await expect(host.page.getByTestId('unown-alphabet').getByRole('img', { name: /^letra / }).first()).toBeVisible();
    await expect(host.page.getByText(/^Siguiente letra en \d+ s$/)).toBeVisible();

    // El host falla: «No es eso» y el envío bloqueado aunque haya texto.
    const campo = (page: Page) => page.getByRole('textbox', { name: /^Respuesta para la ronda/ });
    await campo(host.page).fill('ZZZZZZ');
    await host.page.getByTestId('unown-send').click();
    await expect(host.page.getByText(/^No es eso/)).toBeVisible({ timeout: 10_000 });
    // El fallo no borra lo escrito: queda para corregirlo.
    await expect(campo(host.page)).toHaveValue('ZZZZZZ');
    await expect(host.page.getByTestId('unown-send')).toBeDisabled();
    await expect(mensaje(host.page).getByRole('img', { name: 'glifo oculto' }).first()).toBeVisible();
    await campo(host.page).fill('');
    await capturarTamanos(host.page, 'juego-unown-translator-ronda', { sigue: mensaje(host.page) });

    // B lo descifra con todas las letras a la vista.
    const leida = await descifrarUnown(b.page);
    await expect(b.page.getByRole('heading', { name: '¡Descifrado!' })).toBeVisible({ timeout: 10_000 });
    // La placa enseña la respuesta (con su ortografía, que puede no ser la leída) solo a quien la ha descifrado.
    const decia = b.page.getByText(/^Decía .+\. Sigue oculto para los demás\.$/);
    await expect(decia).toBeVisible();
    const respuesta = /^Decía (.+)\. Sigue oculto/.exec(await decia.innerText())![1]!;
    expect(respuesta.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase()).toBe(leida.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
    await expect(host.page.getByText(respuesta, { exact: true })).toHaveCount(0);
    // Con B acertado y el host pendiente, la ronda sigue: el host acierta y B retiene la revelación.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'unown-translator')?.phase === 'ROUND_RESULTS');
    await descifrarUnown(host.page);
    // El acierto del host cierra la ronda: su región viva lo anuncia igualmente.
    await expect(viva(host.page)).toContainText('¡Descifrado!', { timeout: 10_000 });

    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(b.page.getByRole('heading', { name: `¡Decía ${respuesta}!` })).toBeVisible();
    const revelada = b.page.getByRole('region', { name: respuesta });
    await expect(revelada).toBeVisible();
    await expect(b.page.getByText(/^1\.º · /)).toBeVisible();
    await expect(viva(b.page)).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-unown-translator-revelacion', { sigue: revelada });
    retenedor.soltar();

    // Segunda ronda: los dos la descifran y la partida acaba en la clasificación.
    for (const page of paginas) await expect(page.getByRole('heading', { name: 'Descifra el mensaje' })).toBeVisible({ timeout: 20_000 });
    await descifrarUnown(b.page);
    await descifrarUnown(host.page);
    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 20_000 });
    await terminarSesion(host.page);
    await host.page.getByRole('button', { name: 'Volver al lobby' }).click({ timeout: 15_000 });
    await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeAttached({ timeout: 15_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });

    // Segunda partida: una ronda en Movimientos.
    await seleccionarJuego(host.page, 'Traductor Unown');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await expect(host.page.getByRole('slider', { name: 'Número de rondas' })).toBeVisible();
    await elegirModoUnown(host.page, 'Movimientos', 'Pokémon');
    await ajustarUnown(host.page, 1);
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(paginas);
    await expect(host.page.getByRole('heading', { name: 'Descifra el mensaje' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('Movimientos', { exact: true }).first()).toBeVisible();
    // Con todo el nombre del movimiento destapado (la línea más ancha), a los tres tamaños.
    await expect(mensaje(host.page).getByRole('img', { name: 'glifo oculto' })).toHaveCount(0, { timeout: 55_000 });
    await capturarTamanos(host.page, 'juego-unown-translator-movimiento', { sigue: mensaje(host.page) });
    await descifrarUnown(b.page);
    await descifrarUnown(host.page);

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('El último mensaje decía')).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-unown-translator-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
