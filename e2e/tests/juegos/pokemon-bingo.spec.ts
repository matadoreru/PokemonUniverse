/**
 * E2E de Pokémon Bingo (`pokemon-bingo`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, esSelector, capturarAnotando, sinScorePop } from '../../src/juegos.js';

/** Tipos en castellano de las casillas «Tipo Fuego» (`describeBingoCondition`) → clave del catálogo. */
const TIPOS_BINGO: Record<string, string> = {
  Normal: 'normal', Fuego: 'fire', Agua: 'water', Eléctrico: 'electric', Planta: 'grass', Hielo: 'ice', Lucha: 'fighting', Veneno: 'poison', Tierra: 'ground',
  Volador: 'flying', Psíquico: 'psychic', Bicho: 'bug', Roca: 'rock', Fantasma: 'ghost', Dragón: 'dragon', Siniestro: 'dark', Acero: 'steel', Hada: 'fairy',
};

/** El tablero propio de Bingo (las casillas son conmutadores con la condición y el estado en su nombre). */
const tableroBingo = (page: Page) => page.getByRole('group', { name: 'Tu tablero: elige una casilla' });

const casillaBingo = (page: Page, indice: number) => tableroBingo(page).locator('[data-bingo-cell]').nth(indice);

/** Tipo de cada casilla del tablero propio (solo con la familia «Tipo»: una condición «Tipo X» por casilla). */
async function tiposDeCasillas(page: Page): Promise<string[]> {
  const nombres = await tableroBingo(page).locator('[data-bingo-cell]').evaluateAll((cartas) => cartas.map((carta) => carta.getAttribute('aria-label') ?? ''));
  return nombres.map((nombre) => {
    const tipo = /^Casilla \d+: Tipo (\S+)\./.exec(nombre)?.[1] ?? '';
    const clave = TIPOS_BINGO[tipo];
    if (!clave) throw new Error(`Casilla sin un tipo conocido: «${nombre}»`);
    return clave;
  });
}

/** Pokémon por defecto del catálogo con sus tipos, de la BD (solo los ids que da el buscador, con nombre único). */
function pokemonBingoEnBd(catalogo: ReadonlyArray<{ id: string; name: string }>): Array<{ name: string; types: string[] }> {
  const filas = psql(`SELECT id, array_to_string(types, ',') FROM "Pokemon" WHERE "isDefault" AND id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`, { ids: catalogo.map((p) => p.id).join(',') });
  const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
  const repetidos = new Set(catalogo.map((p) => p.name).filter((nombre, i, todos) => todos.indexOf(nombre) !== i));
  return filas.split('\n').filter(Boolean).map((fila) => { const [id, tipos] = fila.split('|') as [string, string]; return { name: nombres.get(id) ?? '', types: tipos.split(',').filter(Boolean) }; })
    .filter((p) => p.name && !repetidos.has(p.name));
}

/** Un Pokémon distinto por casilla que cumpla su tipo (búsqueda con vuelta atrás); `null` si no hay reparto. */
function repartoBingo(tipos: readonly string[], pokemon: ReadonlyArray<{ name: string; types: string[] }>, fijos: ReadonlyMap<number, string> = new Map()): string[] | null {
  const reparto: string[] = [];
  const usados = new Set<string>(fijos.values());
  const colocar = (i: number): boolean => {
    if (i === tipos.length) return true;
    const fijo = fijos.get(i);
    if (fijo) { reparto[i] = fijo; return colocar(i + 1); }
    for (const p of pokemon) {
      if (usados.has(p.name) || !p.types.includes(tipos[i]!)) continue;
      usados.add(p.name); reparto[i] = p.name;
      if (colocar(i + 1)) return true;
      usados.delete(p.name);
    }
    return false;
  };
  return colocar(0) ? reparto : null;
}

