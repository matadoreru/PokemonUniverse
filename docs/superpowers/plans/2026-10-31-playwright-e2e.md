# Playwright E2E + rúbrica de revisión visual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Paso previo: copiar este fichero a `docs/superpowers/plans/2026-10-31-playwright-e2e.md` dentro del repo y trabajar desde allí (se versiona con el código).

**Goal:** Añadir pruebas end-to-end con Playwright a Pokémon Universe, con capturas de revisión y comprobaciones automáticas de encaje y legibilidad, y una rúbrica de revisión visual ("papeleta") que se puntúa en cada commit de UI, replicando la metodología del proyecto InazumaElevenManager.

**Architecture:** Nuevo workspace `e2e/` (`@pokemon-universe/e2e`) con `@playwright/test`, solo Chromium, `workers: 1`. Playwright arranca servidor y web (dos entradas `webServer`) cargando `.env` él mismo, porque el servidor no carga dotenv. Los specs autentican con sesiones de invitado (JWT sin filas en BD), usan locators por rol/etiqueta en español, capturan a 1280×720, 1920×1080 y 390×844, y cada captura pasa `measureLayout` (texto pequeño, solapes, recortes sin `title`, controles fuera de su caja) y "sin scroll horizontal". La rúbrica vive en `docs/visual-review.md` y se exige desde `AGENTS.md`.

**Tech Stack:** Node 22, npm workspaces, `@playwright/test@1.64.1` (pin exacto, igual que Inazuma), Chromium sin `--with-deps` (Fedora), Postgres 17 en podman, Vite 6 + React 19, Express + Socket.IO.

**Spec:** la sección **Contexto** de este documento (no hay spec aparte: se decidió en modo plan con el usuario).

---

## Contexto

### Por qué
El usuario quiere en Pokémon Universe lo mismo que ya tiene en `/home/eru/Documents/Projects/InazumaElevenManager`: Playwright con capturas de revisión que se miran antes de cerrar una tarea de UI, checks automáticos de encaje/legibilidad, y una "papeleta" (la **rúbrica de revisión visual**, DESIGN.md §11 de Inazuma: 8 criterios 0–3, máximo 24, mínimo 19 para integrar, ningún criterio a 0, nota en el commit). Decisiones cerradas con el usuario el 2026-10-31:
- La papeleta **es** la rúbrica §11, adaptada a este proyecto.
- Se replica la **metodología**, no el look: Pokémon Universe mantiene su diseño (responsive, Tailwind, Fredoka/Nunito, tema oscuro por defecto con tema claro).
- Los E2E corren contra una **BD local de desarrollo**, solo en local (sin job de CI).

