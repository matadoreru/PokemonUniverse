/**
 * Administración con el catálogo Arcade DS (F9) contra el backend Java (`npm run test:e2e -- administracion`). Un ADMIN
 * (promovido en la BD local) recorre las seis secciones con datos simulados (`page.route` sobre los GET de
 * `/api/admin/*`, con listas largas y varias páginas) y se capturan a los tres tamaños sin scroll de página. También el
 * vacío, el error con «Reintentar», la ficha del móvil con «Volver» (sin entradas nuevas en el historial) y el diálogo
 * del Full Sync, que se cancela: ninguna petición que cambie datos llega al servidor.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { borrarCuentas, capture, collectErrors, comprobarBdE2E, nuevaCuenta, promoverAAdmin, registrarPorApi, SIZES } from '../src/helpers.js';

const HOY = '2026-11-04T10:00:00.000Z';
const hace = (min: number) => new Date(Date.parse(HOY) - min * 60_000).toISOString();
const JUGADORES = ['Ash', 'Misty', 'Brock', 'Gary', 'Serena', 'Dawn', 'Iris', 'Cilan', 'Clemont', 'Bonnie', 'Lillie', 'Goh'];
const JUEGOS = ['Shiny Vote', 'Higher or Lower', 'Pokémon Bingo', 'Type Chain', 'Bluff Auction', 'Quién es Quién'];
/** Código de sala de 6 caracteres del alfabeto real ([A-Z2-9]), distinto para cada `i` < 192. */
const codigo = (i: number) => `PK${'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(i / 8) % 24]}${'23456789'[i % 8]}XY`;

function pagina<T>(items: T[], total: number) {
  return { items, page: 1, pageSize: 20, total, totalPages: Math.ceil(total / 20) };
}

const resumen = { activeRooms: 12, gamesInProgress: 5, registeredUsers: 1342, interruptedToday: 2, updatedAt: HOY };

const salasActivas = Array.from({ length: 20 }, (_, i) => ({
  id: `sala-${i}`, code: codigo(i), phase: i % 3 ? 'IN_GAME' : 'LOBBY', gameId: i % 3 ? 'shiny-vote' : null, gameName: i % 3 ? JUEGOS[i % JUEGOS.length] : null,
  connectedPlayers: 2 + (i % 5), totalPlayers: 3 + (i % 5), maxPlayers: 8, hostDisplayName: JUGADORES[i % JUGADORES.length], createdAt: hace(90 + i), updatedAt: hace(i),
  participants: JUGADORES.slice(0, 3 + (i % 5)).map((nombre, j) => ({ id: `p-${i}-${j}`, displayName: nombre, kind: j % 2 ? 'GUEST' : 'USER', presence: j === 2 ? 'TEMPORARILY_DISCONNECTED' : 'CONNECTED', roomRole: j === 0 ? 'HOST' : 'MEMBER' })),
}));

const historial = Array.from({ length: 20 }, (_, i) => ({
  id: `hist-${i}`, code: codigo(i + 40), hostDisplayName: JUGADORES[(i + 3) % JUGADORES.length], hostUserId: null, maxPlayers: 8,
  status: (['CLOSED', 'INTERRUPTED', 'ACTIVE'] as const)[i % 3], closeReason: i % 3 === 1 ? 'El servidor se reinició durante la partida' : i % 3 === 0 ? 'El anfitrión cerró la sala' : null,
  gamesStarted: i % 7, createdAt: hace(600 + i * 30), endedAt: i % 3 === 2 ? null : hace(500 + i * 30),
}));

const partidas = Array.from({ length: 20 }, (_, i) => ({
  id: `partida-${i}`, roomCode: codigo(i), gameId: 'shiny-vote', gameName: JUEGOS[i % JUEGOS.length], playerCount: 3 + (i % 6),
  status: (['COMPLETED', 'IN_PROGRESS', 'ABANDONED', 'INTERRUPTED'] as const)[i % 4], startedAt: hace(120 + i * 15), endedAt: i % 4 === 1 ? null : hace(100 + i * 15),
  participants: i % 4 === 1 ? [] : JUGADORES.slice(0, 3 + (i % 6)).map((nombre, j) => ({ displayName: nombre, userId: null, position: j + 1, points: 900 - j * 120 })),
}));

const usuarios = Array.from({ length: 20 }, (_, i) => ({
  id: `usuario-${i}`, username: `${JUGADORES[i % JUGADORES.length]!.toLowerCase()}_${i}`, email: `${JUGADORES[i % JUGADORES.length]!.toLowerCase()}${i}@pokemon-universe.example`,
  role: i % 6 === 0 ? 'ADMIN' : 'USER', gamesPlayed: 40 - i, gamesWon: 18 - (i % 9), totalPoints: 12_500 - i * 310, createdAt: hace(60 * 24 * (30 + i)), updatedAt: hace(60),
}));