/** Elige la casilla `indice` y busca `nombre` en el buscador de al lado (sin esperar la respuesta del servidor). */
async function elegirEnBingo(page: Page, indice: number, nombre: string): Promise<void> {
  await casillaBingo(page, indice).click();
  await expect(casillaBingo(page, indice)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bingo-cooldown')).toHaveCount(0, { timeout: 5_000 });
  await page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${indice + 1}` }).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/** Coloca `nombre` en la casilla `indice` (válido y sin moverlo de otra) y espera a verlo en ella. */
async function colocarEnBingo(page: Page, indice: number, nombre: string): Promise<void> {
  await elegirEnBingo(page, indice, nombre);
  // Con el bingo el tablero pasa a ser de solo lectura (sin nombre de botón): se mira el estado y el texto.
  await expect(casillaBingo(page, indice)).toHaveAttribute('data-filled', 'true', { timeout: 10_000 });
  await expect(casillaBingo(page, indice)).toContainText(nombre);
}

/** Configura Bingo: solo la Gen 1, solo la familia «Tipo», el tablero y el tiempo dados. */
async function configurarBingo(page: Page, { anchura, altura, soloTipo, teclasTiempo }: { anchura: number; altura: number; soloTipo: boolean; teclasTiempo: readonly string[] }): Promise<void> {
  await page.getByRole('tab', { name: 'Configuración' }).click();
  for (const [grupo, valor] of [['Anchura del tablero', anchura], ['Altura del tablero', altura]] as const) {
    const opcion = page.getByRole('radiogroup', { name: grupo }).getByRole('radio', { name: String(valor), exact: true });
    await opcion.click();
    await expect(opcion).toHaveAttribute('aria-checked', 'true');
  }
  if (soloTipo) {
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const familias = page.getByRole('group', { name: /^Familias: / }).getByRole('switch');
    for (let i = 0; i < await familias.count(); i++) {
      const familia = familias.nth(i);
      const tipo = (await familia.innerText()).trim() === 'Tipo';
      if ((await familia.getAttribute('aria-checked') === 'true') !== tipo) await familia.click();
      await expect(familia).toHaveAttribute('aria-checked', tipo ? 'true' : 'false');
    }
  }
  const tiempo = page.getByRole('slider', { name: 'Tiempo total' });
  await tiempo.focus();
  for (const tecla of teclasTiempo) await tiempo.press(tecla);
  await tiempo.blur();
  await page.getByRole('tab', { name: 'Minijuegos' }).click();
}

/**
 * Pokémon Bingo jugado sin azar: un tablero 3×2 de la Gen 1 con solo la familia «Tipo» (cada casilla, «Tipo X») y 90 s.
 * Los Pokémon válidos salen de la BD (sus tipos) cruzados con el catálogo del buscador. Se prueba un fallo (la espera y
 * el anuncio), mover un Pokémon ya colocado con el diálogo (cancelar y confirmar), la búsqueda junto a la casilla, el
 * tablero de un rival en su diálogo, el bingo (cut-in, el ganador y «Saltar y continuar» del host) y la clasificación
 * con el tablero final y «Podías usar». A 390×844 la condición de la casilla elegida y el buscador se ven sin desplazar.
 */
test('pokemon-bingo: casillas con el buscador, un fallo, mover con diálogo, un rival, el bingo y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokémon Bingo');
    await configurarBingo(host.page, { anchura: 3, altura: 2, soloTipo: true, teclasTiempo: ['Home', 'ArrowRight'] });
    await expect(host.page.getByRole('alert').filter({ hasText: /familia|condiciones distintas/ })).toHaveCount(0);

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    const selectorPrimero = primero.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    await selectorPrimero;
    for (const { page } of jugadores) await expect(tableroBingo(page).locator('[data-bingo-cell]')).toHaveCount(6, { timeout: 20_000 });
    const pokemon = pokemonBingoEnBd(catalogo);
    const tipos = await tiposDeCasillas(host.page);
    const reparto = repartoBingo(tipos, pokemon);
    expect(reparto, `reparto para ${tipos.join(', ')}`).not.toBeNull();
    test.info().annotations.push({ type: 'bingo', description: `casillas: ${tipos.join(', ')} · reparto: ${reparto!.join(', ')}` });

    // A 390×844 sin desplazar: la condición de la casilla elegida y el buscador (en la placa pegada al fondo).
    const movil = segundo.page;
    await movil.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    const condicion = movil.locator('#guess-plate-title');
    const tiposMovil = await tiposDeCasillas(movil);
    await expect(condicion).toHaveText(`Tipo ${Object.entries(TIPOS_BINGO).find(([, clave]) => clave === tiposMovil[0])![0]}`);
    await expect(condicion, 'condición de la casilla elegida a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('textbox', { name: 'Buscar Pokémon para la casilla 1' }), 'buscador a la vista a 390×844').toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('timer'), 'tiempo a la vista a 390×844').toBeInViewport({ ratio: 1 });
    // Elegir otra casilla (más abajo en el tablero) cambia la condición de la placa, que sigue a la vista.
    await casillaBingo(movil, 5).click();
    await expect(condicion).toHaveText(`Tipo ${Object.entries(TIPOS_BINGO).find(([, clave]) => clave === tiposMovil[5])![0]}`);
    await expect(condicion).toBeInViewport({ ratio: 1 });
    await expect(movil.getByRole('textbox', { name: 'Buscar Pokémon para la casilla 6' })).toBeInViewport({ ratio: 1 });
    await movil.setViewportSize({ width: 1280, height: 720 });

    // Un fallo: un Pokémon sin el tipo de la primera casilla. Se ve la espera y la región viva lo dice una vez.
    const fallo = pokemon.find((p) => !p.types.includes(tipos[0]!))!.name;
    await elegirEnBingo(host.page, 0, fallo);
    await expect(host.page.getByTestId('bingo-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(host.page.getByRole('status').filter({ hasText: new RegExp(`^Incorrecto: ${fallo} no cumple esta casilla\\. Hay una breve espera`) })).toHaveCount(1);
    await expect(host.page.getByTestId('pokemon-bingo-screen').locator('[aria-live]')).toHaveCount(1);
    await expect(host.page.getByTestId('bingo-feedback')).toHaveText(`${fallo} no cumple esta casilla.`, { timeout: 5_000 });
    await expect(casillaBingo(host.page, 0)).toHaveAttribute('data-filled', 'false');

    // Mover con el diálogo: un Pokémon que vale para dos casillas, colocado en la otra; si no hay, uno que no vale (el
    // servidor lo rechaza como un fallo y no se mueve).
    let origen = 0; let destino = 1; let movido = reparto![0]!; let valido = false;
    for (let j = 0; j < tipos.length && !valido; j++) {
      for (let i = 0; i < tipos.length; i++) {
        if (i !== j && pokemon.find((p) => p.name === reparto![j])!.types.includes(tipos[i]!)) { origen = i; destino = j; movido = reparto![j]!; valido = true; break; }
      }
    }
    test.info().annotations.push({ type: 'bingo', description: `mover ${movido} de la casilla ${origen + 1} a la ${destino + 1} (${valido ? 'válido' : 'no vale: fallo'})` });
    await colocarEnBingo(host.page, origen, movido);
    // Tras colocar, el buscador se vuelve a montar vacío y, con ratón o teclado (`pointer: fine`), toma el foco: el
    // jugador sigue escribiendo sin que caiga al `body`. En táctil no lo toma (abriría el teclado) y el foco va al
    // título de la placa (`bingoFocusKey`, cubierto en `PokemonBingoGame.test.tsx`).
    const buscador = host.page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${origen + 1}` });
    await expect(buscador, 'el foco no cae al body tras colocar').toBeFocused();
    await expect(buscador).toHaveValue('');
    await elegirEnBingo(host.page, destino, movido);
    const mover = host.page.getByRole('dialog', { name: `¿Mover a ${movido}?` });
    await expect(mover).toBeVisible();
    await expect(mover).toContainText(`${movido} ya está usado en «`);
    await expect(mover.getByRole('button', { name: 'Mover aquí' })).toBeFocused();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-mover', { sigue: mover });
    await mover.getByRole('button', { name: 'Cancelar' }).click();
    await expect(mover).toBeHidden();
    await expect(casillaBingo(host.page, origen)).toHaveAttribute('data-filled', 'true');
    await expect(casillaBingo(host.page, destino)).toHaveAttribute('data-filled', 'false');
    await host.page.getByRole('button', { name: movido, exact: true }).click();
    await expect(mover).toBeVisible();
    await mover.getByRole('button', { name: 'Mover aquí' }).click();
    await expect(mover).toBeHidden();
    if (valido) {
      await expect(casillaBingo(host.page, destino)).toHaveAttribute('data-filled', 'true', { timeout: 10_000 });
      await expect(casillaBingo(host.page, origen)).toHaveAttribute('data-filled', 'false');
    } else {
      await expect(host.page.getByTestId('bingo-cooldown')).toBeVisible({ timeout: 5_000 });
      await expect(casillaBingo(host.page, origen)).toHaveAttribute('data-filled', 'true');
    }

    // El resto del reparto (con lo ya colocado): todas menos la última, que se deja para la búsqueda.
    const colocados = new Map<number, string>([[valido ? destino : origen, movido]]);
    const resto = repartoBingo(tipos, pokemon, colocados);
    expect(resto, 'reparto con el Pokémon movido').not.toBeNull();
    const pendientes = resto!.map((nombre, i) => ({ nombre, i })).filter(({ i }) => !colocados.has(i));
    const ultima = pendientes.pop()!;
    for (const { nombre, i } of pendientes) await colocarEnBingo(host.page, i, nombre);
    // Quitar y volver a poner: «Quitar Pokémon» vacía la casilla elegida.
    const { nombre: quitado, i: casillaQuitada } = pendientes[0] ?? { nombre: movido, i: valido ? destino : origen };
    await casillaBingo(host.page, casillaQuitada).click();
    await host.page.getByRole('button', { name: 'Quitar Pokémon' }).click();
    await expect(casillaBingo(host.page, casillaQuitada)).toHaveAttribute('data-filled', 'false', { timeout: 10_000 });
    await colocarEnBingo(host.page, casillaQuitada, quitado);
    await expect(host.page.getByTestId('bingo-progress')).toHaveText('Tu progreso · 5/6');

    // Un rival coloca uno en su tablero; el anfitrión lo ve en su franja y abre su tablero.
    const tiposPrimero = await tiposDeCasillas(primero.page);
    const repartoPrimero = repartoBingo(tiposPrimero, pokemon)!;
    await colocarEnBingo(primero.page, 0, repartoPrimero[0]!);
    const franja = host.page.getByRole('button', { name: new RegExp(`^Ver tablero de ${primero.name}: 1/6 casillas$`) });
    await expect(franja).toBeVisible({ timeout: 10_000 });

    // El tablero con lo colocado y una casilla llena elegida («Actualmente: X» y «Quitar Pokémon»); después, la
    // búsqueda abierta junto a la última casilla, vacía.
    await casillaBingo(host.page, casillaQuitada).click();
    await expect(host.page.getByRole('button', { name: 'Quitar Pokémon' })).toBeVisible();
    await expect(host.page.getByText(`Actualmente: ${quitado}`, { exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-tablero');
    await casillaBingo(host.page, ultima.i).click();
    await host.page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${ultima.i + 1}` }).fill(ultima.nombre.slice(0, 3));
    await expect(host.page.getByRole('button', { name: ultima.nombre, exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-busqueda');
    await host.page.getByRole('textbox', { name: `Buscar Pokémon para la casilla ${ultima.i + 1}` }).fill('');

    await franja.click();
    const rival = host.page.getByRole('dialog', { name: `Tablero de ${primero.name}` });
    await expect(rival).toBeVisible();
    await expect(rival.locator('[data-bingo-cell]')).toHaveCount(6);
    await expect(rival.locator('[data-bingo-cell][data-filled="true"]')).toHaveCount(1);
    await expect(rival.getByText(repartoPrimero[0]!, { exact: true })).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-bingo-rival', { sigue: rival });
    await rival.getByRole('button', { name: 'Cerrar' }).click();
    await expect(rival).toBeHidden();

    // El bingo: el cut-in, el ganador para todos, la cuenta atrás y «Saltar y continuar» solo para el host.
    await colocarEnBingo(host.page, ultima.i, ultima.nombre);
    const cutin = host.page.locator('[data-layer="cutin"]').filter({ hasText: '¡BINGO!' });
    await expect(cutin).toBeVisible({ timeout: 5_000 });
    await host.page.screenshot({ path: 'screenshots/juego-pokemon-bingo-cutin-1280x720.png', animations: 'disabled' });
    const ganador = host.page.getByRole('heading', { name: '¡Has completado tu tablero!' });
    await expect(ganador).toBeVisible();
    await expect(primero.page.getByRole('heading', { name: `${host.name} ha completado el tablero` })).toBeVisible();
    await expect(primero.page.getByText('El host puede continuar antes.', { exact: false })).toBeVisible();
    await expect(primero.page.getByRole('button', { name: 'Saltar y continuar' })).toHaveCount(0);
    await expect(cutin).toHaveCount(0, { timeout: 3_000 });
    await capturarAnotando(host.page, 'juego-pokemon-bingo-bingo', ganador);

    await host.page.getByRole('button', { name: 'Saltar y continuar' }).click();
    const clasificacion = host.page.getByRole('heading', { name: `Bingo de ${host.name}` });
    await expect(clasificacion).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/^6\/6 casillas · \d+ correctos? · \d+ fallos? · bingo en \d+:\d\d$/)).toHaveCount(1);
    await expect(host.page.getByText(/^\d\/6 casillas · \d+ correctos? · \d+ fallos?$/)).toHaveCount(2);
    // El tablero final de un rival: sus casillas vacías dicen qué valía.
    await host.page.getByRole('tab', { name: new RegExp(primero.name) }).click();
    await expect(host.page.getByRole('tabpanel').getByText('Podías usar').first()).toBeVisible();
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-bingo-clasificacion', { sigue: clasificacion });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

/** Un tablero 5×5: cabe en escritorio sin scroll de página (el tablero se desplaza dentro de su panel) y en el móvil. */
test('pokemon-bingo: un tablero 5×5 cabe sin scroll de página', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Bingo');
    await configurarBingo(host.page, { anchura: 5, altura: 5, soloTipo: false, teclasTiempo: ['End'] });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    await expect(tableroBingo(host.page).locator('[data-bingo-cell]')).toHaveCount(25, { timeout: 20_000 });
    await capturarTamanos(host.page, 'juego-pokemon-bingo-5x5');
    for (const { w, h } of SIZES) {
      await host.page.setViewportSize({ width: w, height: h });
      const scroll = await tableroBingo(host.page).evaluate((tablero) => { const cuerpo = tablero.parentElement!; return { alto: cuerpo.scrollHeight, visible: cuerpo.clientHeight }; });
      test.info().annotations.push({ type: 'bingo', description: `5×5 a ${w}×${h}: tablero ${scroll.alto}px en un panel de ${scroll.visible}px` });
      await expect(host.page.locator('#guess-plate-title'), `${w}×${h}: condición a la vista`).toBeInViewport({ ratio: 1 });
      await expect(host.page.getByRole('textbox', { name: 'Buscar Pokémon para la casilla 1' }), `${w}×${h}: buscador a la vista`).toBeInViewport({ ratio: 1 });
    }
    await host.page.setViewportSize({ width: 1280, height: 720 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
