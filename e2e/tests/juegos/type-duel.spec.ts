/**
 * E2E de Type Duel (`type-duel`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, layoutProblems, psql, esperarPartida, seleccionarJuego } from '../../src/helpers.js';
import { capturarTamanos, elegirModo, ajustarRango, comprobarChipDeCarta, capturarMostrando, comprobarTituloDeCabecera, comprobarAlturaDeCartas } from '../../src/juegos.js';

test('type-duel: elección secreta, VS, búsqueda con un fallo, victoria y clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Type Duel');
    // Un solo duelo (para llegar a la clasificación) y plazos largos: da tiempo a capturar cada fase.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, tecla, valor] of [['Número de rondas', 'Home', '1'], ['Tiempo para elegir tipo', 'End', '60'], ['Tiempo para buscar', 'End', '60']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    for (const { page } of jugadores) await expect(page.getByRole('heading', { name: 'Elegid un tipo en secreto' })).toBeVisible({ timeout: 20_000 });

    // Los dos duelistas son las páginas con los 18 tipos (conmutadores sin pulsar); el tercero observa.
    const duelistas: Page[] = [];
    let observador: Page | undefined;
    for (const { page } of jugadores) {
      if (await page.getByRole('button', { name: 'Elegir tipo Fuego' }).isVisible()) duelistas.push(page);
      else observador = page;
    }
    expect(duelistas.length, 'duelistas que eligen tipo').toBe(2);
    const [primero, segundo] = duelistas as [Page, Page];
    await expect(primero.getByRole('button', { name: /^Elegir tipo / })).toHaveCount(18);
    await expect(primero.getByRole('button', { name: 'Elegir tipo Fuego' })).toHaveAttribute('aria-pressed', 'false');
    await expect(observador!.getByText('Estás observando la selección.')).toBeVisible();
    await expect(observador!.locator('[data-type]'), 'el observador no ve ningún tipo').toHaveCount(0);
    await capturarTamanos(primero, 'juego-type-duel-eleccion');
    // A 390×844, sin desplazar, los 18 tipos caben en la pantalla inferior.
    await primero.setViewportSize({ width: 390, height: 844 });
    for (const tipo of ['Normal', 'Hada']) await expect(primero.getByRole('button', { name: `Elegir tipo ${tipo}` }), `${tipo} a la vista a 390×844`).toBeInViewport({ ratio: 1 });
    // Y la pantalla inferior no tapa las tarjetas de los duelistas.
    const abajo = (await primero.locator('[data-layer="screen-bottom"]').boundingBox())!;
    for (const tarjeta of await primero.locator('[aria-labelledby="type-duel-pick-title"] [data-duelist]').all()) {
      const caja = (await tarjeta.boundingBox())!;
      expect(caja.y + caja.height, 'tarjeta de duelista entera sobre la pantalla inferior').toBeLessThanOrEqual(abajo.y);
    }
    await primero.setViewportSize({ width: 1280, height: 720 });

    // Elige con el teclado: flecha a la derecha desde Normal y Enter; el foco pasa al título de la placa bloqueada.
    await primero.getByRole('button', { name: 'Elegir tipo Normal' }).focus();
    await primero.keyboard.press('ArrowRight');
    await expect(primero.getByRole('button', { name: 'Elegir tipo Fuego' })).toBeFocused();
    await primero.keyboard.press('Enter');
    const bloqueado = primero.locator('[data-layer="screen-bottom"] h2');
    await expect(bloqueado).toContainText('Elegiste');
    await expect(bloqueado).toBeFocused();
    await expect(primero.getByText('El tipo rival sigue oculto.')).toBeVisible();
    // El rival solo sabe que ya ha bloqueado, nunca qué: en su página no hay más tipos que sus 18 opciones.
    await expect(segundo.getByText('Tipo bloqueado').first()).toBeVisible();
    await expect(segundo.locator('[data-type]')).toHaveCount(18);
    await segundo.getByRole('button', { name: 'Elegir tipo Fuego' }).click();

    // Revelación (2 s) y búsqueda: losa VS con cuántos Pokémon cumplen la combinación.
    const versus = host.page.getByTestId('type-duel-versus');
    await expect(versus).toBeVisible({ timeout: 10_000 });
    const vs = versus.getByText('VS', { exact: true });
    await expect(vs).toBeVisible();
    await expect(versus.getByText(/^\d+ Pokémon tienen esta combinación$/)).toBeVisible();
    for (const lado of ['.motion-enter-left', '.motion-enter-right']) await expect(versus.locator(`${lado} [data-type="fire"]`)).toHaveText('Fuego');
    // Los dos eligieron Fuego: «Monotipo» en vez de repetir la insignia, y el título no repite los nombres.
    await expect(versus.getByText('Monotipo', { exact: true })).toBeVisible();
    await expect(host.page.getByRole('heading', { level: 1, name: 'Duelo de tipos' })).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-vs', { sigue: versus });
    expect(await animacionDe(vs.locator('..')), 'VS con reducción de movimiento').toBe('none');
    await conMovimiento(host.page);
    expect(await animacionDe(vs.locator('..')), 'VS con movimiento').toBe('motion-bump');
    expect(await animacionDe(versus.locator('.motion-enter-left')), 'primer duelista con movimiento').toBe('motion-enter-left');
    await host.page.emulateMedia({ reducedMotion: 'reduce' });

    // Con la losa del VS encima, el buscador del duelista sigue a la vista en móvil durante la búsqueda.
    const buscador = primero.getByLabel('Buscar Pokémon con la combinación exacta');
    await expect(buscador).toBeVisible({ timeout: 10_000 });
    await primero.setViewportSize({ width: 390, height: 844 });
    await expect(buscador).toBeInViewport();
    // Al escribir, el campo y los dos primeros candidatos caben enteros en la pantalla sin desplazarla.
    await buscador.fill('char');
    const candidatos = primero.locator('.pokemon-selector-results button');
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    expect(await primero.evaluate(() => window.scrollY), 'desplazamiento al buscar').toBe(0);
    await expect(buscador).toBeInViewport({ ratio: 1 });
    for (const n of [0, 1]) await expect(candidatos.nth(n), `candidato ${n + 1} entero a 390×844`).toBeInViewport({ ratio: 1 });
    // Los tipos de la losa se ven enteros y la pantalla inferior no los tapa.
    const losa = primero.getByTestId('type-duel-versus');
    for (const lado of ['.motion-enter-left', '.motion-enter-right']) await expect(losa.locator(`${lado} [data-type]`)).toBeInViewport({ ratio: 1 });
    const cajaLosa = await losa.locator('.motion-enter-left [data-type]').boundingBox();
    const inferior = await primero.locator('[data-layer="screen-bottom"]').boundingBox();
    expect(cajaLosa!.y + cajaLosa!.height, 'la pantalla inferior no tapa los tipos').toBeLessThanOrEqual(inferior!.y);
    const busqueda = await layoutProblems(primero, 'juego-type-duel-vs-busqueda', true);
    expect(busqueda.problems, `${busqueda.id}: encaje y legibilidad`).toEqual([]);
    await primero.setViewportSize({ width: 1280, height: 720 });

    // Un intento fallido (Charizard es Fuego/Volador): sale en los intentos públicos y junto al buscador.
    await buscador.fill('charizard');
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    await buscador.press('Enter');
    await expect(host.page.getByText('No coincide con los tipos').first()).toBeVisible({ timeout: 10_000 });
    await expect(primero.locator('[data-layer="screen-bottom"]').getByText(/no coincide/)).toBeVisible();
    await buscador.fill('char');
    await capturarTamanos(primero, 'juego-type-duel-busqueda');

    // Charmander es Fuego puro: gana el duelo.
    await buscador.fill('charmander');
    await expect(candidatos.first()).toContainText('Charmander', { timeout: 10_000 });
    await expect(candidatos.first()).toBeEnabled({ timeout: 5_000 });
    await buscador.press('Enter');
    const titulo = host.page.getByRole('heading', { level: 2, name: / gana$/ });
    await expect(titulo).toBeVisible({ timeout: 10_000 });
    const resultado = host.page.getByTestId('type-duel-result');
    await expect(resultado.locator('[data-type="fire"]').first()).toBeVisible();
    await expect(resultado.locator('[data-winning-card]')).toContainText('Charmander');
    await expect(primero.locator('[data-layer="screen-bottom"]').getByText('¡Ganaste el duelo!')).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-resultado', { sigue: titulo });

    // Un solo duelo: el host pasa a la clasificación.
    await host.page.getByRole('button', { name: 'Ver clasificación' }).click();
    const clasificacion = host.page.getByRole('heading', { level: 1, name: 'Clasificación Type Duel' });
    await expect(clasificacion).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByText('Récords de la partida')).toBeVisible();
    await capturarTamanos(host.page, 'juego-type-duel-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('type-duel: modo Cooperativo, búsqueda conjunta contra el reloj y resultado del grupo', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Type Duel');
    await elegirModo(host.page, 'Cooperativo');
    // Sin los tiempos del duelo: solo la búsqueda conjunta (30 s, el mínimo) y una ronda.
    await expect(host.page.getByRole('slider', { name: 'Tiempo para elegir tipo' })).toHaveCount(0);
    await expect(host.page.getByRole('slider', { name: 'Tiempo para buscar' })).toHaveCount(0);
    await ajustarRango(host.page, 'Tiempo de búsqueda conjunta', 'Home', '30');
    await ajustarRango(host.page, 'Número de rondas', 'Home', '1');
    const carta = await comprobarChipDeCarta(host.page, 'Type Duel', 'Cooperativo');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-cooperativo', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    await comprobarTituloDeCabecera(host.page, 'Type Duel · Cooperativo');

    // La combinación es pública: se busca en la BD un Pokémon de ese tipo exacto y el primer invitado escribe su nombre.
    // Se busca por nombre y no por id: algunos Pokémon por defecto tienen un id con guion (Morpeko es
    // `morpeko-full-belly`) y, si es el único de la combinación, filtrar los ids con guion no dejaba ninguno.
    const tablero = (page: Page) => page.getByTestId('type-duel-coop-board');
    await expect(tablero(host.page)).toBeVisible({ timeout: 20_000 });
    const tipos = [...new Set(await tablero(host.page).locator('[data-type]').evaluateAll((els) => els.map((el) => el.getAttribute('data-type')!)))];
    const nombres = psql(
      `SELECT p.name FROM "Pokemon" p WHERE p."isDefault" AND (SELECT array_agg(a."typeId" ORDER BY a."typeId") FROM "PokemonTypeAssignment" a WHERE a."pokemonId" = p.id) = (SELECT array_agg(t ORDER BY t) FROM unnest(string_to_array(:'tipos', ',')) AS t) ORDER BY p."nationalDexNumber" LIMIT 3;`,
      { tipos: tipos.join(',') },
    ).split('\n').filter(Boolean);
    test.info().annotations.push({ type: 'coop', description: `combinación ${tipos.join('/')}; candidatos ${nombres.join(', ')}` });
    expect(nombres.length, `Pokémon de la combinación ${tipos.join('/')} en la BD`).toBeGreaterThan(0);

    const primero = invitados[0]!.page;
    const buscador = primero.getByLabel('Buscar Pokémon con esos tipos');
    await expect(buscador).toBeVisible({ timeout: 10_000 });
    // Búsqueda abierta (antes de decir nada: con una sola solución, el primer acierto cierra la ronda).
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-cooperativo', { sigue: tablero(host.page) });
    const candidatos = primero.locator('.pokemon-selector-results button');
    await buscador.fill(nombres[0]!);
    await expect(candidatos.first()).toBeVisible({ timeout: 10_000 });
    await expect(candidatos.first()).toBeEnabled({ timeout: 5_000 });
    await buscador.press('Enter');
    // El acierto cuenta para todos: aparece en la lista «Encontrados» de cada página, con quién lo encontró.
    for (const { page } of jugadores) await expect(page.getByText(/Lo encontr(ó|aste)/).first()).toBeVisible({ timeout: 10_000 });

    // Con una sola solución la ronda cierra al encontrarla; con varias, al agotarse los 30 s: resultado del grupo.
    const resultado = host.page.getByTestId('type-duel-coop-result');
    await expect(resultado).toBeVisible({ timeout: 45_000 });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-cooperativo-ronda', { sigue: resultado });
    await host.page.getByRole('button', { name: 'Ver clasificación' }).click();
    const fin = host.page.getByRole('heading', { name: 'Resultado del grupo' });
    await expect(fin).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/Type Duel · Cooperativo · 1 ronda/)).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-cooperativo-resultados', { sigue: fin, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