const feedback = Array.from({ length: 20 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, reference: i % 3 ? 'MINIGAME' : 'INTERFACE', gameId: i % 3 ? 'shiny-vote' : null, gameName: i % 3 ? JUEGOS[i % JUEGOS.length] : null,
  roomCode: i % 2 ? codigo(i) : null, type: i % 2 ? 'BUG' : 'SUGGESTION', status: 'NEW',
  description: i % 2
    ? 'Al pasar a la siguiente ronda el temporizador se queda a cero unos segundos y no se puede votar. Pasa sobre todo en el móvil con la pantalla bloqueada un momento.'
    : 'Estaría bien poder repetir la última ronda con los mismos Pokémon cuando todos fallan.',
  author: { userId: null, displayName: JUGADORES[i % JUGADORES.length], kind: i % 2 ? 'GUEST' : 'USER' }, createdAt: hace(i * 200), updatedAt: hace(i * 200),
}));

const changelog = Array.from({ length: 9 }, (_, i) => ({
  id: `version-${i}`, version: `0.${9 - i}.0`, title: ['Pantalla de título Arcade DS', 'Una sala más completa', 'Primeros minijuegos'][i % 3], date: hace(60 * 24 * 20 * i),
  published: i !== 0, createdAt: hace(60 * 24 * 20 * i), updatedAt: hace(60 * 24 * 20 * i),
  content: [
    { type: 'NEW', text: 'La portada es ahora una pantalla de título con el logotipo grande y las píldoras de inicio.' },
    { type: 'INTERFACE', text: 'Las pantallas entran con una transición corta que respeta la reducción de movimiento.' },
    { type: 'BUGS', text: 'Los errores del servidor se enseñan siempre en español.' },
  ],
}));

const fuentes = [
  { source: 'POKEAPI', status: 'COMPLETED', ready: true, lastSyncAt: hace(300), lastAttemptAt: hace(300), lastFullSyncAt: hace(60 * 24 * 7), durationMs: 184_000, recordsProcessed: 1025, inserted: 0, updated: 12, skipped: 3, recordsAvailable: 1025, error: null, nextSyncAt: hace(-1140) },
  { source: 'TCGDEX', status: 'FAILED', ready: true, lastSyncAt: hace(60 * 26), lastAttemptAt: hace(40), lastFullSyncAt: null, durationMs: 9_400, recordsProcessed: 18_240, inserted: 120, updated: 0, skipped: 41, recordsAvailable: 18_240, error: 'TCGdex respondió 503: la última versión válida se conserva.', nextSyncAt: hace(-20) },
];

// Los GET van simulados (aquí se mide la pantalla); la API real de la administración la cubre `contenido-y-admin.spec.ts`.
/** Respuestas simuladas de los GET de la administración; `vacio` y `fallo` cambian las listas. */
async function simularAdmin(page: Page, estado: { vacio: boolean; fallo: boolean }): Promise<void> {
  await page.route('**/api/admin/**', async (route: Route) => {
    const req = route.request();
    // Nada de lo que cambia datos debe salir de aquí: el test no guarda, no borra ni sincroniza.
    if (req.method() !== 'GET') return route.fulfill({ status: 409, json: { error: 'E2E: petición no esperada' } });
    const { pathname } = new URL(req.url());
    const ruta = pathname.replace('/api/admin', '');
    if (ruta === '/summary') return route.fulfill({ json: resumen });
    if (estado.fallo) return route.fulfill({ status: 503, json: { error: 'El servidor de administración no responde.' } });
    const lista = <T,>(items: T[], total: number) => route.fulfill({ json: estado.vacio ? pagina([], 0) : pagina(items, total) });
    switch (ruta) {
      case '/active-rooms': return lista(salasActivas, 47);
      case '/rooms': return lista(historial, 213);
      case '/games': return lista(partidas, 388);
      case '/users': return lista(usuarios, 1342);
      case '/feedback': return route.fulfill({ json: { ...(estado.vacio ? pagina([], 0) : pagina(feedback, 26)), overview: { newBugs: 14, newSuggestions: 12, reviewing: 3, resolved: 41 } } });
      case '/changelog': return route.fulfill({ json: { entries: estado.vacio ? [] : changelog } });
      case '/data-sync': return route.fulfill({ json: { sources: fuentes } });
      default: return route.continue();
    }
  });
}

/** Capturas de la página a los tres tamaños, sin scroll de página; vuelve a 1280×720. */
async function capturarPagina(page: Page, nombre: string): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await capture(page, nombre);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test.beforeAll(() => {
  comprobarBdE2E();
});

