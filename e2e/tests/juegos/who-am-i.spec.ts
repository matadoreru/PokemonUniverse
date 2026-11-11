/**
 * E2E de ¿Quién soy? (`who-am-i`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, primeraVisible, sinScorePop, ajustarRango } from '../../src/juegos.js';

const escaparRegExp = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** El Pokémon de `dueno` tal como lo ve `page` en su carta («X, de Nombre: ver sus pistas»): el dueño nunca lo ve. */
async function pokemonDe(page: Page, dueno: string): Promise<string> {
  const carta = page.getByTestId('who-am-i-cards').getByRole('button', { name: new RegExp(`, de ${escaparRegExp(dueno)}: ver sus pistas$`) });
  const etiqueta = await carta.getAttribute('aria-label', { timeout: 10_000 });
  const nombre = /^(.+), de .+: ver sus pistas$/.exec(etiqueta ?? '')?.[1];
  expect(nombre, `Pokémon de ${dueno} en la carta («${etiqueta ?? ''}»)`).toBeTruthy();
  return nombre!;
}

/** Abre el buscador con «Adivinar», escribe `nombre` y espera a que su carta salga en la bandeja (sin elegirla). */
async function buscarEnQuienSoy(page: Page, nombre: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Adivinar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Qué Pokémon eres?' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar tu Pokémon' }).fill(nombre, { timeout: 20_000 });
  const opcion = page.locator('.pokemon-selector-results').getByRole('button', { name: nombre, exact: true });
  await expect(opcion).toBeEnabled({ timeout: 10_000 });
  return opcion;
}

/**
 * ¿Quién soy? con tres jugadores y 3 vueltas como mucho. El primero pregunta una pregunta de 120 caracteres sin espacios
 * (no debe ensanchar la página a 390); los otros dos responden con botones distintos y, mientras se responde, el que
 * pregunta solo ve quién ha respondido. En `DECIDING` ve cada respuesta, falla con un Pokémon que no tiene nadie y
 * le queda «Probó con …» en sus pistas (la captura «decidir», ya en el turno de B). Después cada uno lee su Pokémon en la carta de otro y lo adivina en su turno
 * (el segundo, con el buscador capturado) hasta la clasificación.
 */
