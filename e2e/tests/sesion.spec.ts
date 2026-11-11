/**
 * Votación del siguiente minijuego y resultados de la sesión (`frontend/src/room/NextGameVote.tsx`,
 * `SessionResults.tsx`) contra el `/ws` de Java (`npm run test:e2e -- sesion`): una partida de Higher or Lower de una
 * ronda con la rotación por votación, la votación, el revelado del ganador y la clasificación final; y los modos que
 * se juegan de un juego (al azar o por votación cada modo marcado es una opción de voto; por orden, un turno de la cola).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { anadirJuegos, capture, crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../src/helpers.js';

/**
 * Captura a los tres tamaños de revisión: sin scroll de página ni de `main` en escritorio y texto de 13 px o más.
 * `sigue` (lo que la captura debe enseñar) se centra en la vista en cada tamaño.
 */
async function capturarPantalla(page: Page, nombre: string, sigue: Locator): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    // Al centro: a 390 px la franja de acción fija tapa el borde inferior de la vista.
    await sigue.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const { id, problems } = await layoutProblems(page, nombre, true);
    await expect(sigue, `${id}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 });
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** Juegos que necesitan datos que la BD local puede no tener (los `UNAVAILABLE` de `src/juegos.ts`): no se votan. */
const registry = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/games/registry.json', import.meta.url), 'utf8')) as { id: string; name: string }[];
const SIN_DATOS = new Set(registry.filter((game) => ['tcg-higher-lower', 'pokemon-palette-guess'].includes(game.id)).map((game) => game.name));

test('sesión: votación del siguiente juego y clasificación final', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    const pages = jugadores.map((j) => j.page);

    // Higher or Lower a una ronda, primero de tres minijuegos, y orden por votación.
    await seleccionarJuego(host.page, 'Higher or Lower');
    await anadirJuegos(host.page, ['Shiny Quiz', 'Pokédex Distance']);
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await host.page.getByRole('tab', { name: 'Modo y sesión' }).click();
    const votacion = host.page.getByRole('button', { name: /^Votación/ });
    await votacion.click();
    await expect(votacion).toHaveAttribute('aria-pressed', 'true');

    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida(pages);
    for (const page of pages) await page.getByRole('button', { name: 'Mayor', exact: true }).click({ timeout: 20_000 });
    await host.page.getByRole('button', { name: 'Continuar sesión' }).click({ timeout: 20_000 });

    // Votación: tres cartas, la cuenta atrás y «Confirmar voto» abajo; la clasificación de la sesión en franjas.
    const titulo = (page: Page) => page.getByRole('heading', { name: 'Elige el siguiente minijuego' });
    for (const page of pages) await expect(titulo(page)).toBeVisible({ timeout: 15_000 });
    const opciones = (page: Page) => page.getByRole('list', { name: 'Opciones de voto' }).getByRole('button');
    await expect(opciones(host.page)).toHaveCount(3);
    await expect(host.page.getByRole('timer', { name: /^Para votar/ })).toBeVisible();
    await expect(host.page.getByText('0/2 votos')).toBeVisible();
    await expect(host.page.getByRole('region', { name: 'Clasificación de la sesión' }).getByText(invitado.name)).toBeVisible();
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    await expect(confirmar(host.page)).toBeDisabled();
    await expect(host.page.getByText('Selecciona una opción para preparar tu voto.')).toBeVisible();

    // Fuera del lobby, «Salir» de la placa pide confirmación: «Cancelar» con el foco y la sala sigue igual.
    await host.page.getByRole('button', { name: 'Salir de la sala' }).click();
    const salir = host.page.getByRole('dialog', { name: '¿Salir de la partida?' });
    await expect(salir).toBeVisible();
    await expect(salir.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await expect(salir.getByRole('button', { name: 'Salir', exact: true })).toBeVisible();
    await capture(host.page, 'sesion-salir-confirmacion');
    await salir.getByRole('button', { name: 'Cancelar' }).click();
    await expect(salir).toBeHidden();
    await expect(titulo(host.page)).toBeVisible();

    const nombres = await opciones(host.page).evaluateAll((cartas) => cartas.map((carta) => carta.querySelector('span:nth-child(2)')?.textContent ?? ''));
    const elegido = nombres.find((nombre) => !SIN_DATOS.has(nombre))!;
    const carta = (page: Page) => page.getByRole('list', { name: 'Opciones de voto' }).getByRole('button', { name: new RegExp(`^${elegido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    await carta(host.page).click();
    await expect(carta(host.page)).toHaveAttribute('aria-pressed', 'true');
    await expect(host.page.getByText(`Has elegido ${elegido}`)).toBeVisible();
    await expect(confirmar(host.page)).toBeEnabled();
    await capturarPantalla(host.page, 'sesion-votacion', confirmar(host.page));

    await confirmar(host.page).click();
    await expect(host.page.getByText('Tu voto está registrado.')).toBeVisible();
    await expect(host.page.getByText('1/2 votos')).toBeVisible();

    // El último voto revela: el ganador resaltado con su recuento y la cuenta hasta la partida (3 s). El host captura
    // a 1280 y el invitado a 390 a la vez, para que quepan en el revelado.
    await invitado.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await carta(invitado.page).click();
    await confirmar(invitado.page).click();
    const elegidoTexto = (page: Page) => page.getByText(`La sala ha elegido ${elegido}`);
    for (const page of pages) await expect(elegidoTexto(page)).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByRole('list', { name: 'Opciones de voto' }).getByRole('listitem').filter({ hasText: elegido })).toContainText('Ganador');
    await expect(host.page.getByRole('list', { name: 'Opciones de voto' }).getByRole('listitem').filter({ hasText: elegido })).toContainText('2 votos');
    const medidas = await Promise.all(pages.map((page) => layoutProblems(page, 'sesion-votacion-resultado', true)));
    for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    await invitado.page.setViewportSize({ width: 1280, height: 720 });

    // Empieza el juego votado: lo saltan entre todos y la votación vuelve; desde ella el host termina la sesión.
    await esperarPartida(pages);
    for (const page of pages) await page.getByRole('button', { name: 'Votar para saltar el minijuego' }).click({ timeout: 20_000 });
    await expect(titulo(host.page)).toBeVisible({ timeout: 15_000 });
    await expect(invitado.page.getByRole('button', { name: 'Terminar sesión' })).toHaveCount(0);
    await host.page.getByRole('button', { name: 'Terminar sesión' }).click();

    // Clasificación final: podio en franjas, la evolución por partida y «Volver al lobby» solo para el host.
    // Si nadie sumó puntos (los dos fallan la única ronda) no hay campeón ni insignia «Ganador»: «Sesión sin ganador».
    const final = /^(Campe(ón|ones) de la sesión|Sesión sin ganador)$/;
    for (const page of pages) await expect(page.getByRole('heading', { name: final, level: 1 })).toBeVisible({ timeout: 15_000 });
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion.getByRole('listitem')).toHaveCount(2);
    const sinGanador = (await host.page.getByRole('heading', { name: final, level: 1 }).innerText()) === 'Sesión sin ganador';
    if (sinGanador) await expect(clasificacion.getByText('Ganador', { exact: true })).toHaveCount(0);
    else await expect(clasificacion.getByRole('listitem').first()).toContainText('Ganador');
    await expect(host.page.getByRole('region', { name: 'Evolución de puntos' }).getByRole('columnheader', { name: 'P1' })).toBeVisible();
    await expect(host.page.getByText('1 partida disputada')).toBeVisible();
    await expect(invitado.page.getByRole('button', { name: 'Volver al lobby' })).toHaveCount(0);
    await expect(invitado.page.getByRole('button', { name: 'Terminar', exact: true })).toBeVisible();
    const otra = host.page.getByRole('button', { name: 'Volver al lobby' });
    await capturarPantalla(host.page, 'sesion-resultados', otra);
    await capturarPantalla(invitado.page, 'sesion-resultados-invitado', invitado.page.getByRole('button', { name: 'Terminar', exact: true }));

    // «Terminar» saca de la sala sin preguntar (es la salida de la pantalla): el invitado vuelve a Jugar.
    await invitado.page.getByRole('button', { name: 'Terminar', exact: true }).click();
    await expect(invitado.page).toHaveURL(/\/play$/, { timeout: 15_000 });
    await expect(invitado.page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();
    // «Volver al lobby»: el host vuelve al lobby con la clasificación a cero.
    await otra.click();
    await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeAttached({ timeout: 15_000 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('sesión: modos que se juegan y votación entre los modos de un juego', async ({ browser }) => {
  test.setTimeout(150_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    const pages = jugadores.map((j) => j.page);

    // Solo Higher or Lower, por votación: el «Modo» de sus ajustes pasa a ser «Modos que se juegan».
    await seleccionarJuego(host.page, 'Higher or Lower');
    await host.page.getByRole('tab', { name: 'Modo y sesión' }).click();
    const votacion = host.page.getByRole('button', { name: /^Votación/ });
    await votacion.click();
    await expect(votacion).toHaveAttribute('aria-pressed', 'true');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const modos = host.page.getByRole('group', { name: 'Modos que se juegan' });
    const modo = (nombre: string) => modos.getByRole('button', { name: nombre, exact: true });
    await expect(host.page.getByRole('radiogroup', { name: 'Modo' })).toHaveCount(0);
    await expect(modo('Clásico')).toHaveAttribute('aria-pressed', 'true');
    // El último marcado no se puede quitar.
    await expect(modo('Clásico')).toBeDisabled();
    await modo('Racha infinita').click();
    await expect(modo('Racha infinita')).toHaveAttribute('aria-pressed', 'true');
    await expect(modo('Clásico')).toBeEnabled();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await capturarPantalla(host.page, 'sesion-modos-ajustes', modo('Racha infinita'));

    // La carta del juego dice cuántos modos tiene y cuántos se juegan; el invitado lo ve igual.
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    const cartaHl = (page: Page) => page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').filter({ has: page.getByText('Higher or Lower', { exact: true }) });
    await expect(cartaHl(host.page).getByText('2 modos', { exact: true })).toBeVisible();
    await expect(cartaHl(host.page).getByText('2 modos en juego', { exact: true })).toBeVisible();
    await expect(cartaHl(invitado.page).getByText('2 modos en juego', { exact: true })).toBeVisible();
    await capturarPantalla(host.page, 'sesion-modos-carta', cartaHl(host.page));

    // El invitado (sin permiso) ve los mismos modos marcados, en solo lectura.
    await invitado.page.getByRole('tab', { name: 'Configuración' }).click();
    const modosInvitado = invitado.page.getByRole('group', { name: 'Modos que se juegan' });
    await expect(modosInvitado.getByRole('button', { pressed: true })).toHaveCount(2);
    await expect(modosInvitado.getByRole('button', { name: 'Racha infinita', exact: true })).toBeDisabled();
    await expect(invitado.page.getByRole('radiogroup', { name: 'Modo' })).toHaveCount(0);

    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida(pages);
    for (const page of pages) await page.getByRole('button', { name: 'Mayor', exact: true }).click({ timeout: 20_000 });
    await host.page.getByRole('button', { name: 'Continuar sesión' }).click({ timeout: 20_000 });

    // Un solo juego con dos modos: la votación tiene dos opciones, una por modo.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Elige el siguiente minijuego' })).toBeVisible({ timeout: 15_000 });
    const opciones = (page: Page) => page.getByRole('list', { name: 'Opciones de voto' }).getByRole('button');
    await expect(opciones(host.page)).toHaveCount(2);
    const racha = (page: Page) => opciones(page).filter({ hasText: 'Higher or Lower · Racha infinita' });
    await expect(opciones(host.page).filter({ hasText: 'Higher or Lower · Clásico' })).toHaveCount(1);
    await racha(host.page).click();
    await expect(host.page.getByText('Has elegido Higher or Lower · Racha infinita')).toBeVisible();
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    await capturarPantalla(host.page, 'sesion-votacion-modos', confirmar(host.page));
    await confirmar(host.page).click();
    await racha(invitado.page).click();
    await confirmar(invitado.page).click();
    for (const page of pages) await expect(page.getByText('La sala ha elegido Higher or Lower · Racha infinita')).toBeVisible({ timeout: 10_000 });

    // Arranca Higher or Lower en Racha infinita (la placa lo dice) sin tocar el modo de los ajustes del lobby.
    await expect(host.page.getByRole('button', { name: 'Mayor', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByRole('heading', { name: 'Elige el siguiente minijuego' })).toHaveCount(0);
    await expect(host.page.getByText('Higher or Lower · Racha infinita').first()).toBeVisible();
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('sesión: por orden, cada modo marcado ocupa su turno en la cola', async ({ browser }) => {
  test.setTimeout(150_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    const pages = jugadores.map((j) => j.page);

    // Higher or Lower (una ronda) y después Pokédex Distance, por orden.
    await seleccionarJuego(host.page, 'Higher or Lower');
    await anadirJuegos(host.page, ['Pokédex Distance']);
    await host.page.getByRole('tab', { name: 'Modo y sesión' }).click();
    const orden = host.page.getByRole('button', { name: /^Por orden/ });
    await orden.click();
    await expect(orden).toHaveAttribute('aria-pressed', 'true');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('button', { name: 'Ajustar Higher or Lower' }).click();
    // Por orden también se marcan varios modos: cada uno es un turno de la cola, seguidos.
    const modos = host.page.getByRole('group', { name: 'Modos que se juegan' });
    const modo = (nombre: string) => modos.getByRole('button', { name: nombre, exact: true });
    await expect(host.page.getByRole('radiogroup', { name: 'Modo' })).toHaveCount(0);
    await modo('Racha infinita').click();
    await expect(modo('Racha infinita')).toHaveAttribute('aria-pressed', 'true');
    await expect(modo('Clásico')).toHaveAttribute('aria-pressed', 'true');
    await expect(modos.getByText('Cada modo marcado ocupa su propio turno en la cola')).toBeVisible();
    // Higher or Lower ocupa los turnos 1 y 2 de la lista de ajustes; Pokédex Distance, el 3.
    const elegidos = host.page.getByRole('region', { name: 'Minijuegos elegidos' });
    await expect(elegidos.getByRole('listitem').filter({ hasText: 'Higher or Lower' }).getByText('1–2', { exact: true })).toBeVisible();
    await expect(elegidos.getByRole('listitem').filter({ hasText: 'Pokédex Distance' }).getByText('3', { exact: true })).toBeVisible();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await capturarPantalla(host.page, 'sesion-orden-modos-ajustes', modo('Racha infinita'));

    // La pista de «Modo y sesión» cuenta pares juego y modo.
    await host.page.getByRole('tab', { name: 'Modo y sesión' }).click();
    await expect(host.page.getByText('Se juegan las 3 partidas de minijuego y modo en el orden de la cola y se vuelve a empezar.')).toBeVisible();

    // Las cartas numeran los turnos («1–2» y «3») y dicen cuántos modos se juegan; el invitado lo ve igual.
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    const carta = (page: Page, nombre: string) => page.getByRole('list', { name: 'Minijuegos' }).getByRole('listitem').filter({ has: page.getByText(nombre, { exact: true }) });
    for (const page of pages) {
      await expect(carta(page, 'Higher or Lower').getByText('2 modos en juego', { exact: true })).toBeVisible();
      await expect(carta(page, 'Higher or Lower').getByText('1–2', { exact: true })).toBeVisible();
      await expect(carta(page, 'Pokédex Distance').getByText('3', { exact: true })).toBeVisible();
    }
    await capturarPantalla(host.page, 'sesion-orden-modos-carta', carta(host.page, 'Higher or Lower'));

    // Primero Higher or Lower en Clásico y, al continuar, el mismo juego en Racha infinita (no Pokédex Distance).
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida(pages);
    await expect(host.page.getByText('Higher or Lower · Racha infinita')).toHaveCount(0);
    for (const page of pages) await page.getByRole('button', { name: 'Mayor', exact: true }).click({ timeout: 20_000 });
    await host.page.getByRole('button', { name: 'Continuar sesión' }).click({ timeout: 20_000 });
    await expect(host.page.getByText('Higher or Lower · Racha infinita').first()).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByRole('button', { name: 'Mayor', exact: true })).toBeVisible({ timeout: 20_000 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