### Hechos no obvios del repo (verificados; el ejecutor no tiene este transcript)
1. **No existe hoy ninguna BD local**: no hay `.env`, no hay variables en el shell, no hay Postgres escuchando ni contenedores. `podman` 5.8 y `podman-compose` están instalados. La Fase 0 levanta todo eso.
2. **El servidor no carga `.env`** (`tsx watch src/index.ts` solo ve el shell). Node 22.23 tiene `process.loadEnvFile`; el `playwright.config.ts` carga `.env` y pasa `env` a `webServer`.
3. **El servidor exige catálogo seedeado**: `loadPokemonCatalog()` lanza `'Pokémon catalog is empty. Run npm run db:seed.'`. El seed (`apps/server/prisma/seed.ts`) descarga 1025 Pokémon de PokéAPI (una vez, minutos). `DATA_SYNC_ENABLED=false` evita el sync de TCG y el scheduler.
4. **Rate limits** en `apps/server/src/index.ts:63-68`: global 120/min; `/api/auth` **30 req / 15 min por IP** y `GET /auth/me` cuenta (se llama en cada carga completa de página). Con `reuseExistingServer` el estado del limitador sobrevive entre ejecuciones: la segunda tanda falla sin un interruptor. No hay variable para desactivarlo: se añade (Tarea 1).
5. **Salas en memoria** (`InMemoryRoomStore`): reiniciar el servidor las borra. Un invitado nuevo = JWT nuevo = usuario nuevo, así que usar un invitado fresco por test evita `'Already in a room'`.
6. **Invitado no toca BD**: `POST /api/auth/guest` da cookie `pu_session` (httpOnly, `sameSite: lax`). El socket exige esa cookie. Todo pasa por el proxy de Vite (`/api` y `/socket.io` → `:3001`), así que `baseURL` es `http://localhost:5173` y **no** se define `VITE_API_URL` (cross-origin + lax rompería el handshake).
7. **`apps/server` compila `shared` desde `dist`**: hay que `npm run build -w @pokemon-universe/shared` antes de arrancar el servidor.
8. **Vitest coge cualquier `*.test.ts` del workspace**: los specs se llaman `*.spec.ts` y el workspace `e2e` no tiene script `test` para que `npm test` no cambie.
9. `scripts/check-public-boundary.mjs` solo mira `packages/shared/src`: una carpeta raíz nueva no le afecta.
10. Movimiento: `styles.css:157-164` ya respeta `prefers-reduced-motion` → `use.reducedMotion: 'reduce'` sustituye al `?static` de Inazuma. Tema: `index.html:8` lee `localStorage['pokemon-universe-theme']` (`'light'|'dark'`) → se fija con `addInitScript`. Fuentes desde Google Fonts → esperar `document.fonts.ready`.
11. Dos checks de Inazuma **no valen tal cual**: "sin scroll de página" (esta app hace scroll vertical; se exige solo **sin scroll horizontal**) y "texto ≥ 13 px" (la app usa `text-xs` = 12 px y badges a `.68rem` ≈ 10,9 px). Umbral aquí: **12 px**; los badges `.experimental-badge` y `.recommended-badge` se suben a `text-xs`.
12. Locators disponibles (todo el texto en español, casi sin `data-testid`):
    - AuthPage: `getByRole('tab', { name: 'Entrar'|'Registro'|'Invitado' })`, `getByLabel('Email')`, `getByLabel('Contraseña')`, `getByLabel('Tu nombre temporal')`, botones `'Iniciar sesión'`, `'Crear cuenta'`, `'Continuar como invitado'`; errores en `role="alert"`; `/auth?mode=guest` abre la pestaña invitado. Éxito → navega a `/play`.
    - PlayPage (`h1` "Entrar en partida"): botón `'Crear sala privada'` (deshabilitado hasta que conecta el socket), input `#room-code`, botón `'Unirse a la sala'`. Éxito → `/room`.
    - Lobby (`h2`/heading "Lobby de la sala"): código en botón `aria-label="Copiar código de sala XXXXXX"`; no-host: botón `'Marcarme listo'` → `'Estoy listo'` (`aria-pressed`); host: botón `'Empezar partida'` con `#start-help` = `'La sala está lista.'` cuando puede empezar; botón `'Salir'`.
    - Juego por defecto `pokedex-distance` (2+ jugadores): al empezar, `PokedexDistanceGame.tsx` muestra heading `'En la ronda'`.
    - Home: enlace `'Empezar a jugar'` → `/auth`; `'Entrar como invitado'` → `/auth?mode=guest`.
    - Salud del servidor: `GET /api/health` (`apps/server/src/http/routes.ts:29`).
13. Convenciones: TS ESM, 2 espacios, comillas simples, punto y coma; commits de una línea en español, terminados con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (o el modelo que ejecute).

### Qué replica de Inazuma y qué cambia
| Inazuma | Pokémon Universe |
|---|---|
| `tests/e2e/*.spec.ts`, `helpers.ts`, `layout.ts` | `e2e/tests/*.spec.ts`, `e2e/src/helpers.ts`, `e2e/src/layout.ts` |
| `capture()` → PNG + sin scroll de página + `measureLayout` | igual, pero "sin scroll horizontal" y umbral 12 px |
| `SIZES` 1280×720, 1920×1080 | + móvil 390×844 |
| `?static` | `reducedMotion: 'reduce'` + `animations: 'disabled'` en el screenshot |
| `resetStorage()` (IndexedDB) | `loginAsGuest()` (contexto nuevo = sesión nueva) |
| `getByTestId` en todo | rol/etiqueta (ya accesibles); `data-testid` solo si no hay asa |
| `contrast.ts` (texto sobre imagen de fondo) | no se porta (no hay fondo de imagen); YAGNI |
| `/dev/ui` galería | no existe; fuera de alcance |
| capturas versionadas en `__screenshots__` | versionadas en `e2e/screenshots/` (conjunto curado) |
| DESIGN.md §11 + CLAUDE.md reglas 1 y 7 | `docs/visual-review.md` + párrafo en `AGENTS.md` |

## Global Constraints
- `@playwright/test` **1.64.1** exacto; solo proyecto `chromium`; `npx playwright install chromium` sin `--with-deps`.
- `workers: 1`, `fullyParallel: false`, `reporter: [['list']]`, `trace: 'retain-on-failure'`.
- Specs, comentarios, nombres de captura y documentación **en español**.
- `npm test`, `npm run lint`, `npm run typecheck` deben seguir pasando; `npm test` **no** ejecuta Playwright.
- Nada de lógica de juego ni secretos en el cliente (docs/architecture.md); el interruptor de rate limit solo actúa fuera de `production`.
- Sin `VITE_API_URL`; `baseURL` = `http://localhost:5173`.
- Ningún test registra usuarios (dejaría filas): solo invitado y login inválido.

