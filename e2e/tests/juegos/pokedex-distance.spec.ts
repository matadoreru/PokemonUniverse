/**
 * E2E de Pokédex Distance (`pokedex-distance`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, SELECTOR_PATH, esSelector, elegirPokemon, capturarAnotando, elegirModo, ajustarRango, comprobarChipDeCarta, capturarMostrando, comprobarTituloDeCabecera, comprobarAlturaDeCartas } from '../../src/juegos.js';

/** Estado de un jugador de Pokédex Distance que ya ha elegido con las elecciones ocultas (`pokedex-distance-selection.ts`). */
const DISTANCE_PICKED = '✓ Ya ha elegido';

test('pokedex-distance: elección de los rivales oculta y panel de visibilidad', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // Panel: «Ocultas» por defecto; «Visibles» muestra el aviso de copia. Se captura con el aviso y se vuelve a ocultas.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const ocultas = host.page.getByRole('radio', { name: 'Ocultas', exact: true });
    const visibles = host.page.getByRole('radio', { name: 'Visibles', exact: true });
    await expect(ocultas).toHaveAttribute('aria-checked', 'true');
    const aviso = host.page.getByText('Permite copiar: los demás ven tu elección al momento.');
    await expect(aviso).toHaveCount(0);
    await visibles.click();
    await expect(visibles).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toBeVisible();
    // Desde arriba, como el resto de capturas del lobby: con la página desplazada la cabecera fija solapa las pestañas.
    await host.page.evaluate(() => window.scrollTo(0, 0));
    // Página completa: a 390×844 el grupo «Elecciones de los rivales» queda bajo las generaciones.
    await capturarTamanos(host.page, 'lobby-config-pokedex-distance', { completa: true });
    await ocultas.click();
    await expect(ocultas).toHaveAttribute('aria-checked', 'true');
    await expect(aviso).toHaveCount(0);
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    // Un invitado elige: él ve su confirmación (estado privado) y el host solo ve que ya ha elegido, nunca el Pokémon.
    const [eligeAntes] = invitados;
    const buscador = eligeAntes!.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await buscador.fill('Pikachu', { timeout: 20_000 });
    // El catálogo del buscador llega por HTTP: se espera a la coincidencia antes de elegirla.
    await eligeAntes!.page.getByRole('button', { name: 'Pikachu', exact: true }).click({ timeout: 10_000 });
    const confirmada = eligeAntes!.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ });
    await expect(confirmada).toBeVisible({ timeout: 10_000 });
    // El buscador se desmonta al elegir: el foco va al título de la placa, no se pierde en `body`.
    await expect(confirmada).toBeFocused();
    expect(await eligeAntes!.page.evaluate(() => document.activeElement === document.body)).toBe(false);
    const yaHaElegido = host.page.getByText('✓ Ya ha elegido', { exact: true });
    await expect(yaHaElegido).toHaveCount(1, { timeout: 10_000 });
    await expect(host.page.getByText(/→ Pikachu/)).toHaveCount(0);
    await expect(host.page.getByRole('heading', { name: 'En la ronda' })).toBeVisible();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-oculta', { sigue: yaHaElegido });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: recarga a mitad de ronda', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [segundo, tercero] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // 60 s por ronda: caben las dos elecciones, las capturas y la recarga del tercero.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    // Red: el catálogo del buscador no lleva datos de respuesta y nadie pide el antiguo `/api/pokemon`.
    const antiguas: string[] = [];
    for (const { page } of jugadores) page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/pokemon') antiguas.push(r.url()); });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<Record<string, unknown>> };
    expect(catalogo.length, 'entradas del catálogo').toBeGreaterThan(0);
    for (const entrada of catalogo) {
      expect(Object.keys(entrada).sort(), `claves de ${String(entrada.id)}`).toEqual(['id', 'name', 'sprite']);
      expect(String(entrada.sprite), `sprite de ${String(entrada.id)}`).not.toContain('sprites/pokemon/');
    }

    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon' });
    for (const { page } of jugadores) await expect(buscador(page)).toBeVisible({ timeout: 20_000 });
    // Eligen primero los otros dos: al caerse el tercero sería el único que falta y, sin la gracia, la ronda se
    // cerraría en ese momento con él «sin respuesta».
    await elegirPokemon(host.page, 'Pikachu');
    await elegirPokemon(segundo.page, 'Bulbasaur');
    for (const { page } of jugadores) {
      await expect(page.getByText(DISTANCE_PICKED, { exact: true }), 'host y segundo ya han elegido').toHaveCount(2, { timeout: 10_000 });
      await expect(page.getByText(/^→ /), 'ningún rival muestra su Pokémon').toHaveCount(0);
    }
    const enLaRonda = host.page.getByRole('heading', { name: 'En la ronda' });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-ronda-oculta', { sigue: enLaRonda });

    // El tercero recarga: la app le ofrece «Volver a la sala» y vuelve al buscador antes de que venza la gracia de 8 s,
    // con la ronda aún abierta.
    const inicio = Date.now();
    await tercero.page.reload();
    await tercero.page.getByRole('button', { name: 'Volver a la sala' }).click({ timeout: 8_000 });
    await expect(buscador(tercero.page)).toBeVisible({ timeout: 8_000 });
    expect(Date.now() - inicio, 'vuelta al buscador tras recargar (ms)').toBeLessThan(8_000);
    await expect(tercero.page.getByText('Estás observando')).toHaveCount(0);
    await expect(host.page.getByText('Resultado de la ronda')).toHaveCount(0);
    await expect(enLaRonda).toBeVisible();
    await expect(tercero.page.getByText(DISTANCE_PICKED, { exact: true })).toHaveCount(2);
    // Contador junto a «Ronda N»: sale de `selectedIds`, así que dice cuántos han elegido y nunca qué.
    await expect(tercero.page.getByText('2 de 3 han elegido', { exact: true })).toBeVisible();
    await elegirPokemon(tercero.page, 'Charmander');

    await expect(host.page.getByText('Resultado de la ronda')).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByRole('heading', { name: '⏱️ Tiempo agotado' })).toHaveCount(0);
    const tarjeta = host.page.getByRole('list', { name: 'Distancias de la ronda' }).getByRole('listitem').filter({ hasText: tercero.name });
    await expect(tarjeta).toContainText('Charmander');
    await expect(tarjeta).not.toContainText('Sin respuesta');
    // Revelación: regla con el objetivo en el centro y un marcador por jugador (6 s en pantalla). La suite fija la
    // reducción de movimiento: los marcadores no animan; sin ella entran con `motion-enter-up`. Se vuelve a reducir
    // antes de capturar, porque reactivarla reinicia la entrada (opacidad 0) y la captura la mediría a medias.
    const regla = host.page.getByTestId('distance-ruler');
    await expect(regla).toBeVisible();
    const marcadores = regla.getByTestId('distance-ruler-marker');
    await expect(marcadores).toHaveCount(3);
    await expect(regla.getByText(new RegExp(`^${tercero.name}: #004, (a \\d+|acierto exacto)`))).toHaveCount(1);
    expect(await animacionDe(marcadores.first()), 'marcador con reducción de movimiento').toBe('none');
    await conMovimiento(host.page);
    expect(await animacionDe(marcadores.first()), 'marcador con movimiento').toBe('motion-enter-up');
    await host.page.emulateMedia({ reducedMotion: 'reduce' });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-revelacion', { sigue: regla });
    expect(antiguas, 'peticiones a /api/pokemon').toEqual([]);
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: acierto exacto con cut-in', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // 60 s por ronda: el reloj del host se detiene, pero el plazo del servidor sigue y el invitado no elige; así la
    // ronda no cierra (y se lleva la banda) mientras se capturan los tres tamaños.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // Reloj controlado en el host: la banda dura 1,6 s y se detiene el tiempo mientras se captura.
    await host.page.clock.install();
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida(jugadores.map((j) => j.page));

    // El objetivo es público («Objetivo #N»): el host elige el Pokémon de ese número (forma por defecto, de la BD local).
    const objetivo = host.page.getByRole('heading', { name: /^Objetivo/ });
    await expect(host.page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeVisible({ timeout: 20_000 });
    const numero = Number((await objetivo.innerText()).replace(/\D/g, ''));
    expect(numero, 'número del objetivo').toBeGreaterThan(0);
    const exacto = psql(`SELECT name FROM "Pokemon" WHERE "nationalDexNumber" = :'n'::int AND "isDefault" ORDER BY id LIMIT 1;`, { n: String(numero) });
    expect(exacto, `Pokémon #${numero} en la BD`).not.toBe('');
    await elegirPokemon(host.page, exacto);

    const banda = host.page.locator('[data-layer="cutin"][data-tone]');
    await expect(banda).toContainText('¡Acierto exacto!', { timeout: 5_000 });
    // Se detiene un poco por delante del reloj de la página (detenerlo en el pasado falla) y se captura a los tres
    // tamaños con la banda quieta.
    await host.page.clock.pauseAt(await host.page.evaluate(() => Date.now() + 100));
    try {
      await expect(banda).toContainText(`#${String(numero).padStart(3, '0')}`);
      await host.page.evaluate(() => window.scrollTo(0, 0));
      await capturarTamanos(host.page, 'juego-pokedex-distance-acierto-exacto', { sigue: banda });
    } finally {
      await host.page.clock.resume();
    }
    // Sin el reloj detenido, la banda se va sola.
    await expect(banda).toBeHidden({ timeout: 5_000 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: buscador sin coincidencias', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    // 60 s por ronda: caben las capturas a los tres tamaños.
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const tiempo = host.page.getByRole('slider', { name: 'Tiempo por ronda' });
    await tiempo.focus();
    await tiempo.press('End');
    await tiempo.blur();
    await expect(tiempo).toHaveValue('60');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    // El invitado no recibe el catálogo hasta que se levanta el bloqueo (en desarrollo, StrictMode lo pide dos veces):
    // ve el error con «Reintentar» y, al pulsarlo, el buscador funciona.
    let bloqueado = true;
    await invitado.page.route((url) => url.pathname === SELECTOR_PATH, async (route) => {
      if (bloqueado) await route.abort('connectionrefused');
      else await route.fallback();
    });
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida([host.page, invitado.page]);

    const buscador = host.page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(buscador).toBeVisible({ timeout: 20_000 });
    // Autofoco sin desplazar la página: la cabecera fija no tapa nada.
    await expect(buscador).toBeFocused();
    expect(await host.page.evaluate(() => window.scrollY), 'desplazamiento tras el autofoco').toBe(0);
    await buscador.fill('zzzz');
    const vacio = host.page.getByText('Ningún Pokémon coincide con “zzzz”.');
    await expect(vacio).toBeVisible({ timeout: 10_000 });
    const borrar = host.page.getByRole('button', { name: 'Borrar búsqueda' });
    await expect(borrar).toBeVisible();
    await capturarTamanos(host.page, 'juego-buscador-vacio', { sigue: vacio });
    await borrar.click();
    await expect(buscador).toHaveValue('');
    await expect(buscador).toBeFocused();
    await expect(vacio).toHaveCount(0);

    const alerta = invitado.page.getByRole('alert').filter({ hasText: 'No se pudo cargar el buscador de Pokémon.' });
    await expect(alerta).toBeVisible({ timeout: 20_000 });
    await capturarTamanos(invitado.page, 'juego-buscador-error', { sigue: alerta });
    bloqueado = false;
    await alerta.getByRole('button', { name: 'Reintentar' }).click();
    await expect(alerta).toHaveCount(0, { timeout: 10_000 });
    await elegirPokemon(invitado.page, 'Pikachu');
    await expect(invitado.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ })).toBeVisible({ timeout: 10_000 });
    expect(host.errors, host.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: empate forzado tras tres desempates', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];
    await seleccionarJuego(host.page, 'Pokédex Distance');
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida([host.page, invitado.page]);
    // Con las elecciones ocultas no hay bloqueo: los dos eligen el mismo Pokémon, siempre a la misma distancia.
    // Ronda inicial y tres desempates; en el tercero cae quien eligió el último (el invitado).
    const titulo = (texto: string) => host.page.getByRole('heading', { name: texto });
    for (let ronda = 0; ronda < 4; ronda++) {
      for (const { page } of jugadores) await expect(page.getByRole('textbox', { name: 'Buscar Pokémon' })).toBeVisible({ timeout: 20_000 });
      await elegirPokemon(host.page, 'Pikachu');
      await expect(invitado.page.getByText(DISTANCE_PICKED, { exact: true })).toHaveCount(1, { timeout: 10_000 });
      await elegirPokemon(invitado.page, 'Pikachu');
      if (ronda < 3) await expect(titulo('⚔️ Empate en la peor distancia')).toBeVisible({ timeout: 15_000 });
    }
    const forzado = titulo('⚔️ Empate tras 3 desempates');
    await expect(forzado).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText('Cae quien eligió último; si eligieron a la vez, caen todos.')).toBeVisible();
    await expect(host.page.getByRole('list', { name: 'Distancias de la ronda' }).getByRole('listitem').filter({ hasText: invitado.name })).toContainText('Eliminado');
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarAnotando(host.page, 'juego-pokedex-distance-empate-forzado', forzado);

    // Resultados propios: clasificación con la ronda de caída, mejor acierto y distancia por ronda (R1 y sus tres
    // desempates), sin NaN ni scroll horizontal de la página aunque la tabla tenga muchas columnas.
    await expect(titulo('Resultado de la partida')).toBeVisible({ timeout: 15_000 });
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion.getByRole('listitem').filter({ hasText: host.name })).toContainText('Ganador');
    await expect(clasificacion.getByRole('listitem').filter({ hasText: invitado.name })).toContainText('Cayó en la ronda 1');
    await expect(clasificacion.getByRole('listitem').filter({ hasText: host.name })).toContainText('1 desempate superado');
    await expect(host.page.getByRole('heading', { name: 'Mejor acierto' })).toBeVisible();
    const tabla = host.page.getByRole('table');
    await expect(tabla.getByRole('columnheader')).toHaveText(['Entrenador', 'R1', 'R1 · D1', 'R1 · D2', 'R1 · D3']);
    await expect(tabla.getByRole('row').filter({ hasText: invitado.name }).getByRole('cell').last()).toContainText('cayó');
    await expect(host.page.getByText(/NaN|Infinity|ronda 0/)).toHaveCount(0);
    await host.page.setViewportSize({ width: 390, height: 844 });
    expect(await host.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal de la página a 390').toBe(true);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-pokedex-distance-resultados', { sigue: tabla, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokedex-distance: modo Por puntos, tres rondas sin eliminar a nadie y clasificación por puntos', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokédex Distance');
    await elegirModo(host.page, 'Por puntos');
    await ajustarRango(host.page, 'Número de rondas', 'Home', '3');
    await ajustarRango(host.page, 'Tiempo por ronda', 'End', '60');
    const carta = await comprobarChipDeCarta(host.page, 'Pokédex Distance', 'Por puntos');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-por-puntos', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const buscador = (page: Page) => page.getByRole('textbox', { name: 'Buscar Pokémon' });
    await expect(buscador(host.page)).toBeVisible({ timeout: 20_000 });
    // Cabecera de la ronda: «Ronda 1 de 3», chip del modo y puntos.
    await expect(host.page.getByText('Ronda 1 de 3', { exact: true }).first()).toBeVisible();
    await expect(host.page.getByText('Por puntos', { exact: true }).first()).toBeVisible();
    await comprobarTituloDeCabecera(host.page, 'Pokédex Distance · Por puntos');
    // Elige solo el host: el resto sigue pensando y el juego se captura a los tres tamaños.
    await elegirPokemon(host.page, 'Pikachu');
    await expect(host.page.getByRole('heading', { name: /Selección confirmada|Acierto exacto/ })).toBeVisible({ timeout: 10_000 });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-por-puntos', { sigue: host.page.getByText('Ronda 1 de 3', { exact: true }).first() });
    for (const { page } of invitados) await elegirPokemon(page, 'Pikachu');

    // Rondas 2 y 3: todos eligen; nadie cae en ninguna.
    for (const ronda of [2, 3]) {
      for (const { page } of jugadores) {
        await expect(page.getByText(`Ronda ${ronda} de 3`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
        await expect(buscador(page)).toBeVisible({ timeout: 20_000 });
        await elegirPokemon(page, 'Pikachu');
      }
    }
    const clasificacion = host.page.getByRole('list', { name: 'Clasificación' });
    await expect(clasificacion).toBeVisible({ timeout: 30_000 });
    await expect(clasificacion.getByRole('listitem')).toHaveCount(3);
    await expect(host.page.getByText('Pokédex Distance · Por puntos', { exact: false }).first()).toBeVisible();
    await expect(host.page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'juego-modo-por-puntos-resultados', { sigue: clasificacion, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
