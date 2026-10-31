# E2E con Playwright

Pruebas de extremo a extremo de Pokémon Universe en Chromium, contra la base de datos local de
desarrollo (solo en local, sin CI). Además de comprobar los flujos, cada `capture()` deja una captura
de revisión y mide encaje y legibilidad. Las capturas se puntúan con la rúbrica de
[`docs/visual-review.md`](../docs/visual-review.md).

## Primera vez (Fedora)

Requisitos: Node 22+, `podman` y `podman-compose`, y red (el seed descarga de PokéAPI).

1. Crea `.env` en la raíz copiando el bloque "Desarrollo local sin Compose" de `.env.example`,
   **sin** `VITE_API_URL` (todo pasa por el proxy de Vite) y con `DATA_SYNC_ENABLED=false`.
2. Desde la raíz del repositorio:

   ```sh
   npm install
   npm run db:up                                  # Postgres local con podman (compose.local.yaml)
   npm run build -w @pokemon-universe/shared
   set -a; . ./.env; set +a                       # carga .env en el shell para Prisma
   npm run db:deploy -w @pokemon-universe/server  # aplica las migraciones
   npm run db:seed                                # catálogo de PokéAPI: tarda minutos
   npx playwright install chromium                # en Fedora sin --with-deps (asume apt)
   ```

Después basta con `npm run db:up` (si el contenedor está parado) y `npm run test:e2e`.

## Ejecutar

```sh
npm run test:e2e        # toda la suite
npm run test:e2e:ui     # modo UI de Playwright
cd e2e && npx playwright test tests/sala.spec.ts   # un solo spec
```

`playwright.config.ts` hace lo siguiente por ti:

- Carga `../.env` con `process.loadEnvFile` (sin `.env`, usa el entorno del shell).
- Arranca el servidor (`:3001`) tras construir `shared`, espera a `GET /api/health`, y luego la web
  (`:5173`). Al servidor le pasa `DATA_SYNC_ENABLED=false`, `RATE_LIMIT_DISABLED=true` y
  `COOKIE_SECURE=false`; a la web, `VITE_API_URL` vacío. `baseURL` es `http://localhost:5173`.
- Un solo worker, Chromium, tema oscuro, `reducedMotion: 'reduce'`, `locale: 'es-ES'`; traza solo
  si falla (`test-results/`, ignorado por git).

**Ojo con `reuseExistingServer`**: si ya tienes `npm run dev` levantado, Playwright lo reutiliza y no
le pasa sus variables. Arráncalo con `RATE_LIMIT_DISABLED=true` (y `DATA_SYNC_ENABLED=false`) o la
segunda tanda seguida chocará con el límite de `/api/auth`. Las salas viven en memoria: reiniciar el
servidor las borra.

## Medición de encaje: `PU_LAYOUT_LOG`

`capture()` hace fallar el spec si hay scroll horizontal o si `measureLayout` (`src/layout.ts`)
encuentra texto de menos de 12 px, solapes, texto recortado sin `title` o controles fuera de su caja.
Para barrer todas las pantallas sin cortar en el primer fallo:

```sh
PU_LAYOUT_LOG=$PWD/layout.log npm run test:e2e
```

Los problemas se añaden al fichero bajo una cabecera `## <captura>-<ancho>x<alto>` y los specs no
fallan por ellos (el scroll horizontal sigue fallando). `[data-layout-ignore]` excluye un elemento
solo si es un falso positivo del medidor; cada uso se apunta en `docs/visual-review.md`.

## Añadir un spec

- Fichero `tests/<pantalla>.spec.ts` (`*.spec.ts`, no `*.test.ts`, para que Vitest no lo coja; este
  workspace no tiene script `test`).
- Recorre los tamaños de revisión con `for (const { w, h } of SIZES)` y `page.setViewportSize`.
- `collectErrors(page)` al principio y `expect(errors).toEqual([])` al final.
- Entra con `loginAsGuest(page, uniqueName('E2E'))` (un invitado nuevo por test; nunca registres
  usuarios). Para salas: `createRoom(page)` devuelve el código y `joinRoom(page, code)` se une; para
  varios jugadores, un `browser.newContext()` por jugador.
- `pinTheme(context, 'light')` para capturar en tema claro.
- Localiza por rol y etiqueta (`getByRole`, `getByLabel`); `data-testid` solo si no hay otra asa.
- `await capture(page, '<pantalla>')` guarda `screenshots/<pantalla>-<ancho>x<alto>.png`.

## Capturas

Las capturas de revisión viven en `e2e/screenshots/` y están versionadas. Cada ejecución las
reescribe, y las que muestran nombres de invitado, códigos de sala o el temporizador cambian
siempre. **Solo se vuelven a commitear al revisar un cambio de UI** (las de esa pantalla); si no,
descártalas:

```sh
git restore e2e/screenshots
```