## Review Focus
1. **Segunda ejecución seguida** (limitador de auth con estado): `RATE_LIMIT_DISABLED=true` debe anular los dos `rateLimit` → test en Tarea 1 y verificación "dos `npm run test:e2e` seguidos pasan" en Tarea 7.
2. **Servidor aún arrancando cuando Vite ya responde** (catálogo tarda): `webServer` del servidor con `url: /api/health` antes del de Vite → Tarea 2.
3. **Captura antes de que carguen las fuentes** (Google Fonts): `capture()` espera `document.fonts.ready` → Tarea 3.
4. **Tema claro**: los overrides `:root[data-theme='light'] .text-*` de `styles.css:54-57` deben verse en una captura clara → Tarea 4 captura `auth` en claro.
5. **Botón "Crear sala privada" deshabilitado hasta conectar el socket**: `createRoom()` usa `toBeEnabled()` antes de hacer clic → Tarea 5.

---

### Tarea 0: Entorno local (Postgres + `.env` + seed)

**Files:**
- Create: `compose.local.yaml`
- Create: `.env` (ignorado por git; se genera desde `.env.example`)
- Modify: `package.json` (raíz): scripts `db:up`, `db:down`
- Modify: `.gitignore`: añadir `.data/`

**Interfaces:**
- Produces: Postgres en `localhost:5432` con usuario/BD `pokemon`/`pokemon_universe` y catálogo seedeado; `.env` con el bloque "Desarrollo local sin Compose" de `.env.example` (quitando `VITE_API_URL`, con `JWT_SECRET` de ≥ 32 caracteres aleatorios, `DATA_SYNC_ENABLED=false`).

- [ ] **Paso 1: `compose.local.yaml`** con un solo servicio `postgres` (`image: postgres:17-alpine`, `POSTGRES_DB=pokemon_universe`, `POSTGRES_USER=pokemon`, `POSTGRES_PASSWORD=pokemon`, `ports: ["5432:5432"]`, volumen `pokemon_universe_local_pg`, healthcheck `pg_isready -U pokemon -d pokemon_universe`). Comentario de cabecera: "Solo desarrollo local y E2E; producción usa compose.yaml".
- [ ] **Paso 2: scripts raíz** `"db:up": "podman-compose -f compose.local.yaml up -d"`, `"db:down": "podman-compose -f compose.local.yaml down"`.
- [ ] **Paso 3: `.env`**: copiar el bloque local de `.env.example` (`NODE_ENV=development`, `PORT=3001`, `WEB_ORIGIN=http://localhost:5173`, `DATABASE_URL=postgresql://pokemon:pokemon@localhost:5432/pokemon_universe?schema=public`, `JWT_SECRET=<openssl rand -hex 32>`, `COOKIE_SECURE=false`, `ROOM_MAX_PLAYERS=8`, `RECONNECT_GRACE_MS=30000`, `DATA_SYNC_ENABLED=false`). Sin `VITE_API_URL`.
- [ ] **Paso 4: arrancar y seedear**
  ```bash
  npm run db:up && sleep 5
  npm run build -w @pokemon-universe/shared
  set -a && . ./.env && set +a
  npm run db:deploy -w @pokemon-universe/server    # aplica las migraciones existentes sin preguntar
  npm run db:seed                                    # PokéAPI, una vez, minutos
  ```
  Esperado: el seed termina sin error y `SELECT count(*) FROM "Pokemon"` (o la tabla que use el schema) ≥ 1025.
- [ ] **Paso 5: comprobar arranque**: con el `.env` cargado en el shell, `npm run dev -w @pokemon-universe/server` → log `API listening on :3001 with 1025 Pokémon…`; `curl -s localhost:3001/api/health` → 200. Parar el servidor.
- [ ] **Paso 6: `.gitignore`** añade `.data/` (avatares de dev). Commit: `Postgres local con podman para desarrollo y E2E`.

---

### Tarea 1: Interruptor `RATE_LIMIT_DISABLED` en el servidor

**Files:**
- Modify: `apps/server/src/config.ts` (schema Zod)
- Create: `apps/server/src/http/rate-limit.ts`
- Test: `apps/server/src/http/rate-limit.test.ts`
- Modify: `apps/server/src/index.ts:63-68`

