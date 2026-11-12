/**
 * E2E de Pokédex Absurda (`absurd-pokedex`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, terminarSesion, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, juegoEnTrama, sinScorePop, tramasRetenibles, elegirModo, ajustarRango, sinMomento } from '../../src/juegos.js';

/**
 * Pokédex Absurda con tres jugadores y dos partidas seguidas de una ronda (el modo se cambia en el lobby entre ellas).
 * Clásico: los tres escriben (la propia entrada lleva «Tu entrada» y ningún botón), dos votan la entrada del tercero y la
 * revelación enseña al autor con sus puntos. «¿Cuál es la real?»: uno marca la graciosa y pulsa «Es la real»; la revelación
 * enseña «Entrada oficial · …». La página de B retiene la revelación (8 s) para capturarla; escribir y votar se capturan
 * con un jugador pendiente para que la fase no avance sola.
 */
test('pokédex absurda: escribir, votar la más absurda y la real, y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédex Absurda');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 8 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const campo = (page: Page) => page.getByRole('textbox', { name: /^Tu entrada para/ });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const entradas = (page: Page) => page.getByTestId('absurd-entries').locator(':scope > li');
    const entradaDe = (page: Page, autor: Jugador) => entradas(page).filter({ hasText: `Entrada de ${autor.name}` });
    const escribir = async (jugador: Jugador, enviar = true) => {
      await expect(campo(jugador.page)).toBeVisible({ timeout: 20_000 });
      await campo(jugador.page).fill(`Entrada de ${jugador.name}: duerme dentro de un microondas y nadie sabe por qué.`);
      if (enviar) await jugador.page.getByTestId('absurd-send').click();
    };
    const paginas = jugadores.map((j) => j.page);

    // Clásico: la región viva es una sola y la ficha del Pokémon sale en las tres páginas.
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);
    for (const jugador of jugadores) await expect(jugador.page.getByRole('heading', { name: 'Escribe su entrada de Pokédex', level: 1 })).toBeVisible({ timeout: 20_000 });
    await escribir(a);
    await escribir(b);
    await expect(a.page.getByText('Entrada enviada').first()).toBeVisible({ timeout: 10_000 });
    // El host escribe pero no envía: la fase sigue y se captura con A y B listos.
    await escribir(host, false);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-absurd-pokedex-escribir', { sigue: campo(host.page) });
    await host.page.getByTestId('absurd-send').click();

    // Votación: el DOM anónimo no trae autores; la entrada propia no tiene botón y las ajenas, uno solo.
    for (const jugador of jugadores) await expect(entradas(jugador.page)).toHaveCount(3, { timeout: 20_000 });
    for (const jugador of jugadores) {
      const propia = entradaDe(jugador.page, jugador);
      await expect(propia.getByText('Tu entrada')).toBeVisible();
      await expect(propia.getByRole('button')).toHaveCount(0);
      for (const otro of jugadores.filter((j) => j !== jugador)) await expect(entradaDe(jugador.page, otro).getByRole('button', { name: 'La más absurda' })).toBeVisible();
    }
    // A y B votan la del host; con el host sin votar, la fase sigue y se captura en su página.
    await entradaDe(a.page, host).getByRole('button', { name: 'La más absurda' }).click();
    await expect(a.page.getByText('Voto enviado').first()).toBeVisible({ timeout: 10_000 });
    await entradaDe(b.page, host).getByRole('button', { name: 'La más absurda' }).click();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-absurd-pokedex-votar', { sigue: entradaDe(host.page, a).getByRole('button', { name: 'La más absurda' }) });
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'absurd-pokedex')?.phase === 'ROUND_RESULTS');
    await entradaDe(host.page, a).getByRole('button', { name: 'La más absurda' }).click();

    // Revelación (retenida en B): el autor con sus votos y puntos, y los demás ven lo mismo.
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    const revelada = b.page.getByRole('region', { name: 'Entradas reveladas' });
    const entradaGanadora = revelada.getByRole('listitem').filter({ hasText: `Entrada de ${host.name}` });
    await expect(entradaGanadora).toContainText(host.name);
    await expect(entradaGanadora).toContainText('2 votos');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('+4');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Ganó');
    await expect(viva(b.page)).toHaveCount(1);
    // Sin el cut-in del ganador (1,4 s): la captura muestra la revelación.
    await sinMomento(b.page);
    await capturarTamanos(b.page, 'juego-absurd-pokedex-revelacion', { sigue: revelada });
    retenedor.soltar();

    // Resultados de la partida y vuelta al lobby (Continuar → clasificación de la sesión → Volver al lobby).
    await expect(host.page.getByRole('heading', { name: 'Las entradas más absurdas', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('+1 por cada voto y +2 a la más votada.')).toBeVisible();
    await terminarSesion(host.page);
    await host.page.getByRole('button', { name: 'Volver al lobby' }).click({ timeout: 15_000 });
    await expect(host.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeAttached({ timeout: 15_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });

    // Segunda partida: solo «¿Cuál es la real?».
    await seleccionarJuego(host.page, 'Pokédex Absurda');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await expect(host.page.getByRole('slider', { name: 'Número de rondas' })).toBeVisible();
    await elegirModo(host.page, '¿Cuál es la real?');
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(paginas);
    for (const jugador of jugadores) await escribir(jugador);
    for (const jugador of jugadores) await expect(entradas(jugador.page)).toHaveCount(4, { timeout: 20_000 });
    // Una de las cuatro es la oficial: el DOM no dice cuál. Dos botones por entrada ajena y ninguno en la propia.
    for (const jugador of jugadores) {
      await expect(entradaDe(jugador.page, jugador).getByRole('button')).toHaveCount(0);
      await expect(entradaDe(jugador.page, jugador).getByText('Tu entrada')).toBeVisible();
      await expect(jugador.page.getByRole('button', { name: 'Es la real' })).toHaveCount(3);
      await expect(jugador.page.getByRole('button', { name: '😂 La más graciosa' })).toHaveCount(3);
      await expect(jugador.page.getByText(/Entrada oficial/)).toHaveCount(0);
    }
    // A marca la graciosa de B (conmutador) y vota la del host como la real; B y el host votan sin graciosa.
    const graciosa = entradaDe(a.page, b).getByRole('button', { name: /La más graciosa/ });
    await graciosa.click();
    await expect(graciosa).toHaveAttribute('aria-pressed', 'true');
    await entradaDe(a.page, host).getByRole('button', { name: 'Es la real' }).click();
    await expect(a.page.getByText('Voto enviado').first()).toBeVisible({ timeout: 10_000 });
    await expect(entradaDe(a.page, b).getByText('😂 Tu graciosa')).toBeVisible();
    await entradaDe(b.page, a).getByRole('button', { name: 'Es la real' }).click();
    // Captura de la papeleta con el host pendiente, con la graciosa de A marcada en su página.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    const graciosaHost = entradaDe(host.page, a).getByRole('button', { name: /La más graciosa/ });
    await graciosaHost.click();
    await expect(graciosaHost).toHaveAttribute('aria-pressed', 'true');
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'absurd-pokedex')?.phase === 'ROUND_RESULTS');
    await entradaDe(host.page, a).getByRole('button', { name: 'Es la real' }).click();

    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    const reveladaReal = b.page.getByRole('region', { name: 'Entradas reveladas' });
    await expect(reveladaReal.getByText(/^Entrada oficial · /)).toHaveCount(1);
    await expect(reveladaReal.getByRole('listitem')).toHaveCount(4);
    await expect(reveladaReal.getByText(/^😂 \d+$/).first()).toBeVisible();
    await expect(b.page.getByText('¿Cuál es la real?', { exact: true }).first()).toBeVisible();
    await capturarTamanos(b.page, 'juego-absurd-pokedex-real', { sigue: reveladaReal });
    retenedor.soltar();

    await expect(host.page.getByRole('heading', { name: 'Las entradas más absurdas', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText('Mejor ojo')).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-absurd-pokedex-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