test('un ADMIN recorre las secciones de administración a los tres tamaños', async ({ page }) => {
  test.setTimeout(180_000);
  const admin = nuevaCuenta('e2e_adm');
  const estado = { vacio: false, fallo: false };
  try {
    const errors = collectErrors(page);
    await page.goto('/auth');
    await registrarPorApi(page, admin);
    await promoverAAdmin(page, admin);
    await simularAdmin(page, estado);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Administración de Pokémon Universe', level: 1 })).toBeVisible();
    await expect(page.getByText('1342', { exact: true })).toBeVisible();

    // Salas activas: la primera abierta en la ficha y paginación con nombre.
    await expect(page.getByRole('tab', { name: 'Salas' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(salasActivas[0]!.code, { exact: true }).first()).toBeVisible();
    const paginas = page.getByRole('navigation', { name: 'Páginas de salas activas' });
    await expect(paginas).toContainText('Página 1 de 3 · 47 registros');
    await expect(paginas.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await capturarPagina(page, 'admin-salas');

    // Móvil: lista y, al abrir una sala, solo su ficha; «Volver» no añade entradas al historial y devuelve el foco.
    await page.setViewportSize({ width: 390, height: 844 });
    const entradas = await page.evaluate(() => history.length);
    const abrir = page.getByRole('button', { name: `Ver Sala ${salasActivas[1]!.code}` });
    await abrir.click();
    await expect(page.getByRole('heading', { name: `Sala ${salasActivas[1]!.code}` })).toBeFocused();
    await expect(page.getByRole('list', { name: 'Salas activas' })).toBeHidden();
    await capture(page, 'admin-salas-detalle');
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByRole('list', { name: 'Salas activas' })).toBeVisible();
    await expect(abrir).toBeFocused();
    expect(await page.evaluate(() => history.length)).toBe(entradas);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.getByRole('radio', { name: 'Historial' }).click();
    await expect(page.getByRole('navigation', { name: 'Páginas de historial de salas' })).toContainText('213 registros');
    await capturarPagina(page, 'admin-salas-historial');

    await page.getByRole('tab', { name: 'Partidas' }).click();
    await expect(page.getByRole('navigation', { name: 'Páginas de partidas' })).toContainText('388 registros');
    await expect(page.getByRole('list', { name: 'Resultados' })).toBeVisible();
    await capturarPagina(page, 'admin-partidas');

    await page.getByRole('tab', { name: 'Usuarios' }).click();
    await expect(page.getByRole('navigation', { name: 'Páginas de usuarios' })).toContainText('1342 registros');
    await capturarPagina(page, 'admin-usuarios');

    await page.getByRole('tab', { name: 'Feedback' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback de jugadores' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Estado', exact: true })).toHaveValue('NEW');
    await capturarPagina(page, 'admin-feedback');

    // Changelog: editar una versión y cambiar de sección pide confirmación en un diálogo (no `window.confirm`).
    await page.getByRole('tab', { name: 'Changelog' }).click();
    await page.getByRole('button', { name: 'Editar v0.8.0' }).click();
    await expect(page.getByRole('heading', { name: 'Editar v0.8.0' })).toBeVisible();
    await capturarPagina(page, 'admin-changelog');
    await page.getByLabel('Título').fill('Una sala más completa (editada)');
    await page.getByRole('tab', { name: 'Datos' }).click();
    const descartar = page.getByRole('dialog', { name: '¿Descartar los cambios del changelog?' });
    await expect(descartar).toBeVisible();
    await expect(descartar.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
    await descartar.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page.getByRole('tab', { name: 'Changelog' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Datos' }).click();
    await descartar.getByRole('button', { name: 'Descartar' }).click();

    // Datos: las dos fuentes y el Full Sync con confirmación, que se cancela.
    await expect(page.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('TCGdex respondió 503: la última versión válida se conserva.')).toBeVisible();
    await capturarPagina(page, 'admin-datos');
    await page.getByRole('button', { name: 'Forzar Full Sync' }).click();
    const full = page.getByRole('dialog', { name: '¿Forzar el Full Sync?' });
    await expect(full.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    for (const { w, h } of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await expect(full).toBeVisible();
      await capture(page, 'admin-dialogo-full-sync');
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await full.getByRole('button', { name: 'Cancelar' }).click();
    await expect(full).toBeHidden();

    // Vacío y error (con «Reintentar», que vuelve a pedir la lista).
    estado.vacio = true;
    await page.getByRole('tab', { name: 'Salas' }).click();
    await expect(page.getByText('No hay registros con estos filtros')).toBeVisible();
    await capturarPagina(page, 'admin-vacio');
    estado.vacio = false;
    estado.fallo = true;
    // La sección guarda «Historial» de antes: volver a «Activas» pide la lista otra vez y falla.
    await page.getByRole('radio', { name: 'Activas' }).click();
    await expect(page.getByRole('alert')).toContainText('No se pudieron cargar las salas');
    await capturarPagina(page, 'admin-error');
    estado.fallo = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('navigation', { name: 'Páginas de salas activas' })).toContainText('47 registros');

    expect(errors.filter((e) => !e.includes('503'))).toEqual([]);
  } finally {
    borrarCuentas([admin.email], () => undefined);
  }
});
