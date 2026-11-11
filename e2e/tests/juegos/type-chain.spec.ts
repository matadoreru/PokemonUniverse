/**
 * E2E de Type Chain (`type-chain`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, psql, esperarPartida, seleccionarJuego, SIZES } from '../../src/helpers.js';
import { capturarTamanos, primeraVisible, esSelector, sinScorePop } from '../../src/juegos.js';

/** Tipos de los Pokémon dados, de la BD (para saber qué Pokémon vale en la cadena de Type Chain). */
function tiposEnBd(ids: readonly string[]): Map<string, string[]> {
  const filas = psql(`SELECT id, array_to_string(types, ',') FROM "Pokemon" WHERE id = ANY(string_to_array(:'ids', ',')) ORDER BY "nationalDexNumber", id;`, { ids: ids.join(',') });
  return new Map(filas.split('\n').filter(Boolean).map((fila) => { const [id, tipos] = fila.split('|') as [string, string]; return [id, tipos.split(',').filter(Boolean)]; }));
}

const BUSCADOR_CADENA = /^Buscar Pokémon de tipo (.+)$/;

const buscadorCadena = (page: Page) => page.getByRole('textbox', { name: BUSCADOR_CADENA });

/** Elige un Pokémon con el buscador de Type Chain. */
async function encadenar(page: Page, nombre: string): Promise<void> {
  await buscadorCadena(page).fill(nombre, { timeout: 20_000 });
  await page.getByRole('button', { name: nombre, exact: true }).click({ timeout: 10_000 });
}

/**
 * Type Chain sin red: tres jugadores, Gen 1 y turnos de 30 s. Quien tenga el turno (con el foco ya en el buscador)
 * prueba primero un Pokémon de otro tipo (el motivo, la espera y el fallo público) y luego uno del tipo de la cadena,
 * buscados en la BD con el tipo leído de su `TypeBadge`. Los otros dos dejan pasar su turno: el primero cae
 * eliminado (se ve en texto) y, al caer el segundo, queda un superviviente y sale la clasificación. Type Chain no tiene
 * revelación: la «revelación» es la franja del último movimiento.
 */
