/**
 * Páginas largas de Arcade DS F3 (`npm run test:e2e -- paginas`): Novedades (lista y detalle con la versión en la URL)
 * y Feedback (envío, error en español y confirmación), a los tres tamaños. Las respuestas de `/api/changelog` y de
 * `POST /api/feedback` son simuladas: así hay versiones sin leer y no quedan filas de feedback en la BD.
 */
import { expect, test, type Page } from '@playwright/test';
import { capture, collectErrors, loginAsGuest, SIZES, uniqueName } from '../src/helpers.js';

const fecha = '2026-11-03T00:00:00.000Z';
type Cambio = { type: string; text: string; highlight?: true };
const entrada = (version: string, title: string, content: Cambio[], date = fecha, summary?: string) => ({
  id: `e2e-${version}`, version, title, ...(summary ? { summary } : {}), date, published: true, content, createdAt: date, updatedAt: date,
});

/** Tres versiones; la última sin leer (el navegador había leído la 0.8.0). La 0.7.0 no tiene resumen ni destacados. */
const ENTRADAS = [
  entrada('0.9.0', 'Pantalla de título Arcade DS', [
    { type: 'NEW', text: 'La portada es ahora una pantalla de título con el logotipo grande y las píldoras de inicio.', highlight: true },
    { type: 'NEW', text: 'Cabecera de placas con el sonido, las novedades y el perfil siempre a mano.', highlight: true },
    { type: 'INTERFACE', text: 'Las pantallas entran con una transición corta que respeta la reducción de movimiento.' },
    { type: 'INTERFACE', text: 'Novedades, Perfil y Feedback usan paneles con su propio scroll.', highlight: true },
    { type: 'IMPROVEMENTS', text: 'Los errores del servidor se enseñan siempre en español.' },
    { type: 'BUGS', text: 'Los avisos se ven por encima de los diálogos abiertos.' },
    { type: 'BUGS', text: 'El perfil del administrador vuelve a estar accesible en el móvil.' },
  ], fecha, 'La portada se convierte en una pantalla de título y las páginas largas ganan paneles con su propio scroll.'),
  entrada('0.8.0', 'Una sala más completa', [
    { type: 'MINIGAMES', text: 'Nuevo selector de minijuegos con la rotación de la sesión.', highlight: true },
    { type: 'BUGS', text: 'Corregida la reconexión de la sala.' },
  ], '2026-09-11T00:00:00.000Z', 'Elige los minijuegos de la sesión y vuelve a la sala sin perder tu sitio.'),
  entrada('0.7.0', 'Primeros minijuegos', [
    { type: 'NEW', text: 'Llegan los primeros cinco minijuegos.' },
  ], '2026-07-02T00:00:00.000Z'),
];

async function simularNovedades(page: Page, falla: () => boolean): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('pokemon-universe:last-read-changelog', '0.8.0'));
  await page.route('**/api/changelog', (route) => falla()
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service Unavailable' }) })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: ENTRADAS }) }));
}

