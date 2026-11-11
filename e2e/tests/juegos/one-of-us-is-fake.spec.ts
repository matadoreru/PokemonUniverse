/**
 * E2E de One of Us Is Fake (`one-of-us-is-fake`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, elegirPokemon, juegoEnTrama, sinScorePop, textoDeMain, tramasRetenibles } from '../../src/juegos.js';

/** Lo que el test lee del estado público de One of Us Is Fake. */
interface FakeVisible {
  phase: string;
  revealedChoices: Array<{ playerId: string }>;
}

/**
 * One of Us Is Fake con tres jugadores y una ronda. Cada página ve solo su categoría: la que difiere es la del fake (la
 * suya no está en el DOM de los demás, ni la de ellos en el suyo). En el debate votan en círculo (empate a 1 entre los
 * tres): hay segunda vuelta con todos; en ella los dos normales votan al fake y sale con 2 votos. Para las capturas de
 * la revelación de elecciones y del resultado (fases cortas), la página de B retiene las tramas del servidor. Se
 * comprueban el secreto de los votos (también tras recargar), el foco en «Voto bloqueado», la papeleta y la fase a la
 * vista a 390×844, la región viva única, el recuento con sus dos vueltas y la clasificación.
 */
test('one-of-us-is-fake: categoría secreta, revelación, debate con empate, segunda vuelta, el fake y clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [a, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'One of Us Is Fake');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const rondas = host.page.getByRole('slider', { name: 'Número de rondas' });
    await rondas.focus();
    await rondas.press('Home');
    await rondas.blur();
    await expect(rondas).toHaveValue('1');
    await expect(host.page.getByRole('switch', { name: 'El fake sabe que es fake' })).not.toBeChecked();
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (para congelar las fases cortas) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const papeleta = (page: Page) => page.getByTestId('ballot-options');
    const confirmar = (page: Page) => page.getByTestId('ballot-confirm');
    /** Vota y confirma; salvo el último voto de la vuelta (que la cierra al instante), espera a «Voto bloqueado». */
    const votar = async (votante: Jugador, objetivo: Jugador, ultimo = false) => {
      await papeleta(votante.page).getByRole('button', { name: objetivo.name, exact: true }).click();
      await confirmar(votante.page).click();
      if (!ultimo) await expect(votante.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 5_000 });
    };
    const sinVotosAjenos = async (page: Page, fase: string) => {
      const texto = await textoDeMain(page);
      expect(texto, `${fase}: sin recuentos ni quién votó a quién`).not.toMatch(/\b\d+ votos?\b|Votos de|Primera vuelta|Más votado|El fake era/);
      await expect(page.getByTestId('tally-row')).toHaveCount(0);
    };

    // Elegir: cada página lee su categoría; la que difiere es la del fake (sin «El fake sabe», nadie lo dice).
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('Elige tu Pokémon', { timeout: 20_000 });
    const categorias = new Map<Jugador, string>();
    for (const jugador of jugadores) categorias.set(jugador, (await jugador.page.getByTestId('social-prompt').innerText()).trim());
    const fake = jugadores.find((j) => jugadores.filter((otro) => categorias.get(otro) === categorias.get(j)).length === 1);
    expect(fake, `una categoría distinta: ${[...categorias.values()].join(' | ')}`).toBeDefined();
    const normales = jugadores.filter((j) => j !== fake);
    const variante = categorias.get(fake!)!;
    const principal = categorias.get(normales[0]!)!;
    expect(categorias.get(normales[1]!)).toBe(principal);
    for (const { page } of normales) expect(await page.content(), 'la categoría del fake no está en el DOM de un normal').not.toContain(variante);
    expect(await fake!.page.content(), 'la categoría del grupo no está en el DOM del fake').not.toContain(principal);
    for (const { page } of jugadores) await expect(page.getByText('Eres el fake')).toHaveCount(0);
    await elegirPokemon(a.page, 'Pikachu');
    await expect(a.page.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
    await expect(host.page.getByTestId('social-progress-row').filter({ hasText: a.name })).toContainText('Eligió');
    expect(await textoDeMain(host.page), 'elegir: sin la elección de A').not.toContain('Pikachu');
    await expect(host.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(fake!.page, 'juego-one-of-us-is-fake-elegir', { sigue: titulo(fake!.page).filter({ hasText: 'Elige tu Pokémon' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const objetivo of [b.page.getByTestId('social-prompt'), b.page.getByRole('textbox', { name: 'Buscar Pokémon para tu categoría' })]) await expect(objetivo).toBeInViewport();
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Revelación: B retiene las tramas desde que hay dos de tres elecciones a la vista.
    await elegirPokemon(b.page, 'Charmander');
    retenedor.retenerDesde((payload) => {
      const estado = juegoEnTrama<FakeVisible>(payload, 'one-of-us-is-fake');
      return estado?.phase === 'CHOICE_REVEAL' && estado.revealedChoices.length >= 2;
    });
    await elegirPokemon(host.page, 'Bulbasaur');
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText('Las elecciones');
    await expect(b.page.getByText('Elecciones reveladas: 2 de 3')).toBeVisible();
    await expect(b.page.getByTestId('fake-choices').getByText('Por revelar')).toHaveCount(1);
    await sinVotosAjenos(b.page, 'revelación');
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-revelar-elecciones', { sigue: titulo(b.page).filter({ hasText: 'Las elecciones' }) });
    retenedor.soltar();

    // Debate: las tres elecciones en cartas y la papeleta con los otros dos (la propia, fija).
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('¿Quién es el fake?', { timeout: 15_000 });
    for (const [jugador, pokemon] of [[host, 'Bulbasaur'], [a, 'Pikachu'], [b, 'Charmander']] as const) await expect(b.page.getByTestId('fake-choices').getByRole('listitem').filter({ hasText: jugador.name })).toContainText(pokemon);
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    await expect(papeleta(b.page).getByText('Eres tú')).toHaveCount(1);
    await expect(b.page.getByTestId('fake-category')).toContainText(categorias.get(b)!);
    await sinVotosAjenos(b.page, 'debate');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-debate', { sigue: titulo(b.page).filter({ hasText: '¿Quién es el fake?' }) });
    // A 390×844 sin desplazar: la fase, el plazo, la categoría, la papeleta y su confirmación.
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await b.page.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [b.page.locator('[aria-current="step"]'), b.page.getByRole('timer'), b.page.getByTestId('fake-category')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase, plazo y categoría a la vista y sin tapar').toBe(true);
    }
    for (const carta of await papeleta(b.page).locator('[data-ballot-option]').all()) await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });

    // Votación en círculo (host → A → B → host): el host vota, el foco va a «Voto bloqueado» y recarga.
    await papeleta(host.page).getByRole('button', { name: a.name, exact: true }).click();
    await confirmar(host.page).click();
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeFocused({ timeout: 5_000 });
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: host.name })).toContainText('Votó');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: b.name })).toContainText('Votando…');
    await capturarTamanos(host.page, 'juego-one-of-us-is-fake-votacion', { sigue: host.page.getByRole('heading', { name: 'Voto bloqueado' }) });
    await host.page.reload();
    await host.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(host.page.getByRole('heading', { name: 'Voto bloqueado' })).toBeVisible({ timeout: 15_000 });
    await sinVotosAjenos(host.page, 'debate tras recargar');
    await votar(a, b);
    await votar(b, host, true);

    // Segunda vuelta con los tres (empate a 1): los normales votan al fake y el fake a un normal.
    for (const { page } of jugadores) await expect(titulo(page)).toHaveText('Segunda vuelta', { timeout: 15_000 });
    await expect(papeleta(b.page).locator('[data-ballot-option]')).toHaveCount(3);
    await expect(b.page.locator('[data-phase="revote"]')).toHaveAttribute('aria-current', 'step');
    await sinVotosAjenos(b.page, 'segunda vuelta');
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-segunda-vuelta', { sigue: titulo(b.page).filter({ hasText: 'Segunda vuelta' }) });
    await b.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await expect(confirmar(b.page)).toBeInViewport({ ratio: 1 });
    await b.page.setViewportSize({ width: 1280, height: 720 });
    // B retiene el resultado de la ronda (6 s) para capturarlo.
    retenedor.retenerDesde((payload) => juegoEnTrama<FakeVisible>(payload, 'one-of-us-is-fake')?.phase === 'ROUND_RESULTS');
    for (const normal of normales) await votar(normal, fake!);
    await votar(fake!, normales[0]!, true);

    // Resultado: sale el fake con 2 votos tras la segunda vuelta; el fake y las dos categorías, a la vista.
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText('Ganan los normales', { timeout: 5_000 });
    await expect(b.page.getByTestId('fake-player')).toHaveText(fake!.name);
    await expect(b.page.getByTestId('tally-summary')).toHaveText(`Sale ${fake!.name} con 2 votos tras la segunda vuelta. ${fake!.name} era el fake.`);
    await expect(b.page.getByText(variante, { exact: true })).toBeVisible();
    await expect(b.page.getByText(principal, { exact: true })).toBeVisible();
    await expect(b.page.locator('[data-tally-round]').first()).toHaveAttribute('data-tally-round', '2');
    await expect(b.page.getByTestId('tally-row').filter({ hasText: 'Más votado' })).toContainText('Votos de');
    await expect(b.page.getByTestId('tally-row').filter({ hasText: 'Más votado' })).toContainText('Fake');
    await expect(b.page.getByTestId('social-screen').locator('[aria-live]')).toHaveCount(1);
    await capturarTamanos(b.page, 'juego-one-of-us-is-fake-revelacion', { sigue: titulo(b.page).filter({ hasText: 'Ganan los normales' }) });
    retenedor.soltar();

    // Clasificación: el fake, descubierto, sin votos correctos (no puede votarse) y sin puntos.
    await expect(host.page.getByRole('heading', { name: 'Una partida de sospechas' })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^0 victorias como normal · 0 como fake · 0 votos correctos · fake 1 vez · 1 descubierto$/)).toHaveCount(1);
    await expect(host.page.getByText(/^1 victoria como normal · 0 como fake · [12] votos? correctos? · fake 0 veces · 0 descubiertos$/)).toHaveCount(2);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-one-of-us-is-fake-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