test('type-chain: un fallo, un eslabón válido, dos eliminaciones por tiempo y la clasificación', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Type Chain');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const boton = host.page.getByRole('button', { name: `Gen ${gen}`, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    const treinta = host.page.getByRole('radiogroup', { name: 'Tiempo por turno' }).getByRole('radio', { name: '30s' });
    await treinta.click();
    await expect(treinta).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();

    const selector = host.page.waitForResponse(esSelector, { timeout: 30_000 });
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(pages);
    const { pokemon: catalogo } = await (await selector).json() as { pokemon: Array<{ id: string; name: string }> };
    const tipos = tiposEnBd(catalogo.map((p) => p.id));
    expect(tipos.size, 'Pokémon de la Gen 1 con tipos').toBeGreaterThan(50);

    // Quien tiene el turno ve el buscador; el resto, a quién se espera.
    const turno = await primeraVisible(pages, buscadorCadena);
    const otros = pages.filter((page) => page !== turno);
    // Al empezar tu turno el foco ya está en el buscador: se escribe sin pulsar nada.
    await expect(buscadorCadena(turno)).toBeFocused();
    const actual = (await buscadorCadena(turno).getAttribute('aria-label'))!.replace(BUSCADOR_CADENA, '$1');
    const carta = turno.getByTestId('type-chain-type');
    await expect(carta).toContainText(actual);
    const tipoCadena = (await carta.locator('[data-type]').getAttribute('data-type'))!;
    expect(tipoCadena).toBeTruthy();
    for (const page of otros) await expect(page.getByRole('heading', { name: /^Esperando a .+…$/ })).toBeVisible();
    await expect(turno.getByRole('heading', { name: '¡Tu turno!', level: 1 })).toBeVisible();

    const delTipo = (id: string) => (tipos.get(id) ?? []).includes(tipoCadena);
    const nombre = (id: string) => catalogo.find((p) => p.id === id)!.name;
    const ids = [...tipos.keys()].filter((id) => !/[-(]/.test(nombre(id)));
    const fallo = ids.find((id) => !delTipo(id))!;
    const validos = ids.filter(delTipo);
    expect(fallo && validos.length > 0, 'hay un fallo seguro y un Pokémon del tipo').toBe(true);
    test.info().annotations.push({ type: 'type-chain', description: `tipo ${actual} (${tipoCadena}) · fallo ${nombre(fallo)} · válido ${nombre(validos[0]!)}` });

    // La pantalla del turno a los tres tamaños y, a 390×844, el tipo de la cadena y el buscador a la vista sin desplazar.
    await capturarTamanos(turno, 'juego-type-chain-turno', { sigue: buscadorCadena(turno) });
    await turno.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
    await turno.evaluate(() => window.scrollTo(0, 0));
    await expect(carta).toBeInViewport({ ratio: 1 });
    await expect(buscadorCadena(turno)).toBeInViewport({ ratio: 1 });
    await expect(turno.getByRole('timer')).toBeInViewport({ ratio: 1 });
    await buscadorCadena(turno).fill('a');
    await expect(turno.locator('.pokemon-selector-results button').first()).toBeInViewport({ ratio: 1 });
    await buscadorCadena(turno).fill('');
    await turno.setViewportSize({ width: 1280, height: 720 });

    // Un fallo: el motivo en texto, la espera (vista) y el aviso en la única región viva; el resto lo ve en los fallos.
    await encadenar(turno, nombre(fallo));
    await expect(turno.getByTestId('type-chain-cooldown')).toBeVisible({ timeout: 5_000 });
    await expect(turno.getByRole('status').filter({ hasText: new RegExp(`^Incorrecto: ${nombre(fallo)}\\. No es del tipo de la cadena\\.`) })).toHaveCount(1);
    // Una sola región viva en la pantalla del juego (el armazón de la sala tiene las suyas: avisos y cut-ins).
    await expect(turno.getByTestId('type-chain-screen').locator('[aria-live]')).toHaveCount(1);
    for (const page of otros) await expect(page.getByTestId('type-chain-attempt').filter({ hasText: nombre(fallo) })).toHaveCount(1, { timeout: 5_000 });
    await expect(turno.getByTestId('type-chain-cooldown')).toHaveCount(0, { timeout: 5_000 });
    await expect(turno.getByTestId('type-chain-reason')).toContainText('No es del tipo de la cadena.');

    // Un Pokémon del tipo (si el servidor lo saca del pool, el siguiente candidato).
    let puesto = '';
    for (const id of validos.slice(0, 4)) {
      await expect(turno.getByTestId('type-chain-cooldown')).toHaveCount(0, { timeout: 5_000 });
      await encadenar(turno, nombre(id));
      const ok = await turno.getByTestId('type-chain-event').filter({ hasText: `nombra a ${nombre(id)}` }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      if (ok) { puesto = nombre(id); break; }
    }
    expect(puesto, 'un Pokémon del tipo entra en la cadena').not.toBe('');
    // El foco no cae al body al desmontarse el buscador: va al título de la placa.
    await expect(turno.locator('#guess-plate-title')).toBeFocused();
    await expect(turno.getByTestId('type-chain-link')).toHaveCount(1);
    await expect(turno.getByTestId('type-chain-link').first()).toContainText(puesto);
    await expect(turno.getByTestId('type-chain-type')).toContainText('1 Pokémon nombrado');
    // La «revelación» de Type Chain: la franja del último movimiento, a los tres tamaños.
    const segundo = await primeraVisible(otros, buscadorCadena);
    // El siguiente también recibe el foco en el buscador al empezar su turno.
    await expect(buscadorCadena(segundo)).toBeFocused();
    const tercero = otros.find((page) => page !== segundo)!;
    await capturarTamanos(tercero, 'juego-type-chain-movimiento', { sigue: tercero.getByTestId('type-chain-event').filter({ hasText: `nombra a ${puesto}` }) });

    // El segundo deja pasar su turno: cae eliminado y lo dice en texto (su placa y la lista de jugadores).
    await expect(segundo.getByRole('heading', { name: 'Observas la cadena' })).toBeVisible({ timeout: 40_000 });
    await expect(segundo.getByText('Eliminado: se le acabó el tiempo')).toBeVisible();
    await expect(turno.getByTestId('type-chain-player').filter({ hasText: /Eliminado.*Se le acabó el tiempo/ })).toHaveCount(1);
    await expect(turno.getByTestId('type-chain-event').filter({ hasText: 'queda eliminado' })).toBeVisible();
    await capturarTamanos(segundo, 'juego-type-chain-eliminado', { sigue: segundo.getByRole('heading', { name: 'Observas la cadena' }) });

    // Cae el tercero: queda uno y sale la clasificación.
    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 40_000 });
    await expect(host.page.getByText('Sigue en pie')).toHaveCount(1);
    await expect(host.page.getByText(/^Eliminado [12]\.º$/)).toHaveCount(2);
    await expect(host.page.getByText(/Cayó: se le acabó el tiempo/)).toHaveCount(2);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-type-chain-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
