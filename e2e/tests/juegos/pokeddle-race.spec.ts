/**
 * E2E de Pokédle Race (`pokeddle-race`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { JAVA_WS, capturarTamanos, esSelector, capturarAnotando, buscadorRespuesta, adivinar, juegoEnTrama, sinScorePop, textoDeMain } from '../../src/juegos.js';

/** Lo que el test lee del estado público de Pokédle Race. */
interface PokeddleVisible {
  phase: string;
  roundNumber: number;
  boards: Record<string, {
    rows: Array<{ round: number; status: string; guessedPokemon: { id: string; name: string } | null; correct: boolean; feedback: Record<string, { kind: string; value: unknown; result: string }> | null }>;
    solved: boolean;
    revealedPokemon: { id: string; name: string } | null;
  }>;
}

/** Datos de un Pokémon del pool de Pokédle (Gen 1 con altura, peso y etapa evolutiva, como filtra el motor). */
interface FichaPokeddle { id: string; generation: number; dexNumber: number; types: string[]; hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number; baseStatTotal: number; height: number; weight: number; evolutionStage: number }

function fichasPokeddle(ids: readonly string[]): FichaPokeddle[] {
  const filas = psql(
    `SELECT id, generation, "nationalDexNumber", array_to_string(types, ','), hp, attack, defense, "specialAttack", "specialDefense", speed, "baseStatTotal", "heightDecimeters", "weightHectograms", "evolutionStage"
     FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) AND "heightDecimeters" > 0 AND "weightHectograms" > 0 AND "evolutionStage" IS NOT NULL AND "evolutionStages" IS NOT NULL
     ORDER BY "nationalDexNumber", id;`,
    { ids: ids.join(',') },
  );
  return filas.split('\n').filter(Boolean).map((fila) => {
    const [id, generation, dexNumber, types, ...numeros] = fila.split('|') as [string, string, string, string, ...string[]];
    const [hp, attack, defense, specialAttack, specialDefense, speed, baseStatTotal, height, weight, evolutionStage] = numeros.map(Number) as number[];
    return { id, generation: Number(generation), dexNumber: Number(dexNumber), types: types.split(',').filter(Boolean), hp: hp!, attack: attack!, defense: defense!, specialAttack: specialAttack!, specialDefense: specialDefense!, speed: speed!, baseStatTotal: baseStatTotal!, height: height!, weight: weight!, evolutionStage: evolutionStage! };
  });
}

/** Como el motor (`rules.ts`): `HIGHER` si el secreto es mayor que el intento. */
const compararPokeddle = (intento: number, secreto: number) => (secreto > intento ? 'HIGHER' : secreto < intento ? 'LOWER' : 'MATCH');

/** ¿Pudo ser `ficha` el secreto, dadas las pistas de las filas ya cerradas? */
function encajaPokeddle(ficha: FichaPokeddle, filas: PokeddleVisible['boards'][string]['rows']): boolean {
  return filas.every((fila) => {
    if (fila.status !== 'GUESS' || !fila.feedback) return true;
    if (!fila.correct && fila.guessedPokemon?.id === ficha.id) return false;
    return Object.entries(fila.feedback).every(([clave, pista]) => {
      if (pista.kind === 'TYPES') {
        const intento = new Set(pista.value as string[]); const secreto = new Set(ficha.types);
        const resultado = intento.size === secreto.size && [...intento].every((tipo) => secreto.has(tipo)) ? 'EXACT' : [...intento].some((tipo) => secreto.has(tipo)) ? 'PARTIAL' : 'NONE';
        return resultado === pista.result;
      }
      if (pista.kind === 'EVOLUTION') return compararPokeddle((pista.value as { stage: number }).stage, ficha.evolutionStage) === pista.result;
      if (pista.kind !== 'NUMERIC') return true;
      const valor = clave === 'typeCount' ? ficha.types.length : (ficha as unknown as Record<string, number>)[clave];
      return valor === undefined || compararPokeddle(pista.value as number, valor) === pista.result;
    });
  });
}

/**
 * Pokédle Race sin red ni respuesta conocida: tres rondas de 30 s (Gen 1, las pistas por defecto). En cada una el host
 * prueba el candidato central (por número de Pokédex) entre los Pokémon del pool que encajan con las pistas ya
 * recibidas, buscados en la BD: las dos primeras son intentos normales y la tercera suele acertar (no se exige: si no,
 * la partida termina igual al agotar las rondas). Los invitados responden algo cada ronda para que se cierre en el acto.
 * Capturas: el tablero con intentos, la ronda cerrada (una por ronda y tamaño: dura 3 s) y la clasificación.
 */
