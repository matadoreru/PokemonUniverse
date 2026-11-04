/**
 * Votación del siguiente minijuego y resultados de la sesión (`frontend/src/room/NextGameVote.tsx`,
 * `SessionResults.tsx`) contra el `/ws` de Java (`npm run test:e2e -- sesion`): una partida de Higher or Lower de una
 * ronda con la rotación por votación, la votación, el revelado del ganador y la clasificación final.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { capture, crearSalaConJugadores, iniciarPartida, layoutProblems, saltarIntro, seleccionarJuego, SIZES, type Jugador } from '../src/helpers.js';

/** Captura a los tres tamaños de revisión: sin scroll de página ni de `main` en escritorio y texto de 13 px o más. */
async function capturarPantalla(page: Page, nombre: string, sigue: Locator): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    const { id, problems } = await layoutProblems(page, nombre, true);
    await expect(sigue, `${id}: la fase sigue en pantalla`).toBeVisible({ timeout: 1_000 });
    expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** Juegos que necesitan datos que la BD local puede no tener (los `UNAVAILABLE` de `juegos.spec.ts`): no se votan. */
const registry = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/games/registry.json', import.meta.url), 'utf8')) as { id: string; name: string }[];
const SIN_DATOS = new Set(registry.filter((game) => ['tcg-higher-lower', 'pokemon-palette-guess'].includes(game.id)).map((game) => game.name));

test('sesión: votación del siguiente juego y clasificación final', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    const pages = jugadores.map((j) => j.page);

    // Higher or Lower a una ronda y rotación por votación.
    await seleccionarJuego(host.page, 'Higher or Lower');
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
    await saltarIntro(pages);
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

    // Empieza el juego votado: se salta entre todos y la votación vuelve; desde ella el host termina la sesión.
    await saltarIntro(pages);
    for (const page of pages) await page.getByRole('button', { name: 'Votar para saltar el minijuego' }).click({ timeout: 20_000 });
    await expect(titulo(host.page)).toBeVisible({ timeout: 15_000 });
    await expect(invitado.page.getByRole('button', { name: 'Terminar sesión' })).toHaveCount(0);
    await host.page.getByRole('button', { name: 'Terminar sesión' }).click();

    // Clasificación final: podio en franjas, la evolución por partida y «Otra partida» solo para el host.
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
    await expect(invitado.page.getByRole('button', { name: 'Otra partida' })).toHaveCount(0);
    await expect(invitado.page.getByRole('button', { name: 'Terminar', exact: true })).toBeVisible();
    const otra = host.page.getByRole('button', { name: 'Otra partida' });
    await capturarPantalla(host.page, 'sesion-resultados', otra);
    await capturarPantalla(invitado.page, 'sesion-resultados-invitado', invitado.page.getByRole('button', { name: 'Terminar', exact: true }));

    // «Terminar» saca de la sala sin preguntar (es la salida de la pantalla): el invitado vuelve a Jugar.
    await invitado.page.getByRole('button', { name: 'Terminar', exact: true }).click();
    await expect(invitado.page).toHaveURL(/\/play$/, { timeout: 15_000 });
    await expect(invitado.page.getByRole('heading', { name: 'Entrar en partida' })).toBeVisible();
    // «Otra partida»: el host vuelve al lobby con la clasificación a cero.
    await otra.click();
    await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeAttached({ timeout: 15_000 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