**Interfaces:**
- Produces: `RATE_LIMIT_DISABLED: z.enum(['true','false']).default('false').transform(v => v === 'true')` en `env`; `export function rateLimitDisabled(env: { NODE_ENV: string; RATE_LIMIT_DISABLED: boolean }): boolean` que devuelve `true` solo si `RATE_LIMIT_DISABLED && NODE_ENV !== 'production'`.

- [ ] **Paso 1: test** en `rate-limit.test.ts`:
  - `rateLimitDisabled({ NODE_ENV: 'development', RATE_LIMIT_DISABLED: true })` → `true`
  - `rateLimitDisabled({ NODE_ENV: 'production', RATE_LIMIT_DISABLED: true })` → `false`
  - `rateLimitDisabled({ NODE_ENV: 'development', RATE_LIMIT_DISABLED: false })` → `false`
- [ ] **Paso 2:** `npm test -w @pokemon-universe/server -- rate-limit` → FAIL (módulo no existe).
- [ ] **Paso 3:** implementar `rate-limit.ts` y la entrada del schema en `config.ts`.
- [ ] **Paso 4:** en `index.ts`, calcular `const skipAll = rateLimitDisabled(env);` y en los dos `rateLimit({...})` combinar: `skip: (req) => skipAll || <condición existente>`. El tercer limitador, `gameImageRateLimit` en `apps/server/src/http/routes.ts`, se deja como está a propósito (los specs no lo tocan).
- [ ] **Paso 5:** `npm test -w @pokemon-universe/server`, `npm run typecheck`, `npm run lint` → PASS. Añadir `RATE_LIMIT_DISABLED=false` con comentario al bloque local de `.env.example`.
- [ ] **Paso 6:** Commit: `Interruptor de rate limit para desarrollo y E2E`.

---

### Tarea 2: Workspace `e2e/` con Playwright y spec de humo

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/tests/inicio.spec.ts`
- Modify: `package.json` (raíz): `workspaces` += `"e2e"`; scripts `"test:e2e": "npm run e2e -w @pokemon-universe/e2e"`, `"test:e2e:ui": "npm run e2e:ui -w @pokemon-universe/e2e"`; `typecheck` += `&& npm run typecheck -w @pokemon-universe/e2e`
- Modify: `.gitignore`: `test-results/`, `playwright-report/`, `blob-report/`

**Interfaces:**
- Produces: `npm run test:e2e` ejecuta Playwright arrancando servidor y web; `e2e/screenshots/` es la carpeta de capturas.

- [ ] **Paso 1: `e2e/package.json`**: `name: @pokemon-universe/e2e`, `private`, `type: module`, scripts `"e2e": "playwright test"`, `"e2e:ui": "playwright test --ui"`, `"lint": "eslint . --max-warnings=0"`, `"typecheck": "tsc -p tsconfig.json --pretty false"`. devDeps: `"@playwright/test": "1.64.1"`, `"@types/node"` (la misma versión que use `apps/server`). **Sin script `test`.**
- [ ] **Paso 2: `e2e/tsconfig.json`**: `extends ../tsconfig.base.json`, `noEmit: true`, `types: ["node"]`, `include: ["**/*.ts"]`, `exclude: ["node_modules", "test-results", "playwright-report"]`.
- [ ] **Paso 3: `e2e/playwright.config.ts`** (cabecera comentada como en Inazuma: solo Chromium, Fedora sin `--with-deps`, capturas en `e2e/screenshots`):
  - `try { process.loadEnvFile(new URL('../.env', import.meta.url).pathname); } catch { /* sin .env: se espera env en el shell */ }`
  - `testDir: 'tests'`, `timeout: 120_000`, `expect: { timeout: 15_000 }`, `fullyParallel: false`, `workers: 1`, `reporter: [['list']]`
  - `use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', reducedMotion: 'reduce', colorScheme: 'dark', viewport: { width: 1280, height: 720 }, locale: 'es-ES' }` — **`colorScheme: 'dark'` es obligatorio**: Playwright emula `light` por defecto y `index.html:8` cae en `prefers-color-scheme` si no hay nada en `localStorage`, así que sin esto todas las capturas saldrían en tema claro.
  - `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }]`
  - `webServer: [ { command: 'npm run build -w @pokemon-universe/shared && npm run dev -w @pokemon-universe/server', url: 'http://localhost:3001/api/health', cwd: '..', reuseExistingServer: !process.env.CI, timeout: 180_000, env: { DATA_SYNC_ENABLED: 'false', RATE_LIMIT_DISABLED: 'true', COOKIE_SECURE: 'false' } }, { command: 'npm run dev -w @pokemon-universe/web', url: 'http://localhost:5173', cwd: '..', reuseExistingServer: !process.env.CI, timeout: 60_000, env: { VITE_API_URL: '' } } ]` — no hacer `...process.env` en `env` (Playwright ya hereda el entorno del proceso, que `loadEnvFile` ha rellenado, y el spread rompe el typecheck por `string | undefined`). `VITE_API_URL: ''` en la web evita que un valor suelto del shell mande al navegador cross-origin.
  - Si `@types/node` no declara `loadEnvFile`, usar `(process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(...)`.