test('quién soy: preguntar, responder, adivinar y clasificación', async ({ browser }) => {
  test.setTimeout(300_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const paginas = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, '¿Quién soy?');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await ajustarRango(host.page, 'Número de vueltas', 'Home', '3');
    // Plazos largos: las capturas a tres tamaños no deben llegar al final de un paso.
    await ajustarRango(host.page, 'Tiempo para preguntar', 'End', '90');
    await ajustarRango(host.page, 'Tiempo para responder', 'End', '60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(paginas);

    const viva = (page: Page) => page.getByTestId('social-screen').locator('[aria-live]');
    const campo = (page: Page) => page.getByRole('textbox', { name: 'Escribe una pregunta de sí o no' });
    const pistas = (page: Page) => page.getByTestId('who-am-i-clues');
    const jugadorDe = (page: Page) => jugadores.find((j) => j.page === page)!;
    for (const page of paginas) await expect(page.getByTestId('who-am-i-cards')).toBeVisible({ timeout: 20_000 });
    for (const page of paginas) await expect(viva(page)).toHaveCount(1);

    // Turno del primero: su carta lleva «?» y en las de los demás está el Pokémon de cada uno.
    const turnoA = await primeraVisible(paginas, campo);
    const a = jugadorDe(turnoA);
    const [b, c] = jugadores.filter((j) => j !== a) as [Jugador, Jugador];
    await expect(a.page.getByTestId('who-am-i-cards').getByText('Tu Pokémon', { exact: true })).toBeVisible();
    for (const otro of [b, c]) await expect(otro.page.getByText(`Turno de ${a.name}`).first()).toBeVisible();
    const asignados = new Map<string, string>([
      [a.name, await pokemonDe(b.page, a.name)],
      [b.name, await pokemonDe(a.page, b.name)],
      [c.name, await pokemonDe(a.page, c.name)],
    ]);
    test.info().annotations.push({ type: 'reparto', description: [...asignados].map(([nombre, pokemon]) => `${nombre}: ${pokemon}`).join(' · ') });
    // Nadie ve el suyo: ni en su carta ni en ningún texto de su página.
    for (const j of jugadores) await expect(j.page.getByTestId('who-am-i-cards').getByText(asignados.get(j.name)!, { exact: true })).toHaveCount(0);

    // Una pregunta de 120 caracteres sin espacios: el campo, la placa y el título la parten sin scroll horizontal.
    const pregunta = `¿${'SoyDeTipoFuegoOVolador'.repeat(6)}`.slice(0, 119) + '?';
    expect(pregunta).toHaveLength(120);
    await campo(a.page).fill(pregunta);
    await expect(a.page.getByText('120/120')).toBeVisible();
    await capturarTamanos(a.page, 'juego-who-am-i-preguntar', { sigue: campo(a.page) });
    await a.page.getByRole('button', { name: 'Enviar' }).click();

    // B responde «Sí»; el que pregunta ve que B ha respondido, pero no qué.
    const respuestas = (page: Page) => page.getByRole('group', { name: 'Tu respuesta' });
    for (const otro of [b, c]) await expect(respuestas(otro.page)).toBeVisible({ timeout: 10_000 });
    await respuestas(b.page).getByRole('button', { name: 'Sí', exact: true }).click();
    await expect(respuestas(b.page).getByRole('button', { name: 'Sí', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(a.page.getByText(`${b.name} · Respondió`)).toBeVisible();
    await expect(a.page.getByText(`${c.name} · Sin respuesta`)).toBeVisible();
    await expect(a.page.getByText(`${b.name} · Sí`)).toHaveCount(0);
    await expect(c.page.getByText(`${b.name} · Sí`)).toHaveCount(0);
    // Quien responde ve en la placa el Pokémon del que pregunta; el que pregunta no ve ninguno.
    await expect(c.page.getByTestId('who-am-i-asker')).toContainText(asignados.get(a.name)!);
    await expect(a.page.getByTestId('who-am-i-asker')).toHaveCount(0);
    await capturarTamanos(c.page, 'juego-who-am-i-responder', { sigue: respuestas(c.page) });
    await respuestas(c.page).getByRole('button', { name: 'A medias', exact: true }).click();

    // `DECIDING`: el que pregunta ve cada respuesta y elige entre adivinar o pasar.
    const decidir = a.page.getByRole('heading', { name: '¿Adivinas o pasas?' });
    await expect(decidir).toBeVisible({ timeout: 10_000 });
    await expect(a.page.getByText(`${b.name} · Sí`)).toBeVisible();
    await expect(a.page.getByText(`${c.name} · A medias`)).toBeVisible();
    await expect(a.page.getByRole('button', { name: 'Pasar' })).toBeEnabled();
    await capturarTamanos(a.page, 'juego-who-am-i-adivinar-o-pasar', { sigue: decidir });

    // Falla con un Pokémon que no tiene nadie (el de otro jugador sale bloqueado): «Probó con …» en sus pistas.
    const fallo = ['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle'].find((nombre) => ![...asignados.values()].includes(nombre))!;
    await (await buscarEnQuienSoy(a.page, fallo)).click();
    await expect(pistas(a.page).getByText(`Probó con ${fallo}`)).toBeVisible({ timeout: 10_000 });
    await expect(pistas(a.page).getByText(pregunta)).toBeVisible();
    await expect(pistas(a.page).getByText(`${b.name}:`)).toBeVisible();
    // Ya en el turno de B: las pistas de A con la pregunta larga, las dos respuestas y el fallo.
    await expect(a.page.getByText(`Turno de ${b.name}`).first()).toBeVisible();
    await capturarTamanos(a.page, 'juego-who-am-i-decidir', { sigue: pistas(a.page) });

    // Cada uno lee su Pokémon en la carta de otro y lo adivina en su turno; el buscador se captura en el de B.
    let capturado = false;
    const resueltos = new Set<string>();
    while (resueltos.size < jugadores.length) {
      const turno = jugadorDe(await primeraVisible(paginas.filter((page) => !resueltos.has(jugadorDe(page).name)), campo));
      const suyo = asignados.get(turno.name)!;
      const opcion = await buscarEnQuienSoy(turno.page, suyo);
      if (!capturado) {
        await capturarTamanos(turno.page, 'juego-who-am-i-adivinar', { sigue: opcion });
        capturado = true;
      }
      await opcion.click();
      resueltos.add(turno.name);
      if (resueltos.size < jugadores.length) {
        await expect(viva(turno.page)).toContainText(`¡Eras ${suyo}!`, { timeout: 10_000 });
        await expect(turno.page.getByTestId('who-am-i-cards').getByText(suyo, { exact: true })).toBeVisible();
      }
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 20_000 });
    for (const [nombre, pokemon] of asignados) await expect(host.page.getByText(`Era ${pokemon} · Acertó`).first(), nombre).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-who-am-i-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/**
 * ¿Quién soy? con cinco jugadores en el móvil (390×844): las cartas van en una fila que se desplaza en horizontal y la
 * última se alcanza; quien responde ve en la placa el Pokémon del que pregunta (por si su carta queda fuera de la vista).
 */
test('quién soy: cinco jugadores en el móvil, cartas desplazables y el Pokémon del que pregunta', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 5, { width: SIZES[2].w, height: SIZES[2].h });
  try {
    const { host, invitados, jugadores } = sala;
    const paginas = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, '¿Quién soy?');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    await ajustarRango(host.page, 'Tiempo para preguntar', 'End', '90');
    await ajustarRango(host.page, 'Tiempo para responder', 'End', '60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(paginas);
    for (const page of paginas) await expect(page.getByTestId('who-am-i-cards')).toBeVisible({ timeout: 20_000 });

    const campo = (page: Page) => page.getByRole('textbox', { name: 'Escribe una pregunta de sí o no' });
    const pregunta = await primeraVisible(paginas, campo);
    const a = jugadores.find((j) => j.page === pregunta)!;
    const otro = jugadores.find((j) => j !== a)!;
    await campo(a.page).fill('¿Soy de tipo agua?');
    await a.page.getByRole('button', { name: 'Enviar' }).click();
    const respuestas = otro.page.getByRole('group', { name: 'Tu respuesta' });
    await expect(respuestas).toBeVisible({ timeout: 10_000 });
    // La placa enseña el Pokémon del que pregunta: el mismo que su carta.
    await expect(otro.page.getByTestId('who-am-i-asker')).toContainText(await pokemonDe(otro.page, a.name));

    // Cinco cartas no caben en 390: la fila se desplaza dentro de su lista y la última se alcanza entera.
    await otro.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    const cartas = otro.page.getByTestId('who-am-i-cards');
    const medidas = await cartas.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
    expect(medidas.overflowX).toBe('auto');
    expect(medidas.scroll).toBeGreaterThan(medidas.client);
    await capturarTamanos(otro.page, 'juego-who-am-i-cinco-jugadores', { sigue: respuestas });
    await otro.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    const ultima = cartas.locator(':scope > li').last();
    await ultima.scrollIntoViewIfNeeded();
    const caja = await cartas.boundingBox();
    const ultimaCaja = await ultima.boundingBox();
    expect(caja && ultimaCaja).toBeTruthy();
    expect(ultimaCaja!.x).toBeGreaterThanOrEqual(caja!.x - 1);
    expect(ultimaCaja!.x + ultimaCaja!.width).toBeLessThanOrEqual(caja!.x + caja!.width + 1);
    expect(ultimaCaja!.x + ultimaCaja!.width).toBeLessThanOrEqual(SIZES[2].w);
    // Solo a 390×844 a propósito: la fila desplazable de cartas solo existe por debajo de 1024 px.
    await otro.page.screenshot({ path: 'screenshots/juego-who-am-i-cinco-jugadores-desplazado-390x844.png', animations: 'disabled' });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
