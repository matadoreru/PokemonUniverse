/**
 * «Cómo se juega» bajo demanda (E1) contra el `/ws` de Java (`npm run test:e2e -- ayuda`): la partida empieza sin
 * intro; cada carta del lobby lleva un «?» hermano que abre las reglas sin elegirla, y ya en partida la píldora «?» de la
 * placa (o la tecla «?») abre las reglas y los atajos en el diálogo de ayuda.
 */
import { expect, test, type Page } from '@playwright/test';
import { capturarATresTamaños, cartaDeJuego, crearSalaConJugadores, esperarPartida, iniciarPartida, seleccionarJuego, type Jugador } from '../src/helpers.js';

/**
 * El «?» de cada carta visible del lobby no pisa ningún texto de su carta (nombre, jugadores, chips): el medidor de encaje
 * lo trata como capa (`data-layer`) porque se monta sobre la esquina de la carta, así que esto lo comprueba aparte.
 */
async function rulesSinPisarTexto(page: Page): Promise<void> {
  const pisados = await page.getByRole('list', { name: 'Minijuegos' }).evaluate((lista) => {
    const out: string[] = [];
    for (const celda of lista.querySelectorAll('li')) {
      const dot = celda.querySelector('[data-layer="rules"]');
      if (!dot) continue;
      const d = dot.getBoundingClientRect();
      if (d.bottom < 0 || d.top > innerHeight) continue;
      const textos = [...celda.querySelectorAll('*')].filter((e) => e !== dot && !dot.contains(e) && !e.closest('dialog')
        && [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()));
      for (const t of textos) {
        const r = t.getBoundingClientRect();
        const w = Math.min(r.right, d.right) - Math.max(r.left, d.left);
        const h = Math.min(r.bottom, d.bottom) - Math.max(r.top, d.top);
        if (w > 1 && h > 1) out.push(`${(t as HTMLElement).innerText.trim()} (${Math.round(w)}×${Math.round(h)})`);
      }
    }
    return out;
  });
  expect(pisados, 'el «?» no pisa texto de su carta').toEqual([]);
}

test('«Cómo se juega»: «?» en las cartas del lobby y en la partida', async ({ browser }) => {
  test.setTimeout(120_000);
  const sala = await crearSalaConJugadores(browser, 2);
  try {
    const { host, invitados, jugadores } = sala;
    const [invitado] = invitados as [Jugador];

    await seleccionarJuego(host.page, 'Higher or Lower');
    // El lobby con sus «?», a los tres tamaños, sin que ninguno pise el texto de su carta.
    await capturarATresTamaños(host.page, 'lobby-reglas', { antes: () => rulesSinPisarTexto(host.page) });
    // El «?» de una carta: abre sus reglas (sin atajos) y no cambia la selección, ni la elegida ni otra.
    for (const nombre of ['Higher or Lower', 'Shiny Quiz']) {
      const carta = cartaDeJuego(host.page, nombre);
      const antes = await carta.getAttribute('aria-pressed');
      const reglas = host.page.getByRole('dialog', { name: `Cómo se juega · ${nombre}` });
      await host.page.getByRole('button', { name: `Cómo se juega: ${nombre}`, exact: true }).click();
      await expect(reglas).toBeVisible();
      await expect(reglas.getByRole('region', { name: 'Reglas' }).getByRole('listitem')).toHaveCount(3);
      await expect(reglas.getByRole('region', { name: 'Atajos de teclado' })).toHaveCount(0);
      if (nombre === 'Shiny Quiz') await capturarATresTamaños(host.page, 'como-se-juega-lobby');
      await reglas.getByRole('button', { name: 'Entendido' }).click();
      await expect(reglas).toBeHidden();
      await expect(carta).toHaveAttribute('aria-pressed', antes ?? 'false');
    }
    // El área pulsable del «?» llega a 44 px aunque el disco mida 28.
    const area = await host.page.getByRole('button', { name: 'Cómo se juega: Shiny Quiz', exact: true }).evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      const box = el.getBoundingClientRect();
      return { w: box.width - 2 * parseFloat(after.left), h: box.height - 2 * parseFloat(after.top) };
    });
    expect(area.w).toBeGreaterThanOrEqual(44);
    expect(area.h).toBeGreaterThanOrEqual(44);
    // El invitado (cartas de solo lectura) también puede leer las reglas.
    await invitado.page.getByRole('tab', { name: 'Minijuegos' }).click();
    await invitado.page.getByRole('button', { name: 'Cómo se juega: Higher or Lower', exact: true }).click();
    await expect(invitado.page.getByRole('dialog', { name: 'Cómo se juega · Higher or Lower' })).toBeVisible();
    await invitado.page.keyboard.press('Escape');

    // Sin intro: la primera ronda empieza al momento.
    await iniciarPartida(host.page, [invitado.page]);
    await esperarPartida([host.page, invitado.page]);
    for (const { page } of jugadores) await expect(page.getByRole('button', { name: 'Mayor', exact: true })).toBeVisible({ timeout: 15_000 });

    // «Cómo se juega»: la píldora «?» de la placa abre el diálogo de ayuda con las reglas y los atajos de la pantalla.
    const ayuda = invitado.page.getByRole('dialog', { name: 'Cómo se juega · Higher or Lower' });
    await invitado.page.getByRole('button', { name: 'Cómo se juega' }).click();
    await expect(ayuda).toBeVisible();
    await expect(ayuda.getByRole('heading', { name: 'Reglas' })).toBeVisible();
    await expect(ayuda.getByRole('region', { name: 'Reglas' }).getByRole('listitem')).toHaveCount(3);
    // Mayor, Igual y Menor con 1, 2 y 3, y la propia «?».
    await expect(ayuda.getByRole('region', { name: 'Atajos de teclado' }).getByRole('listitem')).toHaveCount(4);
    await capturarATresTamaños(invitado.page, 'como-se-juega');
    // Con el diálogo abierto, los atajos del juego no llegan a la pantalla de debajo.
    await invitado.page.keyboard.press('1');
    await expect(ayuda).toBeVisible();
    await expect(invitado.page.getByText('0 / 2 respuestas')).toBeVisible();
    await invitado.page.keyboard.press('Escape');
    await expect(ayuda).toBeHidden();
    // La tecla «?» abre el mismo diálogo.
    await invitado.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await invitado.page.keyboard.press('?');
    await expect(ayuda).toBeVisible();
    await invitado.page.keyboard.press('Escape');
    await expect(ayuda).toBeHidden();
    await invitado.page.getByRole('button', { name: 'Cómo se juega' }).click();
    await ayuda.getByRole('button', { name: 'Entendido' }).click();
    await expect(ayuda).toBeHidden();

    // En el móvil la «?» de la placa es un objetivo táctil de 44 × 44 px, como «Salir».
    await invitado.page.setViewportSize({ width: 390, height: 844 });
    const caja = await invitado.page.getByRole('button', { name: 'Cómo se juega' }).boundingBox();
    expect(caja, '«?» visible a 390 px').not.toBeNull();
    expect(Math.min(caja!.width, caja!.height), '«?» de al menos 44 px').toBeGreaterThanOrEqual(44);
    await invitado.page.setViewportSize({ width: 1280, height: 720 });

    for (const { errors } of jugadores) expect(errors, 'sin errores de consola').toEqual([]);
  } finally {
    await sala.cerrar();
  }
});
