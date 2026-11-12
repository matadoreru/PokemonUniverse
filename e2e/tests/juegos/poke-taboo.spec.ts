/**
 * E2E de PokéTaboo (`poke-taboo`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, sinTapar, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, primeraVisible, buscadorRespuesta, adivinar, juegoEnTrama, sinScorePop, tramasRetenibles, comoPalabra, sinMomento } from '../../src/juegos.js';

/**
 * PokéTaboo con tres jugadores y una vuelta (tres turnos: uno por jugador). En el primero, quien describe (la página que
 * pinta el secreto) lee su Pokémon y sus palabras prohibidas; el campo no deja enviar una pista con el nombre y lo dice;
 * envía dos pistas (con Intro y con la píldora, el foco vuelve al campo). El secreto no está en el DOM de los demás. Uno
 * de los que adivinan falla una vez y luego acierta; la revelación (4 s) se retiene en la página de B para las capturas.
 * Los otros dos turnos se resuelven acertando a la primera. Se capturan quien describe, quien adivina, la lista de
 * pistas, la revelación y la clasificación a los tres tamaños, con el campo y «Enviar pista» a la vista a 390×844.
 */
test('poke-taboo: secreto con palabras prohibidas, pistas, un fallo, el acierto, la revelación y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [, b] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'PokéTaboo');
    // Ajustes del catálogo: 120 s por turno (los cinco tiempos del motor), una vuelta y las formas regionales.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await host.page.getByRole('radio', { name: '120 s' }).click();
    await expect(host.page.getByRole('radio', { name: '120 s' })).toHaveAttribute('aria-checked', 'true');
    await expect(host.page.getByRole('slider', { name: 'Vueltas' })).toHaveValue('1');
    await expect(host.page.getByRole('switch', { name: 'Formas regionales' })).toBeVisible();
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      await host.page.getByRole('slider', { name: 'Vueltas' }).scrollIntoViewIfNeeded();
      const { id, problems } = await layoutProblems(host.page, 'lobby-poke-taboo-ajustes', true);
      expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // B pasa su `/ws` por el retenedor (la revelación dura 4 s) y vuelve a la sala.
    const retenedor = await tramasRetenibles(b.page);
    await b.page.reload();
    await b.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(b.page.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible({ timeout: 15_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const paginas = jugadores.map((j) => j.page);
    const nombreDe = (page: Page) => jugadores.find((j) => j.page === page)!.name;
    const titulo = (page: Page) => page.getByRole('heading', { level: 1 });
    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const secretoEn = (page: Page) => page.getByTestId('taboo-secret');
    const campo = (page: Page) => page.getByRole('textbox', { name: 'Pista para los que adivinan' });
    const enviar = (page: Page) => page.getByTestId('taboo-hint-send');
    const pistas = (page: Page) => page.getByTestId('taboo-hint');
    /** Quien describe el turno `n`: la única página que pinta el secreto con esa insignia. */
    const turno = async (n: number) => {
      for (const page of paginas) await expect(page.getByText(`Turno ${n} de 3 · Vuelta 1 de 1`)).toBeVisible({ timeout: 20_000 });
      const descriptora = await primeraVisible(paginas, (page) => secretoEn(page));
      const prohibidas = await descriptora.getByTestId('taboo-forbidden').getByRole('listitem').allInnerTexts();
      return { descriptora, secreto: prohibidas[0]!.trim(), prohibidas: prohibidas.map((p) => p.trim()), otras: paginas.filter((page) => page !== descriptora) as [Page, Page] };
    };

    // Turno 1: quien describe ve su secreto; los demás, no (ni en el DOM).
    const { descriptora, secreto, prohibidas, otras } = await turno(1);
    const [g1, g2] = otras;
    await expect(titulo(descriptora)).toHaveText('Describe tu Pokémon');
    await expect(titulo(g1)).toHaveText(`¿Qué Pokémon describe ${nombreDe(descriptora)}?`);
    for (const page of otras) {
      await expect(secretoEn(page)).toHaveCount(0);
      const html = await page.content();
      expect(html, 'el DOM de quien adivina no tiene el secreto').not.toMatch(comoPalabra(secreto));
      expect(html).not.toContain('Palabras prohibidas');
      expect(html).not.toContain('Total de stats');
    }
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);
    await expect(g1.getByText('La descripción se escucha fuera del juego')).toBeVisible();
    await capturarTamanos(g1, 'juego-poke-taboo-adivinar', { sigue: titulo(g1).filter({ hasText: '¿Qué Pokémon describe' }) });

    // La pista con el nombre no sale: la ayuda del campo lo dice, la región viva también, y «Enviar pista» no envía.
    await campo(descriptora).fill(`Se parece mucho a ${secreto}`);
    await expect(descriptora.locator('form').getByText(`Tu pista contiene «${prohibidas[0]!}», que está prohibida: cámbiala para enviarla.`)).toBeVisible();
    await expect(viva(descriptora)).toContainText('está prohibida');
    await expect(enviar(descriptora)).toBeDisabled();
    // Dos pistas: con Intro y con la píldora; tras cada una el campo se vacía y conserva el foco (nunca cae al `body`).
    const pista = async (texto: string, cifras: string) => {
      await campo(descriptora).fill(texto);
      // Si el texto contiene por casualidad un nombre corto (Natu, Abra, Muk…), el campo lo avisa: se usan cifras.
      if (await descriptora.locator('form').getByText(/que está prohibida/).isVisible()) await campo(descriptora).fill(cifras);
      return (await campo(descriptora).inputValue()).trim();
    };
    const primera = await pista('Lo verías en un combate de exhibición', 'Pista 1: 1234567890');
    await campo(descriptora).press('Enter');
    await expect(campo(descriptora)).toHaveValue('', { timeout: 5_000 });
    const primeraEnviada = Date.now();
    await expect(campo(descriptora)).toBeFocused();
    await expect(pistas(g1)).toHaveCount(1, { timeout: 5_000 });
    await expect(pistas(g1).first()).toContainText(primera);
    await expect(viva(g1)).toContainText(`Pista 1 de ${nombreDe(descriptora)}: ${primera}`);
    const larga = await pista(`Su número de registro es largo: ${'0123456789'.repeat(14)}`.slice(0, 180), `Cifras: ${'0123456789'.repeat(17)}`.slice(0, 180));
    await expect(descriptora.getByTestId('taboo-hint-count')).toHaveText(`${larga.length} / 180`);
    // El servidor impone 500 ms entre pistas (`POKE_TABOO_HINT_COOLDOWN_MS`) y el cliente no lo muestra: se espera a que
    // pasen desde la primera (lo normal es que ya hayan pasado con las comprobaciones de arriba) y luego se envía.
    await expect.poll(() => Date.now() - primeraEnviada, { message: 'enfriamiento de pistas del servidor' }).toBeGreaterThan(600);
    await enviar(descriptora).click();
    await expect(campo(descriptora)).toHaveValue('', { timeout: 5_000 });
    await expect(campo(descriptora)).toBeFocused();
    await expect(pistas(g2)).toHaveCount(2, { timeout: 5_000 });
    // La última arriba, destacada con «Nueva» y entera (180 caracteres, sin cortar).
    await expect(pistas(g2).first()).toContainText('Nueva');
    await expect(pistas(g2).first()).toContainText(larga);
    await expect(pistas(descriptora)).toHaveCount(2);
    await campo(descriptora).fill('Tiene una pose de lucha');
    await capturarTamanos(descriptora, 'juego-poke-taboo-describir', { sigue: secretoEn(descriptora) });
    // A 390×844 con el campo enfocado (como con el teclado abierto): el campo, el contador y «Enviar pista» a la vista;
    // arriba, lo prohibido, a la vista y sin tapar.
    await descriptora.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await descriptora.evaluate(() => window.scrollTo(0, 0));
    await expect(descriptora.getByTestId('taboo-forbidden')).toBeInViewport({ ratio: 1 });
    expect(await sinTapar(descriptora.getByTestId('taboo-forbidden')), 'a 390: las palabras prohibidas sin tapar').toBe(true);
    await campo(descriptora).focus();
    await expect(campo(descriptora)).toBeFocused();
    await expect(campo(descriptora)).toBeInViewport({ ratio: 1 });
    await expect(enviar(descriptora)).toBeInViewport({ ratio: 1 });
    await expect(descriptora.getByTestId('taboo-hint-count')).toBeInViewport();
    await descriptora.setViewportSize({ width: 1280, height: 720 });
    await campo(descriptora).fill('');

    // Un fallo de g1: el aviso, la región viva y los intentos públicos (también para g2).
    const fallo = secreto === 'Pikachu' ? 'Bulbasaur' : 'Pikachu';
    await adivinar(g1, fallo);
    await expect(viva(g1)).toContainText(`${fallo} no era.`, { timeout: 5_000 });
    await expect(g2.getByTestId('guess-attempt').filter({ hasText: fallo })).toContainText(`${nombreDe(g1)} probó`, { timeout: 5_000 });
    await expect(g1.getByText('Tu respuesta · 1 intento')).toBeVisible();
    await capturarTamanos(g2, 'juego-poke-taboo-pistas', { sigue: titulo(g2).filter({ hasText: '¿Qué Pokémon describe' }) });
    // A 390×844 sin desplazar: la fase, el plazo y el buscador.
    await g2.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await g2.evaluate(() => window.scrollTo(0, 0));
    for (const arriba of [g2.locator('[aria-current="step"]'), g2.getByRole('timer')]) {
      await expect(arriba).toBeInViewport({ ratio: 1 });
      expect(await sinTapar(arriba), 'a 390: fase y plazo sin tapar').toBe(true);
    }
    await expect(buscadorRespuesta(g2)).toBeInViewport({ ratio: 1 });
    await expect(pistas(g2).first()).toBeInViewport();
    await g2.setViewportSize({ width: 1280, height: 720 });

    // El acierto de g1 (segundo intento); B retiene la revelación para capturarla.
    retenedor.retenerDesde((payload) => juegoEnTrama<{ phase: string }>(payload, 'poke-taboo')?.phase === 'ROUND_RESULTS');
    await expect(g1.getByTestId('guess-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await adivinar(g1, secreto);
    await expect.poll(() => retenedor.retenida(), { timeout: 15_000 }).toBe(true);
    await expect(titulo(b.page)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect(b.page.getByTestId('taboo-reveal-summary')).toHaveText(`${nombreDe(g1)} acertó ${secreto} en 2 intentos.`);
    await expect(viva(b.page)).toHaveText(`Turno 1 terminado. ${nombreDe(g1)} acertó ${secreto} en 2 intentos.`);
    // Al cambiar de fase el foco de quien acertó no cae al `body` (va al título de la placa).
    await expect(titulo(g1)).toHaveText(`¡Era ${secreto}!`, { timeout: 5_000 });
    await expect.poll(() => g1.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), { timeout: 3_000 }).toBe(true);
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(g1) })).toContainText('Acertó · 2 intentos');
    await expect(b.page.getByTestId('social-progress-row').filter({ hasText: nombreDe(descriptora) })).toContainText('+2');
    await expect(b.page.getByText(primera, { exact: false }).first()).toBeVisible();
    // Sin el cut-in del ganador (1,4 s): la captura muestra la revelación.
    await sinMomento(b.page);
    await capturarTamanos(b.page, 'juego-poke-taboo-revelacion', { sigue: titulo(b.page).filter({ hasText: `¡Era ${secreto}!` }) });
    retenedor.soltar();

    // Turnos 2 y 3: quien adivina acierta a la primera.
    for (const n of [2, 3]) {
      const siguiente = await turno(n);
      await adivinar(siguiente.otras[0], siguiente.secreto);
      await expect(titulo(siguiente.otras[0])).toHaveText(`¡Era ${siguiente.secreto}!`, { timeout: 10_000 });
    }

    // Clasificación: métricas en texto, sin medallas.
    await expect(host.page.getByRole('heading', { name: 'Así ha ido la partida', level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/^\d+ adivinados? · \d+ al primer intento · 1\/1 turnos describiendo con acierto · \+\d+ adivinando · \+2 describiendo$/)).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-poke-taboo-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