test('pokeddle-race: tres rondas con intentos, las pistas de cada ronda y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokédle Race');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    for (const [nombre, teclas, valor] of [['Máximo de rondas', ['Home', 'ArrowRight', 'ArrowRight'], '3'], ['Tiempo por ronda', ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'], '30']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await expect(host.page.getByRole('switch', { name: 'Altura' })).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    let estado: PokeddleVisible | null = null;
    for (const ws of host.sockets.filter((s) => JAVA_WS.test(s.url()))) ws.on('framereceived', ({ payload }) => { estado = juegoEnTrama<PokeddleVisible>(payload, 'pokeddle-race') ?? estado; });
    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const nombres = new Map(catalogo.map((p) => [p.id, p.name]));
    const fichas = fichasPokeddle(catalogo.map((p) => p.id));
    expect(fichas.length, 'Pokémon de la Gen 1 con datos completos').toBeGreaterThan(50);
    const relleno = [nombres.get(fichas[0]!.id)!, nombres.get(fichas[1]!.id)!];

    const tablero = host.page.getByRole('region', { name: 'Tablero de intentos' });
    await expect(buscadorRespuesta(host.page)).toBeVisible({ timeout: 20_000 });
    // El vacío enseña a jugar; la carrera es una franja por jugador.
    await expect(host.page.getByText('Tu primer intento aparecerá aquí.')).toBeVisible();
    await expect(host.page.getByRole('list', { name: 'Cómo leer el tablero' })).toBeVisible();
    await expect(host.page.getByTestId('pokeddle-race-row')).toHaveCount(3);

    /** Cada invitado sin resolver responde su relleno en la ronda; devuelve cuántos respondieron. */
    const rellenarRonda = async (ronda: number): Promise<number> => {
      let enviados = 0;
      for (const [index, invitado] of [primero, segundo].entries()) {
        const buscador = invitado.page.getByRole('textbox', { name: `Buscar respuesta para la ronda ${ronda}` });
        const encontrado = invitado.page.getByRole('heading', { name: '¡Pokémon encontrado!' });
        await expect(buscador.or(encontrado).first()).toBeVisible({ timeout: 20_000 });
        if (!await buscador.isVisible()) continue;
        await adivinar(invitado.page, relleno[index]!);
        await expect(invitado.page.getByRole('heading', { name: `${relleno[index]} enviado` }).or(invitado.page.getByRole('heading', { name: /^Pistas de la ronda|^Clasificación final$/ })).first()).toBeVisible({ timeout: 5_000 });
        enviados += 1;
      }
      return enviados;
    };
    let hostId = '';
    const probados: string[] = [];
    const textos: string[] = [];
    let resuelto = false;
    for (const ronda of [1, 2, 3]) {
      if (resuelto) {
        // El host ya lo encontró: solo responden los invitados (que no lo hayan resuelto) para cerrar las rondas.
        await rellenarRonda(ronda);
        continue;
      }
      await expect(buscadorRespuesta(host.page)).toHaveAccessibleName(`Buscar respuesta para la ronda ${ronda}`, { timeout: 20_000 });
      const filas = hostId ? (estado as PokeddleVisible | null)?.boards[hostId]?.rows ?? [] : [];
      const encajan = fichas.filter((ficha) => encajaPokeddle(ficha, filas));
      expect(encajan.length, `ronda ${ronda}: ningún Pokémon encaja con las pistas`).toBeGreaterThan(0);
      // Ronda 2: un fallo seguro (no encaja con las pistas de la 1), así siempre se llega a la 3 con dos intentos; en la 1 y
      // la 3, el candidato central de los que encajan (en la 1, todo el pool: acertar es cuestión de suerte y se anota).
      const fallo = fichas.find((ficha) => !encajaPokeddle(ficha, filas) && !probados.includes(nombres.get(ficha.id)!) && !relleno.includes(nombres.get(ficha.id)!));
      const intento = ronda === 2 && fallo ? nombres.get(fallo.id)! : nombres.get(encajan[Math.floor(encajan.length / 2)]!.id)!;
      test.info().annotations.push({ type: 'pokeddle', description: `ronda ${ronda}: ${encajan.length} encajan → ${intento}` });

      // Los invitados responden primero: el host ve «Intento enviado» en sus franjas.
      const enviados = await rellenarRonda(ronda);
      await expect(host.page.getByTestId('pokeddle-race-row').filter({ hasText: 'Intento enviado' })).toHaveCount(enviados, { timeout: 5_000 });
      textos.push(await textoDeMain(host.page));

      if (ronda === 3) {
        // El tablero con dos intentos: capturas a los tres tamaños y, a 390×844, el último intento y el buscador a la vista.
        await expect(host.page.getByTestId('pokeddle-row')).toHaveCount(2);
        await capturarTamanos(host.page, 'juego-pokeddle-race-tablero', { sigue: buscadorRespuesta(host.page) });
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        const ultimo = host.page.locator('[data-testid="pokeddle-row"][data-latest="true"]');
        await expect(ultimo).toBeInViewport({ ratio: 1 });
        await expect(buscadorRespuesta(host.page)).toBeInViewport({ ratio: 1 });
        // Nada lo tapa (la pantalla inferior va pegada al fondo): el pie del último intento es suyo.
        expect(await ultimo.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 4)); })).toBe(true);
        // Buscando (la bandeja abierta): el primer resultado y el último intento (su Pokémon y la primera línea de pistas) a la vista.
        await buscadorRespuesta(host.page).fill('a');
        const primerResultado = host.page.locator('.pokemon-selector-results button').first();
        await expect(primerResultado).toBeInViewport({ ratio: 1 });
        for (const parte of [ultimo.locator('img').first(), ultimo.locator('[data-clue-key]').first()]) {
          expect(await parte.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })).toBe(true);
        }
        await host.page.setViewportSize({ width: 1280, height: 720 });
        await buscadorRespuesta(host.page).fill('');
        // El tablero completo de un rival (lo público: sus intentos y pistas), en un diálogo abierto desde su franja.
        const verRival = host.page.getByRole('button', { name: new RegExp(`^Ver tablero de ${primero.name}`) });
        await verRival.click();
        const dialogo = host.page.getByRole('dialog', { name: `Tablero de ${primero.name}` });
        await expect(dialogo).toBeVisible();
        await expect(dialogo.getByTestId('pokeddle-row')).toHaveCount(2);
        await expect(dialogo.getByTestId('pokeddle-row').first()).toContainText(relleno[0]!);
        await expect(dialogo.getByRole('list', { name: 'Cómo leer el tablero' })).toBeVisible();
        await capturarTamanos(host.page, 'juego-pokeddle-race-rival', { sigue: dialogo });
        await host.page.keyboard.press('Escape');
        await expect(dialogo).toBeHidden();
        await expect(verRival).toBeFocused();
        // A 1280×720 el tablero se desplaza dentro de su panel, nunca la página.
        expect(await tablero.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }

      await adivinar(host.page, intento);
      probados.push(intento);
      const cerrada = host.page.getByRole('heading', { name: new RegExp(`^(Pistas de la ronda ${ronda}|¡Era .+!)$`), level: 1 });
      await expect(cerrada).toBeVisible({ timeout: 10_000 });
      textos.push(await textoDeMain(host.page));
      if (!hostId) {
        await expect.poll(() => Object.entries((estado as PokeddleVisible | null)?.boards ?? {}).find(([, b]) => b.rows[0]?.guessedPokemon?.name === intento)?.[0] ?? '', { timeout: 5_000 }).not.toBe('');
        hostId = Object.entries((estado as unknown as PokeddleVisible).boards).find(([, b]) => b.rows[0]?.guessedPokemon?.name === intento)![0];
      }
      await expect(host.page.locator('[data-testid="pokeddle-row"][data-latest="true"]')).toContainText(intento);
      // La fila nueva: una casilla por pista con su resultado en texto para lectores.
      await expect(host.page.locator('[data-latest="true"] [data-clue-key]')).toHaveCount(13);
      await expect(host.page.locator('[data-latest="true"] [data-clue-key="attack"] .sr-only')).toHaveText(/^Ataque: \d+\. (Distinto: el secreto es (mayor|menor)|Igual)\.$/);
      resuelto = await host.page.getByRole('heading', { name: '¡Pokémon encontrado!' }).isVisible();
      if (resuelto && ronda < 3) test.info().annotations.push({ type: 'aviso', description: `acertó por suerte en la ronda ${ronda}: se saltan las capturas del tablero y del rival y las comprobaciones a 390 de la ronda 3` });
      test.info().annotations.push({ type: 'pokeddle', description: `ronda ${ronda}: ${resuelto ? 'acertado' : 'sin acertar'}` });
      // El foco va al título de la placa (no cae al body): la ronda cerrada o el Pokémon encontrado.
      if (!resuelto) await expect(host.page.getByText(`Ronda ${ronda} cerrada`, { exact: true })).toBeVisible();
      await expect(host.page.locator('#guess-plate-title')).toBeFocused();
      // La ronda cerrada dura 3 s: un tamaño por ronda.
      await capturarAnotando(host.page, `juego-pokeddle-race-ronda-${ronda}`, cerrada, [SIZES[ronda - 1]!]);
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 70_000 });
    await expect.poll(() => (estado as PokeddleVisible | null)?.phase, { timeout: 5_000 }).toBe('GAME_RESULTS');
    // Privacidad: ningún Pokémon secreto salió antes de la clasificación (salvo el que el host probó él mismo).
    const secretos = Object.values((estado as unknown as PokeddleVisible).boards).map((b) => b.revealedPokemon?.name).filter((n): n is string => Boolean(n));
    expect(secretos).toHaveLength(3);
    // Palabra completa: el secreto «Pidgeot» no debe chocar con un intento «Pidgeotto».
    const palabra = (nombre: string) => new RegExp(`(^|[^\\p{L}])${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    for (const nombre of secretos.filter((n) => !probados.includes(n) && !relleno.includes(n))) for (const texto of textos) expect(texto).not.toMatch(palabra(nombre));
    for (const nombre of secretos) await expect(host.page.locator('main')).toContainText(nombre);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokeddle-race-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
