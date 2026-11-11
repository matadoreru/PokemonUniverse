/**
 * E2E de La Frase Pokémon (`pokemon-red-flag`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, capturarAnotando, sinScorePop, textoDeMain } from '../../src/juegos.js';

/**
 * Pokémon Red Flag con tres jugadores y una ronda, con un empate forzado: el host y A se votan entre sí y B no vota, así
 * que al agotarse los 45 s de la votación hay segunda vuelta solo entre las respuestas del host y de A. En ella A gana
 * 2–1. Se comprueban el anonimato (ni autores ni textos ajenos antes de su fase, también tras recargar), el campo con su
 * contador y «Bloquear respuesta» a la vista a 390×844 con el campo enfocado, una respuesta larga que se parte sin
 * romper las filas, la región viva única y el recuento con los autores y sus dos vueltas.
 */
test('pokemon-red-flag: escribir, votar anónimo con empate, segunda vuelta, revelación y clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'La Frase Pokémon');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Número de rondas', ['Home'], '1'], ['Tiempo por fase', ['Home', ...Array<string>(30).fill('ArrowRight')], '45']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await expect(host.page.getByRole('radio', { name: 'Lo peor' })).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    // Una respuesta de 100 caracteres con una palabra muy larga: se parte sin romper la carta ni la franja.
    const textos = new Map<Jugador, string>([
      [host, `Siempre pide la cuenta a medias y luego dice que se dejó la cartera ${sala.code}`],
      [a, `Colecciona 300 calcetines desparejados supercalifragilisticoespialidosamenteapestosos ${sala.code}`.slice(0, 100)],
      [b, `Ronca como un Snorlax en la primera cita ${sala.code}`],
    ]);
    const nombres = jugadores.map((j) => j.name);
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const campo = (page: Page) => page.getByRole('textbox', { name: /^Tu frase para / });
    const enviar = (page: Page) => page.getByTestId('red-flag-send');
    const papeleta = (page: Page) => page.getByTestId('ballot-options');
    const confirmar = (page: Page) => page.getByTestId('ballot-confirm');
    const opcion = (page: Page, autor: Jugador) => papeleta(page).locator('[data-ballot-option]').filter({ hasText: textos.get(autor)! }).getByRole('button');
    const escribir = async (jugador: Jugador) => {
      await campo(jugador.page).fill(textos.get(jugador)!);
      await enviar(jugador.page).click();
      await expect(jugador.page.getByRole('heading', { name: 'Respuesta bloqueada' })).toBeVisible({ timeout: 5_000 });
    };
    const sinVotosAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin recuentos ni quién votó a quién`).not.toMatch(/\b\d+ votos?\b|Votos de|Primera vuelta|ganadora|Autores revelados/);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };
    /** La papeleta es anónima: ningún nombre de jugador ni imagen dentro de las opciones. */
    const anonima = async (page: Page, fase: string) => {
      const texto = await papeleta(page).evaluate((el) => [(el as HTMLElement).innerText, ...[...el.querySelectorAll('[alt], [title], [aria-label]')].map((n) => `${n.getAttribute('alt') ?? ''} ${n.getAttribute('title') ?? ''} ${n.getAttribute('aria-label') ?? ''}`)].join('\n'));
      for (const nombre of nombres) expect(texto, `${fase}: la papeleta no dice que ${nombre} escribió nada`).not.toContain(nombre);
      await expect(papeleta(page).locator('img')).toHaveCount(0);
    };

    // Escribir: A envía primero; el host ve que A está listo, pero no qué escribió.
    await expect(titulo(host.page)).toHaveText('Escribe su peor frase', { timeout: 20_000 });
    await expect(host.page.getByTestId('social-prompt')).toContainText('¿Qué detalle negativo de');
    await expect(host.page.getByText('0 / 100')).toBeVisible();
    await escribir(a);
    await expect(a.page.getByText(textos.get(a)!)).toBeVisible();
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Listo');
    expect(await textoDeMain(host.page), 'escribir: sin la respuesta de A').not.toContain(textos.get(a)!);
    await campo(host.page).fill(textos.get(host)!);
    await expect(host.page.getByText(`${textos.get(host)!.length} / 100`)).toBeVisible();
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(host.page, 'juego-pokemon-red-flag-escribir', { sigue: titulo(host.page).filter({ hasText: 'Escribe su peor frase' }) });
    // A 390×844 con el campo enfocado (como con el teclado abierto): el campo y «Bloquear respuesta» siguen a la vista.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await campo(b.page).focus();
    await expect(campo(b.page)).toBeFocused();
    await expect(campo(b.page)).toBeInViewport({ ratio: 1 });
    await campo(b.page).fill(textos.get(b)!);
    await expect(enviar(b.page)).toBeInViewport({ ratio: 1 });
    await expect(b.page.getByText(`${textos.get(b)!.length} / 100`)).toBeInViewport();
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await enviar(host.page).click();
    await enviar(b.page).click();

    // Votar: el host vota la de A y A la del host; B no vota (la votación termina en empate por tiempo).
    await expect(titulo(b.page)).toHaveText('Votación', { timeout: 15_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    for (const jugador of jugadores) await anonima(jugador.page, `votación (${jugador.name})`);
    await expect(papeleta(b.page).getByText('Tu respuesta')).toHaveCount(1);
    await opcion(host.page, a).click();
    await expect(opcion(host.page, a)).toHaveAttribute('aria-pressed', 'true');
    await confirmar(host.page).click();
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeFocused({ timeout: 5_000 });
    // Recargar con el voto bloqueado: el servidor lo devuelve y sigue sin autores ni votos ajenos.
    await host.page.reload();
    await host.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await anonima(host.page, 'votación tras recargar');
    await sinVotosAjenos(host.page, 'votación tras recargar');
    await opcion(a.page, host).click();
    await confirmar(a.page).click();
    await expect(a.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Listo');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Votando…');
    await sinVotosAjenos(b.page, 'votación');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-pokemon-red-flag-votacion', { sigue: titulo(b.page).filter({ hasText: 'Votación' }) });
    // A 390×844 sin desplazar: la fase, la consigna, el plazo y la confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.getByTestId('social-prompt'), b.page.getByRole('timer'), b.page.locator('[aria-current="step"]')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, consigna y plazo a la vista y sin tapar').toBe(true);
    }
    await expect(papeleta(b.page).locator('[data-ballot-option]').first()).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Segunda vuelta solo entre las del host y A (empate 1–1): B ve dos opciones, ninguna suya.
    await expect(titulo(b.page)).toHaveText('Segunda vuelta', { timeout: 60_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(2);
    await expect(opcion(b.page, a)).toBeVisible();
    await expect(opcion(b.page, host)).toBeVisible();
    await expect(papeleta(b.page).getByText(textos.get(b)!)).toHaveCount(0);
    await anonima(b.page, 'segunda vuelta');
    await sinVotosAjenos(b.page, 'segunda vuelta');
    await capturarTamanos(b.page, 'juego-pokemon-red-flag-segunda-vuelta', { sigue: titulo(b.page).filter({ hasText: 'Segunda vuelta' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });
    await opcion(b.page, a).click();
    await confirmar(b.page).click();
    await expect(b.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    await opcion(host.page, a).click();
    await confirmar(host.page).click();
    await opcion(a.page, host).click();
    await confirmar(a.page).click();

    // Revelación: gana la de A con 2 votos tras la segunda vuelta; ahora sí, con los autores.
    await expect(titulo(host.page)).toHaveText('La frase de la ronda', { timeout: 15_000 });
    await expect(host.page.getByTestId('tally-summary')).toHaveText(`Gana ${a.name} con 2 votos tras la segunda vuelta.`);
    await expect(host.page.locator('[data-tally-round]').first()).toHaveAttribute('data-tally-round', '2');
    await expect(host.page.locator('[data-tally-round="2"]').getByTestId('tally-row')).toHaveCount(2);
    await expect(host.page.getByTestId('tally-row').filter({ hasText: 'Frase ganadora' })).toContainText(textos.get(a)!);
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarAnotando(host.page, 'juego-pokemon-red-flag-revelacion', titulo(host.page).filter({ hasText: 'La frase de la ronda' }));

    await expect(host.page.getByRole('heading', { name: 'Las frases más votadas' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^1 victoria · 1 en solitario · 0 compartidas · 2 votos recibidos · 1\/1 respuestas$/)).toHaveCount(1);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-red-flag-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
