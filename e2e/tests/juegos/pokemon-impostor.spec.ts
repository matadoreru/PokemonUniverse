/**
 * E2E de Pokémon Impostor (`pokemon-impostor`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { animacionDe, conMovimiento, crearSalaConJugadores, iniciarPartida, layoutProblems, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, primeraVisible, elegirModo, comprobarChipDeCarta, capturarMostrando, comprobarTituloDeCabecera, comprobarAlturaDeCartas } from '../../src/juegos.js';

test('pokemon-impostor: roles, pistas, votación con Saltar y victoria por tres rondas sin expulsión', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    // Cada página en un tamaño de revisión: las fases cortas (roles 5 s, recuento 3 s) se capturan a la vez en las tres.
    const ajustar = async () => { for (const [i, page] of pages.entries()) await page.setViewportSize({ width: SIZES[i]!.w, height: SIZES[i]!.h }); };
    const enParalelo = async (nombre: string) => {
      const medidas = await Promise.all(pages.map((page) => layoutProblems(page, nombre, true)));
      for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);
    };
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await ajustar();
    await esperarPartida(pages);

    // Reparto de roles: cada uno ve el suyo; el impostor, sin el Pokémon.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeVisible({ timeout: 15_000 });
    await enParalelo('juego-pokemon-impostor-rol');
    let impostores = 0;
    for (const page of pages) if (await page.getByText('No conoces el Pokémon. Intenta disimular.').isVisible()) impostores++;
    expect(impostores, 'un impostor que no conoce el Pokémon').toBe(1);

    const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
    const saltar = (page: Page) => page.getByRole('button', { name: 'Saltar', exact: true });
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    let nombreProbado = false;
    for (let ronda = 1; ronda <= 3; ronda++) {
      if (ronda === 2) {
        // En el móvil el rol (y el Pokémon del inocente) se ve sin desplazar durante las pistas.
        let sinPokemon = 0;
        for (const page of pages) {
          await page.setViewportSize({ width: 390, height: 844 });
          const linea = page.getByTestId('impostor-role-strip');
          await expect(linea).toBeInViewport({ ratio: 1 });
          const secreto = page.locator('[data-impostor-secret]');
          if (await secreto.count()) await expect(linea).toContainText((await secreto.first().getAttribute('data-impostor-secret'))!);
          else { await expect(linea).toContainText('Impostor · no conoces el Pokémon'); sinPokemon++; }
        }
        expect(sinPokemon, 'solo el impostor no ve el Pokémon').toBe(1);
        await ajustar();
      }
      // Tres turnos de pista: cada vez, la página con el campo visible escribe y envía.
      for (let turno = 0; turno < 3; turno++) {
        const page = await primeraVisible(pages, campo);
        if (ronda === 1 && turno === 1) {
          await capturarTamanos(page, 'juego-pokemon-impostor-pistas', { sigue: campo(page) });
          await ajustar();
        }
        // Un inocente escribe el nombre del Pokémon: el campo es el dueño del error y no deja enviar. En la ronda 2,
        // fuera del turno 1 (que ya captura en la 1): de los turnos 0 y 2, al menos uno es de un inocente.
        const secreto = page.locator('[data-impostor-secret]');
        if (ronda === 2 && turno !== 1 && !nombreProbado && await secreto.count()) {
          nombreProbado = true;
          await campo(page).fill(`${(await secreto.first().getAttribute('data-impostor-secret'))!}uuu`);
          await expect(page.getByText('No puedes decir el nombre del Pokémon.')).toBeVisible();
          await expect(page.getByRole('button', { name: 'Enviar pista' })).toBeDisabled();
          await capturarTamanos(page, 'juego-pokemon-impostor-pista-nombre', { sigue: campo(page) });
          await ajustar();
          await campo(page).fill('');
        }
        await campo(page).fill(`pista ${ronda}`);
        await campo(page).press('Enter');
        await expect(campo(page)).toBeHidden();
      }
      if (ronda === 2) expect(nombreProbado, 'un inocente probó el nombre del Pokémon').toBe(true);

      for (const page of pages) await expect(saltar(page)).toBeVisible({ timeout: 15_000 });
      if (ronda === 1) {
        await capturarTamanos(host.page, 'juego-pokemon-impostor-votacion', { sigue: saltar(host.page) });
        await ajustar();
      }
      for (const page of pages) {
        await saltar(page).click();
        await expect(saltar(page)).toHaveAttribute('aria-pressed', 'true');
        await confirmar(page).click();
        // La píldora desaparece al votar: el foco va al título de la placa, no se pierde en `body`.
        if (ronda === 1 && page === host.page) await expect(page.getByRole('heading', { name: 'Tu voto está bloqueado.' })).toBeFocused();
      }
      for (const page of pages) await expect(page.getByText('Se salta la votación: nadie es expulsado')).toBeVisible({ timeout: 10_000 });
      if (ronda === 1) await enParalelo('juego-pokemon-impostor-recuento');
      if (ronda < 3) await expect(host.page.getByText(`Ronda ${ronda + 1}`, { exact: true })).toBeVisible({ timeout: 15_000 });
    }

    // Tercera ronda seguida sin expulsión: ganan los impostores.
    const titulo = host.page.getByRole('heading', { name: 'Ganan los impostores' });
    await expect(titulo).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText('Tres rondas seguidas sin expulsar a nadie.')).toBeVisible();
    await capturarTamanos(host.page, 'juego-pokemon-impostor-resultados', { sigue: titulo, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test.describe('pokemon-impostor: eliminación', () => {
  // La captura cabe en la ventana de 3,2 s del cut-in con poco margen: un reintento si el equipo va lento.
  test.describe.configure({ retries: 2 });

  test('pokemon-impostor: eliminación con cut-in', async ({ browser }) => {
    test.setTimeout(150_000);
    const sala = await crearSalaConJugadores(browser, 4);
    try {
      const { host, invitados, jugadores } = sala;
      const pages = jugadores.map((j) => j.page);
      await seleccionarJuego(host.page, 'Pokémon Impostor');
      await iniciarPartida(host.page, invitados.map((j) => j.page));
      await esperarPartida(pages);

      const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
      for (let turno = 0; turno < jugadores.length; turno++) {
        const page = await primeraVisible(pages, campo);
        await campo(page).fill('pista');
        await campo(page).press('Enter');
        await expect(campo(page)).toBeHidden();
      }

      // Todos votan al primer invitado; él vota al host: 3 a 1, expulsión sin empate.
      const expulsado = invitados[0]!;
      const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
      for (const page of pages) await expect(confirmar(page)).toBeVisible({ timeout: 20_000 });
      for (const { page, name } of jugadores) {
        await page.getByRole('button', { name: name === expulsado.name ? host.name : expulsado.name, exact: true }).click();
        await confirmar(page).click();
      }

      // Resultado de la votación: el rol aún no está en ninguna parte de la página.
      const banda = (page: Page) => page.locator('[data-layer="cutin"][data-tone]');
      await expect(host.page.getByText(`${expulsado.name} recibió más votos`)).toBeVisible({ timeout: 10_000 });
      await expect(banda(host.page)).toHaveCount(0);
      await expect(host.page.getByText(/era (impostor|inocente|IMPOSTOR|INOCENTE)/)).toHaveCount(0);

      // Cada página captura un tamaño a la vez, así las tres caben mientras se ve el cut-in (3,2 s de 4 s).
      const nombre = 'juego-pokemon-impostor-eliminacion';
      const capturas = [
        { page: pages[0]!, w: 1280, h: 720 },
        { page: pages[1]!, w: 1920, h: 1080 },
        { page: pages[2]!, w: 390, h: 844 },
      ];
      for (const { page, w, h } of capturas) await page.setViewportSize({ width: w, height: h });
      // El host ve el movimiento: al empezar la fase el rol no está ni en la banda ni en la tarjeta (ni su color), y llega a 1 s.
      await conMovimiento(host.page);
      await expect(banda(host.page)).toBeVisible({ timeout: 10_000 });
      await expect(banda(host.page)).toContainText(expulsado.name);
      expect(await banda(host.page).textContent(), 'sin rol al empezar la fase').not.toMatch(/era/);
      expect(await host.page.getByText(/era (impostor|inocente|IMPOSTOR|INOCENTE)/).count(), 'tarjeta sin rol al empezar la fase').toBe(0);
      await expect(banda(host.page)).toHaveAttribute('data-tone', 'yellow');
      await expect(banda(host.page)).toContainText('…era', { timeout: 2_000 });
      await expect(banda(host.page)).toHaveAttribute('data-tone', /^(red|info)$/);
      for (const page of pages.slice(1)) {
        await expect(banda(page)).toBeVisible({ timeout: 2_000 });
        await expect(banda(page)).toContainText(expulsado.name);
        await expect(banda(page)).toContainText('…era');
      }
      const medidas = await Promise.all(capturas.map(({ page }) => layoutProblems(page, nombre, true)));
      for (const page of pages) await expect(banda(page), 'el cut-in sigue a la vista tras la captura').toBeVisible({ timeout: 500 });
      for (const { id, problems } of medidas) expect(problems, `${id}: encaje y legibilidad`).toEqual([]);

      // La capa no intercepta: en su centro, el puntero llega al contenido de debajo.
      const encima = await banda(host.page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit ? hit.closest('[data-layer="cutin"]') !== null : true;
      });
      expect(encima, 'el cut-in no intercepta el puntero').toBe(false);
      expect(await animacionDe(banda(host.page)), 'cut-in con movimiento').toBe('reveal-cut-in-enter');
      expect(await animacionDe(banda(host.page).getByText(/^…era/)), 'línea del rol con movimiento').toBe('motion-enter-up');
      const reducida = pages[1]!;
      expect(await animacionDe(banda(reducida)), 'cut-in con reducción de movimiento').toBe('none');
      expect(await animacionDe(banda(reducida).getByText(/^…era/)), 'línea del rol con reducción de movimiento').toBe('none');

      // Con reducción de movimiento la banda se va sola antes de que acabe la fase de 4 s.
      await expect(banda(reducida)).toBeHidden({ timeout: 4_000 });
      await expect(reducida.getByRole('heading', { name: 'Jugador eliminado' })).toBeVisible();
      await host.page.emulateMedia({ reducedMotion: 'reduce' });
      for (const { page, w, h } of capturas) {
        if (w !== 1280 || h !== 720) await page.setViewportSize({ width: 1280, height: 720 });
      }
      for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
    } finally {
      await sala.cerrar();
    }
  });
});

test('pokemon-impostor: con dos impostores, cada uno ve al otro', async ({ browser }) => {
  test.setTimeout(120_000);
  // Prefijos de 19 caracteres: con el sufijo de `uniqueName` los nombres llegan a 24, el máximo permitido.
  const sala = await crearSalaConJugadores(browser, 5, undefined, ['Host', 'Entrenadora Largaa1', 'Entrenadora Largaa2', 'Entrenadora Largaa3', 'Entrenadora Largaa4']);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, tecla, valor] of [['Impostores', 'ArrowRight', '2'], ['Tiempo por pista', 'End', '120']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      await rango.press('Home');
      await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(pages);

    // Reparto de roles: solo los dos impostores ven la línea de aliados y cada uno nombra al otro.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeVisible({ timeout: 15_000 });
    const conAliados: Jugador[] = [];
    for (const jugador of jugadores) if (await jugador.page.getByTestId('impostor-fellows').isVisible()) conAliados.push(jugador);
    expect(conAliados.map((j) => j.name), 'exactamente dos impostores ven aliados').toHaveLength(2);
    const [a, b] = conAliados as [Jugador, Jugador];
    test.info().annotations.push({ type: 'impostores', description: `${a.name} | ${b.name}` });
    await expect(a.page.getByTestId('impostor-fellows')).toContainText(b.name);
    await expect(b.page.getByTestId('impostor-fellows')).toContainText(a.name);
    for (const jugador of jugadores) if (!conAliados.includes(jugador)) await expect(jugador.page.getByTestId('impostor-fellows')).toHaveCount(0);

    // Pistas: la tarjeta lateral y, en el móvil, la línea del rol con «con …» sin salirse de la vista.
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Descubre tu rol' })).toBeHidden({ timeout: 15_000 });
    await expect(a.page.getByTestId('impostor-fellows')).toContainText(b.name);
    await capturarTamanos(a.page, 'juego-pokemon-impostor-aliados');
    await a.page.setViewportSize({ width: 390, height: 844 });
    const linea = a.page.getByTestId('impostor-role-strip');
    await expect(linea).toBeInViewport({ ratio: 1 });
    await expect(linea).toContainText('con ');
    await a.page.setViewportSize({ width: 1280, height: 720 });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokemon-impostor: panel de configuración', async ({ browser }) => {
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    for (const { page } of invitados) await page.getByRole('button', { name: 'Marcarme listo' }).click();
    await expect(host.page.locator('#start-help')).toHaveText('La sala está lista.');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    const impostores = host.page.getByRole('slider', { name: 'Impostores' });
    await expect(impostores).toBeVisible();
    await expect(host.page.getByText('Con 1 impostor hacen falta al menos 3 jugadores.')).toBeVisible();
    // Dos impostores con 3 jugadores: la pista pide 5 y el lobby avisa antes de «Empezar partida».
    await impostores.focus();
    await impostores.press('ArrowRight');
    await expect(host.page.getByText('Con 2 impostores hacen falta al menos 5 jugadores.')).toBeVisible();
    await expect(host.page.locator('#start-help')).toHaveText('Demasiados impostores: con 3 jugadores el máximo es 1.');
    await expect(host.page.getByRole('button', { name: 'Empezar partida' })).toBeDisabled();
    await impostores.blur();
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await capturarTamanos(host.page, 'lobby-config-pokemon-impostor');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});

test('pokemon-impostor: modo Una palabra, dos vueltas de pistas por ronda, votación y victoria por tres rondas sin expulsión', async ({ browser }) => {
  test.setTimeout(240_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const pages = jugadores.map((j) => j.page);
    await seleccionarJuego(host.page, 'Pokémon Impostor');
    await elegirModo(host.page, 'Una palabra');
    const carta = await comprobarChipDeCarta(host.page, 'Pokémon Impostor', 'Una palabra');
    await comprobarAlturaDeCartas(host.page);
    await capturarMostrando(host.page, 'lobby-modo-una-palabra', carta);
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(pages);
    await comprobarTituloDeCabecera(host.page, 'Pokémon Impostor · Una palabra');

    const campo = (page: Page) => page.getByPlaceholder('Escribe algo relacionado…');
    const saltar = (page: Page) => page.getByRole('button', { name: 'Saltar', exact: true });
    const confirmar = (page: Page) => page.getByRole('button', { name: 'Confirmar voto' });
    // Tres rondas sin expulsión (todos saltan): en cada una, dos vueltas de pistas (3 turnos cada una) con la insignia
    // «Ronda c · Vuelta k» y, tras la segunda vuelta, la votación con «Ronda c» a secas.
    for (const ronda of [1, 2, 3]) {
      for (const vuelta of [1, 2]) {
        for (let turno = 0; turno < 3; turno++) {
          const page = await primeraVisible(pages, campo, 30_000);
          await expect(page.getByText(`Ronda ${ronda} · Vuelta ${vuelta}`, { exact: true }).first()).toBeVisible();
          await expect(page.getByText(/^Una sola palabra · \d+\//)).toBeVisible();
          if (ronda === 1 && vuelta === 2 && turno === 1) await capturarTamanos(page, 'juego-modo-una-palabra', { sigue: campo(page) });
          // Se espera a ver la pista en el orden de turnos (se mantiene toda la ronda) antes de pasar al turno siguiente: quien cierra
          // una vuelta abre la siguiente y su campo puede seguir a la vista.
          const pista = `pista${ronda}${vuelta}${turno}`;
          await campo(page).fill(pista);
          await campo(page).press('Enter');
          // El último turno de la segunda vuelta pasa a la votación: ahí se espera a «Saltar».
          if (vuelta === 1 || turno < 2) await expect(page.getByText(`«${pista}»`).first()).toBeVisible();
        }
      }
      for (const page of pages) await expect(saltar(page)).toBeVisible({ timeout: 20_000 });
      await expect(host.page.getByText(`Ronda ${ronda}`, { exact: true }).first()).toBeVisible();
      await expect(host.page.getByText(/Vuelta \d/)).toHaveCount(0);
      if (ronda === 1) await capturarTamanos(host.page, 'juego-modo-una-palabra-votacion', { sigue: saltar(host.page) });
      for (const page of pages) {
        await saltar(page).click();
        await confirmar(page).click();
      }
      for (const page of pages) await expect(page.getByText('Se salta la votación: nadie es expulsado')).toBeVisible({ timeout: 10_000 });
    }
    const titulo = host.page.getByRole('heading', { name: 'Ganan los impostores' });
    await expect(titulo).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByText(/Una palabra/).first()).toBeVisible();
    await capturarTamanos(host.page, 'juego-modo-una-palabra-resultados', { sigue: titulo, completa: true });
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