for (const { w, h } of SIZES) {
  test(`novedades a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    let falla = false;
    await simularNovedades(page, () => falla);
    const movil = w < 1024;

    await page.goto('/changelog');
    const lista = page.getByRole('navigation', { name: 'Versiones publicadas' });
    await expect(lista.getByRole('link')).toHaveCount(3);
    // Solo la 0.9.0 estaba sin leer; la visita la marca como leída.
    await expect(lista.getByText('Nueva')).toHaveCount(1);
    await expect(lista.getByRole('link', { name: /v0\.9\.0/ })).toContainText('Nueva');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pokemon-universe:last-read-changelog'))).toBe('0.9.0');
    const detalle = page.getByRole('heading', { name: 'Pantalla de título Arcade DS' });
    if (movil) await expect(detalle).toBeHidden();
    else {
      await expect(detalle).toBeVisible();
      // Portada de la versión (ticket con el número y resumen) y «Lo destacado» con sus tres tarjetas.
      const notas = page.getByRole('article', { name: 'Pantalla de título Arcade DS' });
      await expect(notas.getByText('0.9.0', { exact: true })).toBeVisible();
      await expect(notas.getByText('Última versión')).toBeVisible();
      await expect(notas.getByText(/La portada se convierte en una pantalla de título/)).toBeVisible();
      const destacado = notas.getByRole('region', { name: 'Lo destacado' });
      await expect(destacado.getByRole('article')).toHaveCount(3);
      // Un destacado no se repite en su categoría.
      await expect(notas.getByText('Cabecera de placas con el sonido, las novedades y el perfil siempre a mano.')).toHaveCount(1);
      await expect(lista.getByRole('link', { name: /v0\.9\.0/ })).toHaveAttribute('aria-current', 'true');
    }
    await capture(page, 'novedades');

    // Abrir otra versión: va en la URL y el detalle cambia; en móvil la lista se oculta y aparece «Volver».
    await lista.getByRole('link', { name: /v0\.8\.0/ }).click();
    await expect(page).toHaveURL(/\/changelog\?v=0\.8\.0$/);
    await expect(page.getByRole('heading', { name: 'Una sala más completa' })).toBeVisible();
    await expect(page.getByText('Elige los minijuegos de la sesión y vuelve a la sala sin perder tu sitio.')).toBeVisible();
    // En móvil la lista queda oculta tras abrir una versión; en escritorio marca la abierta.
    if (!movil) await expect(lista.getByRole('link', { name: /v0\.8\.0/ })).toHaveAttribute('aria-current', 'true');
    const volver = page.getByRole('link', { name: 'Volver', exact: true });
    if (movil) {
      await expect(lista).toBeHidden();
      await expect(volver).toBeVisible();
      await capture(page, 'novedades-detalle');
      // Atrás del navegador y «Volver» llevan los dos a la lista.
      await page.goBack();
      await expect(page).toHaveURL(/\/changelog$/);
      await expect(lista).toBeVisible();
      await lista.getByRole('link', { name: /v0\.9\.0/ }).click();
      await expect(page.getByRole('heading', { name: 'Pantalla de título Arcade DS' })).toBeVisible();
      await volver.click();
      await expect(page).toHaveURL(/\/changelog$/);
      await expect(lista).toBeVisible();
    } else {
      await expect(volver).toBeHidden();
      // Una versión sin destacados ni resumen no enseña esa sección.
      await lista.getByRole('link', { name: /v0\.7\.0/ }).click();
      await expect(page.getByRole('heading', { name: 'Primeros minijuegos' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Lo destacado' })).toHaveCount(0);
      await capture(page, 'novedades-sin-destacados');
    }

    // Error del servidor: texto fijo en español con «Reintentar».
    falla = true;
    await page.goto('/changelog');
    const alerta = page.getByRole('alert');
    await expect(alerta).toContainText('No se pudieron cargar las novedades');
    await expect(alerta).not.toContainText('Service Unavailable');
    await capture(page, 'novedades-error');
    falla = false;
    await alerta.getByRole('button', { name: 'Reintentar' }).click();
    await expect(lista.getByRole('link')).toHaveCount(3);

    expect(errors.filter((e) => !/503|Service Unavailable/.test(e))).toEqual([]);
  });
}

/** Respuesta de `POST /api/feedback`: la primera vez falla con un texto en inglés, la segunda se guarda. */
async function simularFeedback(page: Page): Promise<{ cuerpos: unknown[] }> {
  const cuerpos: unknown[] = [];
  await page.route('**/api/feedback', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as { reference: string; type: string; description: string; gameId?: string; roomCode?: string };
    cuerpos.push(body);
    if (cuerpos.length === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal Server Error' }) });
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ feedback: {
        id: 'e2e-feedback', reference: body.reference, gameId: body.gameId ?? null, gameName: body.gameId ? 'Shiny Quiz' : null, roomCode: body.roomCode ?? null,
        type: body.type, status: 'NEW', description: body.description, author: { userId: null, displayName: 'E2E', kind: 'GUEST' }, createdAt: fecha, updatedAt: fecha,
      } }),
    });
  });
  return { cuerpos };
}

for (const { w, h } of SIZES) {
  test(`feedback a ${w}×${h}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await loginAsGuest(page, uniqueName('Fb'));
    const { cuerpos } = await simularFeedback(page);

    // Desde una sala de un minijuego: tema y sala van en el contexto y el envío los lleva.
    await page.goto('/feedback?game=shiny-vote&room=PIKA42');
    await expect(page.getByRole('heading', { name: 'Enviar feedback', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Minijuego')).toHaveValue('shiny-vote');
    await expect(page.getByRole('group', { name: 'Contexto incluido' })).toContainText('Sala: PIKA42');
    const enviar = page.getByRole('button', { name: 'Enviar', exact: true });
    await expect(enviar).toBeDisabled();
    await page.getByRole('radio', { name: 'Sugerencia' }).click();
    await expect(page.getByRole('radio', { name: 'Sugerencia' })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Descripción').fill('Me gustaría poder repetir la última ronda con los mismos Pokémon.');
    await expect(page.getByText(/^\d+ \/ 2000$/)).toHaveText('65 / 2000');
    await expect(enviar).toBeEnabled();
    await capture(page, 'feedback');

    // Fallo del servidor en inglés: el aviso es español y recibe el foco.
    await enviar.click();
    const alerta = page.getByRole('alert');
    await expect(alerta).toContainText('No se pudo enviar el feedback');
    await expect(alerta).not.toContainText('Internal');
    await expect(alerta.locator('xpath=..')).toBeFocused();
    await capture(page, 'feedback-error');

    // Segundo intento: confirmación en el panel con la vuelta a la partida.
    await enviar.click();
    const gracias = page.getByRole('heading', { name: 'Gracias por avisar' });
    await expect(gracias).toBeVisible();
    await expect(gracias).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Gracias por avisar' })).toContainText('Shiny Quiz');
    expect(cuerpos[1]).toMatchObject({ reference: 'MINIGAME', type: 'SUGGESTION', gameId: 'shiny-vote', roomCode: 'PIKA42' });
    await capture(page, 'feedback-enviado');
    await page.getByRole('button', { name: 'Enviar otro comentario' }).click();
    await expect(page.getByLabel('Descripción')).toHaveValue('');

    expect(errors.filter((e) => !/500|Internal Server Error/.test(e))).toEqual([]);
  });
}