- [ ] **Paso 4:** `npm install` (raíz) y `npx playwright install chromium` (desde raíz; caché `~/.cache/ms-playwright` está vacía hoy).
- [ ] **Paso 5: `tests/inicio.spec.ts`** (sin helpers aún): `test('la portada carga sin errores y lleva al acceso', …)`: recoge `pageerror` y `console.error` en un array; `goto('/')`; `expect(getByRole('link', { name: 'Empezar a jugar' })).toBeVisible()`; clic → `expect(page).toHaveURL(/\/auth$/)`; `expect(errors).toEqual([])`.
- [ ] **Paso 6:** `npm run test:e2e` → `1 passed`. `npm run lint`, `npm run typecheck`, `npm test` → PASS (confirmar que `npm test` no ejecutó Playwright).
- [ ] **Paso 7:** Commit: `Playwright E2E: workspace e2e y spec de portada`.

---

### Tarea 3: Helpers, medición de encaje y `capture()`

**Files:**
- Create: `e2e/src/layout.ts`, `e2e/src/helpers.ts`
- Modify: `e2e/tests/inicio.spec.ts` (usar helpers y capturar)
- Modify: `apps/web/src/styles.css:83-84` (badges a `text-xs`) si la línea base lo confirma

**Interfaces:**
- Produces (`helpers.ts`):
  - `export const SIZES = [{ w: 1280, h: 720 }, { w: 1920, h: 1080 }, { w: 390, h: 844 }] as const;` y `export const DESKTOP = SIZES.slice(0, 2)`
  - `export type Theme = 'dark' | 'light'`; `export async function pinTheme(context: BrowserContext, theme: Theme): Promise<void>` (`addInitScript` → `localStorage.setItem('pokemon-universe-theme', theme)`)
  - `export function collectErrors(page: Page): string[]`
  - `export async function capture(page: Page, name: string): Promise<void>` — espera `document.fonts.ready` + 250 ms, `expectNoHorizontalScroll`, `page.screenshot({ path: \`screenshots/${name}-${w}x${h}.png\`, animations: 'disabled' })` (Playwright corre con cwd = `e2e/`, así que la ruta es relativa a ese workspace y acaba en `e2e/screenshots/`), `measureLayout` → si `process.env.PU_LAYOUT_LOG` está definido, anexa los problemas en Markdown a ese fichero y no falla; si no, `expect(problems, \`${name}-${w}x${h}: encaje y legibilidad\`).toEqual([])`.
  - `export async function expectNoHorizontalScroll(page: Page, name: string): Promise<void>` (`scrollWidth - innerWidth ≤ 0` en `documentElement` y `body`)
  - `export async function loginAsGuest(page: Page, name: string): Promise<void>` — `goto('/auth?mode=guest')`, `getByLabel('Tu nombre temporal').fill(name)`, clic `'Continuar como invitado'`, `expect(page).toHaveURL(/\/play$/)`.
  - `export function uniqueName(prefix: string): string` → `${prefix} ${Date.now().toString(36).slice(-4)}` (≤ 24 caracteres, solo letras/números/espacio).
- Produces (`layout.ts`): `export interface LayoutReport { small: string[]; overlaps: string[]; cuts: string[]; clipped: string[] }` y `export async function measureLayout(page: Page, minFontPx = 12): Promise<LayoutReport>`.

