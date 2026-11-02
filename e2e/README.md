# E2E con Playwright

Pruebas de extremo a extremo de Pokémon Universe en Chromium, contra la base de datos local de
desarrollo (solo en local, sin CI). Además de comprobar los flujos, cada `capture()` deja una captura
de revisión y mide encaje y legibilidad. Las capturas se puntúan con la rúbrica de
[`docs/visual-review.md`](../docs/visual-review.md).

## Primera vez (Fedora)

Requisitos: Node 22+, `podman` y `podman-compose`, y red (el seed descarga de PokéAPI).

1. Crea `.env` en la raíz con el bloque "Desarrollo local sin Compose" de `.env.example`, **quitando
   la línea `VITE_API_URL`** (todo pasa por el proxy de Vite; con ella el navegador va cross-origin y
   la cookie de sesión no llega al socket) y con `DATA_SYNC_ENABLED=false`. El `.env` queda así:

   ```sh
   NODE_ENV=development
   PORT=3001
   WEB_ORIGIN=http://localhost:5173
   DATABASE_URL=postgresql://pokemon:pokemon@localhost:5432/pokemon_universe?schema=public
   JWT_SECRET=replace-with-at-least-32-random-characters
   COOKIE_SECURE=false
   RATE_LIMIT_DISABLED=false
   ROOM_MAX_PLAYERS=8
   RECONNECT_GRACE_MS=30000
   DATA_SYNC_ENABLED=false
   ```

   Sin `VITE_API_URL`. (`RATE_LIMIT_DISABLED` lo pone a `true` la configuración de Playwright.)
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
npm run test:e2e:java   # la misma suite con las salas en el /ws del backend Java
cd e2e && npx playwright test tests/sala.spec.ts   # un solo spec
```

`test:e2e` y `test:e2e:java` ejecutan todos los specs, una vez por transporte: la segunda exporta
`VITE_REALTIME=java` y el project se llama `chromium-java`. Como la web arrancada se reutiliza
(`reuseExistingServer`), para la pasada Java no puede haber ya una web con el transporte de Node en el puerto.

### Un test por minijuego: `juegos.spec.ts`

```sh
npm run test:e2e -- juegos        # los 28 minijuegos con Socket.IO (Node)
npm run test:e2e:java -- juegos   # los mismos con el /ws de Java
```

Lee los ids de `backend/src/main/resources/games/registry.json` y genera un test por juego: abre
`max(3, minPlayers)` invitados, el host crea la sala, los demás se unen por código, el host elige el
juego por su nombre del manifest, los invitados se marcan listos y el host pulsa «Empezar partida».
Después comprueba que todos salen del lobby y pintan la pantalla de juego, que cada página abrió el
WebSocket del transporte de la pasada (`/ws` en `chromium-java`, `/socket.io/` en `chromium`) y ninguno del otro, que
nunca sale «Este minijuego todavía no está disponible en el servidor Java.», que no hay errores de
consola y que a 1280×720 no hay scroll horizontal (`measureLayout` se anota, ver «Encaje»). En `whos-that-pokemon`,
`zoomed-pokemon`, `shiny-vote` y `pokemon-cry-quiz` exige además que la primera respuesta a
`/api/rooms/*/games/*/rounds/*/options/*/(sprite|audio)` sea 200 con `image/png` o `audio/*`.

- **Saltos**: `tcg-higher-lower` (sin cartas TCG) y `pokemon-palette-guess` (sin `metadata.palette` en
  la BD) se saltan **solo** si el lobby muestra el literal de no disponibilidad del servidor; el motivo
  queda en el skip. Con los datos cargados se prueban como los demás.
- **Capturas**: un juego de cada lote (`type-duel`, `poke-taboo`, `most-likely-to`, `learnset-guess`,
  `whos-that-pokemon`, `who-is-who-pokemon`, `pokemon-bingo`, `sketchmon`) se guarda como
  `screenshots/juego-<id>-<ancho>x<alto>.png` a los tres tamaños, antes de la aserción de encaje.
- **Encaje**: a 1280×720 el scroll horizontal siempre hace fallar el test, pero lo que encuentre
  `measureLayout` se adjunta como anotación `encaje` del test y no lo hace fallar. Para la pasada de
  contrato (`measureLayout` vacío), `PU_LAYOUT_STRICT=1 npm run test:e2e -- juegos`. Hoy esa pasada
  falla en la mayoría de juegos por deuda de UI previa: etiquetas de `ServerTimer` y similares a
  `text-[10px]`, iniciales de `Avatar` `xs` a `text-[9px]` y la cabecera fija tapando contenido cuando
  el autofoco del buscador desplaza la página.
- **Detalle por juego**: el spec deja anotaciones (recurso comprobado, título visible y encaje a
  los tres tamaños). `npm run` se come `--reporter`, así que para verlas lánzalo desde `e2e/`:
  `PLAYWRIGHT_JSON_OUTPUT_FILE=juegos.json npx playwright test juegos --reporter=list,json`
  (con `VITE_REALTIME=java` delante para la pasada Java).

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
