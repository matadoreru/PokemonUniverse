/**
 * E2E de Pokémon Trivia (`pokemon-trivia`) contra el `/ws` del backend Java. La prueba de humo de todos los minijuegos está en
 * `tests/juegos.spec.ts` y los helpers que comparten los specs de juegos, en `src/juegos.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { crearSalaConJugadores, iniciarPartida, esperarPartida, seleccionarJuego, SIZES, type Jugador } from '../../src/helpers.js';
import { capturarTamanos, capturarAnotando, sinScorePop, textoDeMain } from '../../src/juegos.js';

/**
 * Pokémon Trivia sin red: tres jugadores, tres preguntas de 15 s. En cada una el host responde con el atajo «1» y los
 * invitados con las cartas 2 y 3, así la pregunta se cierra en el acto. Antes de responder, la pregunta a los tres
 * tamaños (a 390×844, la pregunta y todas las opciones a la vista sin desplazar) y sin ninguna marca de la correcta en
 * el DOM; en la revelación (4 s), un tamaño por pregunta: la correcta y las incorrectas con icono y texto, el dato y
 * quién eligió qué. Al final, la clasificación con la precisión y los aciertos por categoría.
 */
test('pokemon-trivia: tres preguntas con atajos, la revelación de cada una y la clasificación', async ({ browser }) => {
  test.setTimeout(180_000);
  const sala = await crearSalaConJugadores(browser, 3);
  try {
    const { host, invitados, jugadores } = sala;
    const [primero, segundo] = invitados as [Jugador, Jugador];
    await seleccionarJuego(host.page, 'Pokémon Trivia');
    await host.page.getByRole('tab', { name: 'Configuración' }).click();
    for (const [nombre, teclas, valor] of [['Número de preguntas', ['Home', 'ArrowRight', 'ArrowRight'], '3'], ['Tiempo por pregunta', ['Home', 'ArrowRight'], '15']] as const) {
      const rango = host.page.getByRole('slider', { name: nombre });
      await rango.focus();
      for (const tecla of teclas) await rango.press(tecla);
      await rango.blur();
      await expect(rango).toHaveValue(valor);
    }
    await host.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await iniciarPartida(host.page, invitados.map((j) => j.page));
    await esperarPartida(jugadores.map((j) => j.page));

    const opcion = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^${n}\\. `) });
    const titulo = host.page.getByRole('heading', { level: 1 });
    for (const ronda of [1, 2, 3]) {
      await expect(host.page.getByText(`Ronda ${ronda} de 3`, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(opcion(host.page, 1)).toBeVisible({ timeout: 10_000 });
      await expect(titulo).toHaveText(/^Pregunta · /);
      // Antes de revelar no hay ninguna marca de la correcta ni dato de la revelación.
      const antes = await textoDeMain(host.page);
      for (const marca of ['Correcta', 'Incorrecta', 'Nadie la eligió']) expect(antes, `ronda ${ronda}: sin «${marca}» antes de revelar`).not.toContain(marca);
      await expect(host.page.getByTestId('trivia-fact')).toHaveCount(0);

      if (ronda === 1) {
        await capturarTamanos(host.page, 'juego-pokemon-trivia-pregunta', { sigue: opcion(host.page, 1) });
        // A 390×844 sin desplazar: la pregunta, el plazo y todas las opciones.
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        await expect(host.page.getByTestId('trivia-prompt')).toBeInViewport({ ratio: 1 });
        await expect(host.page.getByRole('timer')).toBeInViewport({ ratio: 1 });
        const total = await host.page.locator('[data-trivia-card]').count();
        for (let n = 1; n <= total; n++) {
          await expect(opcion(host.page, n)).toBeInViewport({ ratio: 1 });
          // Nada la tapa (la placa va pegada al fondo): el pie de la carta, donde va el nombre, es suyo.
          expect(await opcion(host.page, n).evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 6)); }), `opción ${n} a la vista y sin tapar`).toBe(true);
        }
        await host.page.setViewportSize({ width: 1280, height: 720 });
      }

      // El host responde con el atajo 1: su respuesta queda bloqueada (en texto) y el foco va al título de la placa.
      // El atajo no depende de dónde esté el foco (salvo en un campo): se quita del control que lo tenga.
      await host.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      if (ronda === 1) {
        // «?» abre la lista de atajos de la pantalla (las opciones y «Confirmar» con Intro); con ella abierta, «1» no elige.
        await host.page.keyboard.press('?');
        const ayuda = host.page.getByRole('dialog', { name: 'Atajos de teclado' });
        await expect(ayuda).toBeVisible();
        await expect(ayuda.getByRole('listitem').filter({ hasText: 'Confirmar respuesta' }).locator('kbd')).toHaveText('Intro');
        await expect(ayuda.getByRole('listitem').filter({ has: host.page.locator('kbd', { hasText: /^1$/ }) })).toHaveCount(1);
        await host.page.keyboard.press('1');
        await expect(host.page.locator('[data-trivia-card][aria-pressed="true"]')).toHaveCount(0);
        await host.page.keyboard.press('Escape');
        await expect(ayuda).toBeHidden();
        await host.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      }
      // Como en Shiny Quiz: el atajo solo elige; Enter confirma.
      await host.page.keyboard.press('1');
      await expect(host.page.getByText('Has seleccionado')).toBeVisible();
      await expect(host.page.locator('[data-trivia-card]').first()).toHaveAttribute('aria-pressed', 'true');
      await host.page.keyboard.press('Enter');
      await expect(host.page.getByRole('heading', { name: /^1 · .+ bloqueada$/ })).toBeVisible({ timeout: 5_000 });
      await expect(host.page.locator('#guess-plate-title')).toBeFocused();
      await expect(primero.page.getByTestId('trivia-score-row').filter({ hasText: 'Respondió' })).toHaveCount(1, { timeout: 5_000 });
      await opcion(primero.page, 2).click();
      await primero.page.getByRole('button', { name: 'Confirmar respuesta' }).click();
      await opcion(segundo.page, 3).click();
      await segundo.page.getByRole('button', { name: 'Confirmar respuesta' }).click();

      // Revelación: la correcta y las incorrectas con texto, el dato y quién eligió qué.
      await expect(titulo).toHaveText(/^Correcta: .+$/, { timeout: 10_000 });
      const cartas = host.page.locator('[data-trivia-card]');
      await expect(cartas.filter({ hasText: /Correcta/ })).toHaveCount(1);
      await expect(cartas.filter({ hasText: /Incorrecta/ })).toHaveCount(await cartas.count() - 1);
      await expect(host.page.getByTestId('trivia-fact')).toBeVisible();
      await expect(host.page.getByTestId('trivia-answer-row')).toHaveCount(3);
      await expect(host.page.getByTestId('trivia-answer-row').filter({ hasText: primero.name })).toContainText(/(Acertó|Falló)\s*Eligió 2 · /);
      // Quién eligió cada una, con avatares sobre el sprite (el propio, marcado).
      await expect(host.page.locator('[data-testid="trivia-pickers"][data-self="true"]')).toHaveCount(1);
      test.info().annotations.push({ type: 'trivia', description: `ronda ${ronda}: ${await titulo.innerText()}` });
      // La revelación dura 4 s: un tamaño por pregunta.
      if (ronda === 3) {
        // A 390×844 sin desplazar: las cuatro cartas con su marca y la correcta sin tapar por la placa.
        await host.page.setViewportSize({ width: SIZES[2].w, height: SIZES[2].h });
        await host.page.evaluate(() => window.scrollTo(0, 0));
        const correcta = cartas.filter({ hasText: /Correcta/ });
        await expect(correcta).toBeInViewport({ ratio: 1 });
        for (const carta of await cartas.all()) {
          await expect(carta).toBeInViewport({ ratio: 1 });
          expect(await carta.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 6)); }), 'carta de la revelación sin tapar').toBe(true);
        }
      }
      await capturarAnotando(host.page, `juego-pokemon-trivia-revelacion-${ronda}`, titulo.filter({ hasText: /^Correcta: / }), [SIZES[ronda - 1]!]);
    }

    await expect(host.page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible({ timeout: 15_000 });
    await expect(host.page.getByText(/de 3 · \d+% de precisión$/)).toHaveCount(3);
    await expect(host.page.getByLabel('Aciertos por categoría')).toHaveCount(3);
    await sinScorePop(host.page);
    await capturarTamanos(host.page, 'juego-pokemon-trivia-clasificacion');
    for (const jugador of jugadores) expect(jugador.errors, jugador.name).toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