- [ ] **Paso 1: `layout.ts`**: portar `measureLayout` de `/home/eru/Documents/Projects/InazumaElevenManager/tests/e2e/layout.ts` con estos cambios: raíz = `document.body` (quitar `[data-testid="stage"]` y la lógica `outgoing`/`[data-screen-active]`); umbral `minFontPx` parametrizado (12); capas que no se comparan entre sí: `[role="dialog"], dialog, [role="alert"], [role="tooltip"], [data-layer]`; ignorar `[data-layout-ignore]` y descendientes; en `clipped`, parar también en contenedores con `overflow-x: auto|scroll` (carruseles). Mantener los textos de los problemas en español (`< 12 px: …`, `solape: …`, `recorte sin title: …`, `fuera de su caja: …`).
- [ ] **Paso 2: `helpers.ts`** con las firmas de arriba. `capture` toma `w,h` de `page.viewportSize()`.
- [ ] **Paso 3: línea base**: cambiar `inicio.spec.ts` a `for (const { w, h } of SIZES) test(\`portada a ${w}×${h}\`, …)` con `setViewportSize`, `expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')` (confirma el `colorScheme` de la Tarea 2), `capture(page, 'portada')` y también `goto('/auth')` + `capture(page, 'acceso-entrar')`. Ejecutar `PU_LAYOUT_LOG=/tmp/pu-layout.md npm run test:e2e` y leer el log.
- [ ] **Paso 3b: comprobar que el check de scroll horizontal dispara**: `styles.css:40-41` pone `overflow-x: clip` en `html` y `body`. En un test temporal, inyectar con `page.evaluate` un `div` de 3000 px de ancho y comprobar que `expectNoHorizontalScroll` falla; si `clip` oculta el desborde a `scrollWidth`, cambiar la medición a `max(getBoundingClientRect().right)` de todos los elementos visibles frente a `innerWidth`. Quitar el test temporal.
- [ ] **Paso 3c: errores de consola**: si la línea base muestra `console.error` previos (React en dev: keys, `act`, avisos de Vite o socket), arreglar la causa cuando sea de la app; permitir en `collectErrors` solo mensajes exactos de herramientas (lista explícita en `helpers.ts` con comentario del motivo). Nunca quitar el `expect(errors).toEqual([])`.
- [ ] **Paso 4: decidir umbrales con evidencia**: si los únicos `< 12 px` son `.experimental-badge`/`.recommended-badge` (`text-[.68rem]`), cambiarlos a `text-xs` en `styles.css`; cualquier otro problema con ≤ 3 ocurrencias se arregla en la UI; si hay más, se anota como excepción conocida en `docs/visual-review.md` (Tarea 6) y se marca con `data-layout-ignore` **solo** si es un falso positivo del medidor. No bajar el umbral.
- [ ] **Paso 5:** `npm run test:e2e` sin `PU_LAYOUT_LOG` → PASS; revisar los PNG de `e2e/screenshots/` a ojo (abrir con `Read`).
- [ ] **Paso 6:** `npm run lint && npm run typecheck` → PASS. Commit: `E2E: helpers, medición de encaje y capturas de portada y acceso`.

---

### Tarea 4: Spec de acceso (pestañas, error de login, invitado, tema claro)

**Files:**
- Create: `e2e/tests/acceso.spec.ts`

- [ ] **Paso 1:** `for (const { w, h } of SIZES) test(\`acceso a ${w}×${h}\`)`:
  - `goto('/auth')`; pestaña `'Entrar'` con `aria-selected="true"`; `capture('acceso-entrar')` (ya existe en inicio: moverla aquí y quitarla de `inicio.spec.ts`).
  - Login inválido: `getByLabel('Email').fill('nadie@example.com')`, `getByLabel('Contraseña').fill('x')`, clic `'Iniciar sesión'` → `getByRole('alert')` visible con texto no vacío; `capture('acceso-error')`.
  - Clic pestaña `'Registro'` → `getByLabel('Nombre de usuario')` visible; `capture('acceso-registro')` (no se envía).
  - Clic pestaña `'Invitado'` → `getByLabel('Tu nombre temporal')` visible; `capture('acceso-invitado')`.
  - `loginAsGuest(page, uniqueName('E2E'))` → URL `/play`; `expect(getByRole('heading', { name: 'Entrar en partida' })).toBeVisible()`; `capture('entrar-en-partida')`.
  - `expect(errors).toEqual([])`.
- [ ] **Paso 2:** `test('acceso en tema claro a 1280×720')`: `pinTheme(context, 'light')` antes de `goto`; `expect(page.locator('html')).toHaveAttribute('data-theme', 'light')`; `capture('acceso-entrar-claro')`.
- [ ] **Paso 3:** `npm run test:e2e` → PASS; revisar PNG. Commit: `E2E de acceso: pestañas, error de login, invitado y tema claro`.

---

### Tarea 5: Spec de sala con dos navegadores (crear, unirse, listo, empezar)

**Files:**
- Modify: `e2e/src/helpers.ts` (añadir `createRoom`, `joinRoom`)
- Create: `e2e/tests/sala.spec.ts`
- Modify (solo si hace falta un asa): `apps/web/src/room/Lobby.tsx:153` añadir `data-testid="room-code"` al `<strong>` del código

