/**
 * E2E de Most Likely To (`most-likely-to`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, elegirPokemon, capturarAnotando, sinScorePop, textoDeMain } from '../../src/juegos.js';

/**
 * Most Likely To con tres jugadores y una ronda, con un empate forzado: el host y A se votan entre sí y B no vota, así
 * que al agotarse los 45 s de la votación hay segunda vuelta solo entre el host y A. En ella A gana 2–1. Se comprueban
 * el secreto de las respuestas y los votos hasta la revelación (también tras recargar con el voto bloqueado), la
 * papeleta y su confirmación a la vista a 390×844, la región viva única y el recuento con sus dos vueltas.
 */
test('most-likely-to: elegir, votar con empate, segunda vuelta, revelación y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Most Likely To');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Número de rondas', ['Home'], '1'], ['Tiempo para votar', ['Home', ...Array<string>(30).fill('ArrowRight')], '45']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const papeleta = (page: Page) => page.getByTestId('ballot-options');
    const confirmar = (page: Page) => page.getByTestId('ballot-confirm');
    const opcion = (page: Page, pokemon: string, autor: Jugador) => page.getByRole('button', { name: `${pokemon}, respuesta de ${autor.name}` });
    const sinVotosAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin recuentos ni quién votó a quién`).not.toMatch(/\b\d+ votos?\b|Votos de|Primera vuelta|Ganadora/);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };

    // Elegir: A responde primero; el host ve que A ha respondido, pero no qué.
    await expect(titulo(host.page)).toHaveText('Elige tu respuesta', { timeout: 20_000 });
    await expect(host.page.getByTestId('social-prompt')).toBeVisible();
    await elegirPokemon(a.page, 'Pikachu');
    await expect(a.page.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
    // La respuesta guardada se dice en texto también a 390 (allí la placa del buscador no lleva kicker).
    await a.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await expect(a.page.getByText('Guardada', { exact: true })).toBeVisible();
    await a.page.setViewportSize({ width: 1280, height: 720 });
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Respondió');
    expect(await textoDeMain(host.page), 'elegir: sin la respuesta de A').not.toContain('Pikachu');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'juego-most-likely-to-elegir', { sigue: titulo(host.page).filter({ hasText: 'Elige tu respuesta' }) });
    await elegirPokemon(host.page, 'Bulbasaur');
    await elegirPokemon(b.page, 'Charmander');

    // Votar: el host vota a A y A al host; B no vota (la votación termina en empate por tiempo).
    await expect(titulo(b.page)).toHaveText('Votación', { timeout: 15_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    await opcion(host.page, 'Pikachu', a).click();
    await expect(opcion(host.page, 'Pikachu', a)).toHaveAttribute('aria-pressed', 'true');
    await confirmar(host.page).click();
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeFocused({ timeout: 5_000 });
    // Recargar con el voto bloqueado: el servidor lo devuelve y sigue sin haber votos ajenos.
    // La app ofrece «Volver a la sala» y vuelve antes de que venza la gracia de 8 s.
    await host.page.reload();
    await host.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await expect(opcion(host.page, 'Pikachu', a)).toHaveCount(0);
    await sinVotosAjenos(host.page, 'votación tras recargar');
    await opcion(a.page, 'Bulbasaur', host).click();
    await confirmar(a.page).click();
    await expect(a.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Votó');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Pendiente');
    await sinVotosAjenos(b.page, 'votación');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-most-likely-to-votacion', { sigue: titulo(b.page).filter({ hasText: 'Votación' }) });
    // A 390×844 sin desplazar: la pregunta, el plazo, la papeleta y su confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.getByTestId('social-prompt'), b.page.getByRole('timer'), b.page.locator('[aria-current="step"]')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, pregunta y plazo a la vista y sin tapar').toBe(true);
    }
    for (const carta of await papeleta(b.page).locator('[data-ballot-option]').all()) await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Segunda vuelta solo entre el host y A (empate 1–1): B ve dos opciones, ninguna suya.
    await expect(titulo(b.page)).toHaveText('Segunda vuelta', { timeout: 60_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(2);
    await expect(opcion(b.page, 'Pikachu', a)).toBeVisible();
    await expect(opcion(b.page, 'Bulbasaur', host)).toBeVisible();
    await expect(b.page.getByText('Charmander', { exact: true })).toHaveCount(0);
    await sinVotosAjenos(b.page, 'segunda vuelta');
    await capturarTamanos(b.page, 'juego-most-likely-to-segunda-vuelta', { sigue: titulo(b.page).filter({ hasText: 'Segunda vuelta' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    for (const carta of await papeleta(b.page).locator('[data-ballot-option]').all()) await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await opcion(b.page, 'Pikachu', a).click();
    await confirmar(b.page).click();
    await expect(b.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    // Recargar en la segunda vuelta con el voto bloqueado: vuelve bloqueado y sin votos de la primera vuelta ni ajenos.
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await expect(titulo(b.page)).toHaveText('Segunda vuelta');
    await sinVotosAjenos(b.page, 'segunda vuelta tras recargar');
    await opcion(host.page, 'Pikachu', a).click();
    await confirmar(host.page).click();
    await opcion(a.page, 'Bulbasaur', host).click();
    await confirmar(a.page).click();

    // Revelación: gana Pikachu de A con 2 votos tras la segunda vuelta; las dos vueltas a la vista, primero la que decide.
    await expect(titulo(host.page)).toHaveText('La respuesta favorita', { timeout: 15_000 });
    await expect(host.page.getByTestId('tally-summary')).toHaveText(`Gana Pikachu de ${a.name} con 2 votos tras la segunda vuelta.`);
    await expect(host.page.getByRole('heading', { name: 'Primera vuelta' })).toBeVisible();
    await expect(host.page.locator('[data-tally-round]').first()).toHaveAttribute('data-tally-round', '2');
    await expect(host.page.locator('[data-tally-round="2"]').getByTestId('tally-row')).toHaveCount(2);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Ganadora' })).toContainText(`Votos de`);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Ganadora' }).getByTestId('tally-voter')).toHaveCount(2);
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarAnotando(host.page, 'juego-most-likely-to-revelacion', titulo(host.page).filter({ hasText: 'La respuesta favorita' }));

    await expect(host.page.getByRole('heading', { name: 'Las respuestas favoritas' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 victoria · 1 en solitario · 0 compartidas · 2 votos recibidos · 1\/1 respuestas$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-most-likely-to-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