**Interfaces:**
- Produces: `export async function createRoom(page: Page): Promise<string>` — en `/play`, `expect(getByRole('button', { name: 'Crear sala privada' })).toBeEnabled()`, clic, `expect(page).toHaveURL(/\/room$/)`, lee el código de `getByRole('button', { name: /Copiar código de sala/ })` → `aria-label.match(/([A-Z2-9]{6})$/)![1]`.
- Produces: `export async function joinRoom(page: Page, code: string): Promise<void>` — `locator('#room-code').fill(code)`, clic `'Unirse a la sala'`, `toHaveURL(/\/room$/)`.

- [ ] **Paso 1:** `test('dos jugadores crean una sala, se unen y empiezan la partida')` con `browser.newContext()` ×2 (host y invitado), cada uno con `collectErrors`:
  - host: `loginAsGuest(host, uniqueName('Host'))`, `code = await createRoom(host)`; `expect(host.getByRole('heading', { name: 'Lobby de la sala' })).toBeVisible()`; `expect(host.locator('#start-help')).not.toHaveText('La sala está lista.')` (leer en `Lobby.tsx` el orden de `startReason` antes de afirmar un texto concreto como "Se necesitan al menos 2"); `capture(host, 'lobby-host-solo')`.
  - invitado: `loginAsGuest(guest, uniqueName('Inv'))`, `joinRoom(guest, code)`; en host aparece el nombre del invitado y el chip `/2\s*\/\s*8/`; `capture(guest, 'lobby-invitado')`.
  - Locators estrictos: puede haber más de un `role="alert"` (error de PlayPage + banner de conexión de `RoomSessionLayout`), así que usar `getByRole('alert').filter({ hasText: /.+/ }).first()` o filtrar por texto.
  - invitado: clic `'Marcarme listo'` → botón `'Estoy listo'` con `aria-pressed="true"`.
  - host: `expect(host.locator('#start-help')).toHaveText('La sala está lista.')`; `capture(host, 'lobby-host-lista')`; clic `'Empezar partida'` → `expect(host.getByRole('heading', { name: 'En la ronda' })).toBeVisible({ timeout: 20_000 })` y lo mismo en `guest`; `capture(host, 'juego-pokedex-distance')`.
  - `expect(hostErrors).toEqual([])`, `expect(guestErrors).toEqual([])`; cerrar contextos.
- [ ] **Paso 2:** `test('un código inexistente muestra error')`: `loginAsGuest`, `#room-code` = `'ZZZZZZ'`, clic `'Unirse a la sala'` → `getByRole('alert').first()` visible con texto no vacío; sigue en `/play`.
- [ ] **Paso 3:** `for (const { w, h } of SIZES) test(\`lobby a ${w}×${h}\`)`: host + invitado unidos (sin empezar), `capture(host, 'lobby')` en cada tamaño (el móvil es el que más riesgo tiene de solapes).
- [ ] **Paso 4:** `npm run test:e2e` → PASS; ejecutar **otra vez** seguido → PASS (demuestra el interruptor de rate limit y los invitados frescos). Revisar PNG.
- [ ] **Paso 5:** Commit: `E2E de sala: crear, unirse, listo y empezar con dos navegadores`.

---

### Tarea 6: Rúbrica de revisión visual ("papeleta") y reglas en AGENTS.md

**Files:**
- Create: `docs/visual-review.md`
- Modify: `AGENTS.md` (secciones "Build, Test, and Development Commands" y "Testing Guidelines")
- Create: `e2e/README.md` (corto: requisitos Fedora, `db:up`, `.env`, `test:e2e`, `PU_LAYOUT_LOG`, cómo añadir un spec, dónde van las capturas)

- [ ] **Paso 1: `docs/visual-review.md`** con:
  1. Propósito y cuándo se aplica (cada pantalla nueva o rediseñada; capturas a 1280×720, 1920×1080 y 390×844 en `e2e/screenshots/`; la nota va en el commit o PR con el formato `Rúbrica <pantalla>: a, b, c, d, e, f, g, h = N/24`).
  2. Regla de integración: **≥ 19 y ningún criterio a 0; un 0 en "Solo componentes del sistema" o en "Encaje" bloquea aunque el total llegue.**
  3. Tabla de 8 criterios 0–3, adaptada (texto exacto a usar):

  | Criterio | 0 | 1 | 2 | 3 |
  |---|---|---|---|---|
  | Jerarquía | no se sabe qué hacer primero | la acción principal existe pero compite | una acción principal clara, resto ordenado | la mirada va sola: acción principal, dato clave, resto en calma |
  | Legibilidad | texto < 12 px, cortado o sin `title` al truncar | 12 px pero abreviaturas improvisadas | 12 px, truncado con `title`, numerales tabulares donde hay cifras | además, nombres y cifras alineados y contraste AA en ambos temas |
  | Solo componentes del sistema | botones, tarjetas o campos propios en vez de `.btn-*`, `.card`, `.field`, `.chip`… | una clase adaptada sin añadirla a `styles.css` | todo con las clases de `@layer components`, un estado nuevo documentado | además, el estado nuevo está en `styles.css` y reutilizado donde toca |
  | Tokens y temas | colores literales o solo probado en un tema | tokens pero sin revisar el tema claro | tokens (`ink`, `surface`, `berry`…) y correcto en oscuro y claro | además, los overrides de `[data-theme='light']` se usan donde el contraste lo pide |
  | Encaje | scroll horizontal o desborde en algún tamaño | cabe a 1280 pero no se ha mirado a 390 ni a 1920 | cabe en 390, 1280 y 1920 sin desbordes ni solapes (`measureLayout` limpio) | además, el espacio sobrante a 1920 se aprovecha o se deja limpio a propósito |
  | Interacción | falta algún estado (hover, foco, deshabilitado, cargando) | estados presentes pero el teclado no llega a todo | hover, foco visible, deshabilitado, `aria-busy`/cargando; teclado completo; objetivos ≥ 44 px | además, foco inicial y retorno de foco correctos (diálogos, errores con `role="alert"`) |
  | Movimiento | animaciones que no sean transform/opacity o sin `prefers-reduced-motion` | solo transform/opacity pero sin reducción | dentro del presupuesto (≤ 400 ms) y con reducción en `styles.css` | además, una animación con intención (revelado, acierto) |
  | Estados de datos | falta vacío, carga o error | existen pero sin acción | los tres con texto claro y acción (`.empty-state`, `.skeleton`, `.status-error`) | además, el estado vacío enseña a jugar |

  4. Procedimiento: `npm run test:e2e` (o solo el spec de la pantalla), abrir las capturas, puntuar, escribir la línea en el commit. Excepciones conocidas del medidor (lista, inicialmente vacía o con lo que saliera de la Tarea 3).
- [ ] **Paso 2: `AGENTS.md`**:
  - En comandos: `npm run db:up` levanta Postgres local (podman); `npm run test:e2e` ejecuta Playwright (requiere `.env` local, catálogo seedeado y `npx playwright install chromium`; en Fedora sin `--with-deps`).
  - En Testing Guidelines, párrafo nuevo (adaptación de las reglas 1 y 7 del CLAUDE.md de Inazuma): "**After every UI change, verify with Playwright**: run the relevant `e2e/tests/*.spec.ts`, capture at 1280×720, 1920×1080 and 390×844 into `e2e/screenshots/`, confirm there is no horizontal scroll and `measureLayout` reports nothing, and look at the images before considering the task done. Every new or redesigned screen is scored with the visual review rubric in `docs/visual-review.md` (minimum 19/24, no criterion at 0) and the score goes in the commit or PR. UI is built only with the component classes in `apps/web/src/styles.css` and the theme tokens; text is never below 12 px; animations use only transform/opacity and respect `prefers-reduced-motion`."
  - En estructura: `e2e/` contiene los E2E de Playwright (`tests/*.spec.ts`, `src/helpers.ts`, `src/layout.ts`, `screenshots/`).
- [ ] **Paso 3:** puntuar con la rúbrica las pantallas capturadas (portada, acceso, entrar en partida, lobby, juego) y anotar las notas en el commit. Commit: `Rúbrica de revisión visual y reglas E2E en AGENTS.md` + línea `Rúbrica …`.

---

### Tarea 7: Verificación final

- [ ] `npm run lint && npm run typecheck && npm test` → PASS (ninguno ejecuta Playwright).
- [ ] `npm run test:e2e` dos veces seguidas → PASS ambas (sin reiniciar el servidor que dejó Playwright si usa `reuseExistingServer`).
- [ ] `git status`: no hay `test-results/`, `playwright-report/`, `.env` ni `.data/` sin ignorar; `e2e/screenshots/*.png` versionados.
- [ ] Revisar a ojo las capturas de `e2e/screenshots/` una última vez.
- [ ] Seguir `superpowers:finishing-a-development-branch` para integrar.

---

## Fuera de alcance (posibles planes posteriores)
- Rediseño al look "Arcade DS" de Inazuma.
- Job de E2E en GitHub Actions (necesitaría seed con red desde Actions o un volcado cacheado).
- Un spec por minijuego (hay 29 en `apps/web/src/games/`); empezar por los de 2 jugadores reutilizando `createRoom`/`joinRoom`.
- Galería de componentes tipo `/dev/ui` y port de `contrast.ts`.
