# Pokémon Universe · Separación frontend / backend Java 25 — Informe Fases 1–3

> **Estado.** Etapa 1 implementada el 2026-10-31 en la rama `backend-java-etapa-1` y fusionada en `main` en local (sin publicar; falta la primera ejecución real de CI). Lo que queda y los riesgos abiertos están en [`docs/migracion-java-pendientes.md`](../../migracion-java-pendientes.md). Desviación respecto a §0: `/api/tcg/*` figura aquí en la etapa 1, pero el plan lo pasó a la etapa 2 porque depende del ciclo de vida de la caché del catálogo TCG (`CachedTcgCardCatalog`, refrescada por data-sync); en la etapa 1 sigue en Node. Etapa 2A (núcleo de salas: coordinador, `/ws`, motores `higher-lower` y `pokedex-distance`, front bajo `VITE_REALTIME=java`, nginx `/ws`) implementada el 2026-10-31 en la rama `etapa-2a-nucleo-salas`; solo desarrollo y E2E hasta 2D (en producción `/ws` cierra con 4403 mientras `ROOMS_ENABLED=false`). Etapa 2B (los 26 motores restantes, 28/28 con fixtures doradas; proxy de imágenes y gritos de ronda; E2E por juego contra Node y Java) implementada el 2026-11-02 en la rama `etapa-2b-motores`, pendiente de la decisión de integración del usuario; `tcg-higher-lower` y `pokemon-palette-guess` no se pueden lanzar en salas Java hasta que 2C aporte el catálogo TCG y las paletas.

Fecha: 2026-10-31. Estado del repo analizado: `main` en `7fa7cd9`. No se ha modificado nada.

---

## 0. Lo primero: el encargo dice "API REST" y la aplicación no es REST

Antes de las decisiones de stack hay un desajuste entre el encargo y lo que hay en el repositorio, y
conviene resolverlo explícitamente porque condiciona todo lo demás.

**Lo que es REST hoy** (unos 42 endpoints HTTP): autenticación y perfil, avatares, categorías
personalizadas, pares de *Would You Rather*, changelog, feedback, panel admin, health, catálogo
Pokémon/TCG y el proxy de imágenes/audio de las rondas.

**Lo que no es REST y es el corazón del producto**: las salas y los 28 minijuegos. Funcionan sobre
Socket.IO con 21 eventos cliente→servidor (con acuse de recibo y timeout de 8 s), 7 eventos
servidor→cliente, recuperación de estado al reconectar (gracia de 30 s), revisiones monótonas de
snapshot y autenticación por cookie en el *handshake*. Los motores de juego son unas 11.300 líneas
de TypeScript determinista en `packages/shared` (36 ficheros de test) y los ejecuta el servidor.

Por tanto, un backend Java con solo REST no puede sustituir al servidor actual sin perder el 90 % de
la funcionalidad, y la restricción "no elimines funcionalidad existente" es la más dura de todas.
Hay tres formas de cuadrarlo:

| Opción | Qué hace Java | Qué cambia en el front | Riesgo | Cumple "backend en Java" |
|---|---|---|---|---|
| **A. Java lo asume todo** (recomendada) | REST + servidor WebSocket de salas + los 28 motores portados | Sustituir `socket.io-client` por un adaptador WebSocket nativo (~2 ficheros: `lib/socket.ts` y el *command sender*) | Alto: portar ~11k LOC de motores con paridad exacta | Sí |
| B. Java REST + Node para tiempo real | REST, persistencia, data-sync | Ninguno | Bajo | Parcialmente: quedan dos backends |
| C. Java todo con `netty-socketio` | Igual que A | Ninguno | Alto + dependencia de una librería con última release en marzo de 2025, orientada a Java 8 y que abre su propio puerto Netty fuera del servidor HTTP del framework | Sí |

**Recomendación: A, ejecutada por estrangulamiento en dos etapas** para que cada commit sea
verificable y nunca se pierda funcionalidad:

1. **Etapa 1 – Java asume el REST sin efectos sobre salas vivas.** nginx enruta a Java solo las rutas
   que no tocan el estado en memoria de Node: `/api/auth/{register,login,guest,logout,me}`,
   `/api/auth/profile` (lectura), `/api/auth/avatars/*` (lectura desde el volumen compartido),
   `/api/changelog`, `/api/feedback`, `/api/games`, `/api/pokemon`, `/api/tcg/*`. Ambos procesos
   verifican la misma cookie `pu_session` (HS256, mismo secreto y mismas *claims*), así que las sesiones
   existentes sobreviven y el usuario no nota el cambio. **Se quedan en Node hasta la etapa 2** las
   escrituras de categorías, pares WYR y avatares (hoy notifican a los lobbies por *callbacks* en
   proceso: `onChanged → rooms.updateHostCategories`, `onAvatarUpdated → rooms.updateIdentityAvatar`;
   moverlas antes dejaría las cachés de Node obsoletas), el panel admin, el proxy de assets de ronda y
   data-sync. `/api/health` sigue apuntando a Node en nginx durante la etapa 1 porque `deploy.sh` lo usa
   para validar el despliegue completo; Java expone el suyo en `/q/health`.
2. **Etapa 2 – Java asume salas, motores, data-sync y admin.** Se porta el coordinador de salas y los
   28 motores con *golden tests* (ver §1.5) y se cambia el transporte del frontend. Al terminar, el
   servicio Node desaparece.

La opción B es la alternativa de bajo riesgo si prefieres no portar los motores; la tabla queda para
que la decisión sea tuya.

---

## FASE 1 — Análisis

### 1.1 Estructura actual

Monorepo npm workspaces (Node ≥ 22, TypeScript estricto, ESM):

| Workspace | Líneas (prod) | Tests | Rol |
|---|---|---|---|
| `packages/shared` | 12.422 (11.314 en `games/`) | 36 ficheros | Contratos Zod, tipos, puntuación, registro de juegos y **motores deterministas de 28 minijuegos**. Sin React/Express/Prisma. Dos entradas: raíz/`server` (con motores) y `public` (solo contratos y helpers de presentación). |
| `apps/server` | 4.275 | 34 ficheros (1 de integración con PostgreSQL) | Express 4 + Socket.IO 4 + Prisma 6. Autenticación, persistencia, coordinador de salas (`rooms/manager.ts`, 845 líneas), timers, data-sync, proxy de imágenes con `sharp`. |
| `apps/web` | 6.719 | 43 ficheros | React 19, Vite 6, Tailwind 3, react-router 7, `socket.io-client`. Importa **solo** `@pokemon-universe/shared/public` en código de producción (135 imports; verificado: ningún import de la raíz fuera de tests). |
| `e2e` | — | Playwright 1.64 | Solo local, no corre en CI. |

Total: 113 ficheros de test, 9.601 líneas de test.

**Cómo se comunican front y servidor**

- En desarrollo: Vite en `:5173` hace proxy de `/api` y `/socket.io` a Node en `:3001`
  (`apps/web/vite.config.ts`). `VITE_API_URL` vacío ⇒ mismo origen ⇒ la cookie llega al socket.
- En producción: nginx (`infra/nginx.conf`) sirve el `dist` de Vite y hace proxy de `/api/` y
  `/socket.io/` (con `Upgrade`) al contenedor `server:3001`. Un solo origen público.
- Contrato: `packages/shared` es la única fuente de verdad. El front valida y tipa con los mismos
  esquemas Zod que el servidor (configuraciones de juego, `RoomView`, estados públicos de cada juego).
- Autenticación: cookie `pu_session` HttpOnly SameSite=Lax, JWT HS256 (`jose`), caducidad 7 d (usuario)
  / 30 d (invitado). Claims: `sub, displayName, kind (USER|GUEST), avatar, role, email`. El
  *middleware* de Socket.IO lee la misma cookie del *handshake*.
- Eventos Socket.IO cliente→servidor (21): `room:create|join|leave|select-game|update-config|
  update-game-config|update-session|update-game-selection|vote-next-game|set-role|transfer-host|kick|
  set-ready|start-game|continue-session|return-lobby|end-session`, `game:skip-vote:set`,
  `game:action` (con `gameInstanceId` + `actionEpoch`), `who-is-who:cursor`, `who-is-who:cursor-clear`.
  Servidor→cliente (7): `room:state`, `room:kicked`, `session:restored`, `error:message` y tres de cursor.
- Endpoints HTTP: `/api/auth/*` (11), `/api/categories` (4), `/api/would-you-rather-prompts` (5),
  `/api/changelog` (público 1 + admin 4), `/api/feedback` (3), `/api/admin/*` (7), `/api/health`,
  `/api/games`, `/api/pokemon`, `/api/tcg/options`, `/api/tcg/eligibility`, y el proxy
  `/api/rooms/:code/games/:assetToken/rounds/:n/options/:id/(sprite|audio)`.

### 1.2 Cómo se levanta hoy en local

```bash
npm install                                   # workspaces + prisma generate (postinstall)
npm run db:up                                 # PostgreSQL 17 con podman-compose (compose.local.yaml)
cp .env.example .env                          # solo el bloque "Desarrollo local sin Compose"; quitar VITE_API_URL
npm run build -w @pokemon-universe/shared
set -a; . ./.env; set +a                      # el servidor NO carga .env por sí solo
npm run db:deploy -w @pokemon-universe/server # prisma migrate deploy
npm run db:seed                               # PokéAPI, varios minutos
npm run dev                                   # concurrently: tsx watch (:3001) + vite (:5173)
```

Variables del servidor (`apps/server/src/config.ts`, validadas con Zod al arrancar): `NODE_ENV, PORT,
WEB_ORIGIN, DATABASE_URL, JWT_SECRET (≥32), COOKIE_SECURE, RATE_LIMIT_DISABLED, ROOM_MAX_PLAYERS,
RECONNECT_GRACE_MS, AVATAR_STORAGE_DIR, PU_COMMIT_SHA, DATA_SYNC_ENABLED|HOUR|MINUTE|TIMEZONE`.
En Compose se mapean desde variables `PU_*` (`.env.example`, `.env.pre.example`, `.env.pro.example`).

Alternativa con contenedores locales: `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait`.

Observación: `apps/server/package.json` tiene `"start": "node dist/index.js"` pero la salida real es
`dist/src/index.js` (lo usan `scripts/start-server.sh` y el paso "Verify production artifacts" de CI).
El script `start` está roto, aunque nadie lo usa.

### 1.3 Workflows de GitHub Actions

Solo hay dos ficheros.

**`docker.yml` — "Validate and publish Docker images"**. Disparo: push y PR a `main`, manual.
Concurrencia por ref con cancelación.

| Job | Qué hace | Tiempo real (run 41150979083, 31-oct) | Tiempo real (12-sep) |
|---|---|---|---|
| `validate` | Service container postgres:17; `npm ci`; `prisma migrate deploy`; typecheck; lint; `npm test`; build; verificación de artefactos; `npm audit --omit=dev --audit-level=high` | **2 min 43 s** (npm ci 47 s, typecheck 24 s, lint 11 s, test 30 s, build 25 s) | 1 min 51 s |
| `publish` (solo `main`, no PR) | QEMU + Buildx; login GHCR; build-push del target `web` y luego `server` para `linux/amd64,linux/arm64`; tags `:pre` y `:<sha>`; provenance + SBOM | **4 min 13 s** | 4 min 36 s |
| `deploy-pre` (si `vars.PRE_DEPLOY_ENABLED == 'true'`) | Tailscale, SSH, `git checkout --detach <sha>`, `scripts/deploy.sh <sha>` (backup pg_dump, pull, `up --wait`, healthcheck, rollback automático) | **1 min 11 s** | 56 s |
| **Total en push a main** | | **≈ 8 min 15 s** | ≈ 7 min 30 s |

Cachés: `actions/setup-node` con `cache: npm`; Buildx `cache-from: type=gha` scopes `application`, `web`
y `server`; `cache-to` **solo** `scope=application`.

Secretos y variables: `GITHUB_TOKEN` (packages: write), entorno `pre`: `TS_OAUTH_CLIENT_ID`,
`TS_OAUTH_SECRET`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`; vars `DEPLOY_HOST|PORT|USER|PATH`,
`PUBLIC_URL`, `PRE_DEPLOY_ENABLED`.

**`promote-production.yml` — "Promote current PRE image to production"**. Manual. Job 1 lee por SSH
el `PU_COMMIT_SHA` de la imagen que corre en PRE; job 2 (entorno `production`, aprobación manual)
despliega ese SHA en PRO con el mismo `deploy.sh` y después mueve `:latest` con
`docker buildx imagetools create` (sin recompilar). Mismos secretos que PRE pero del entorno `production`.

**Problemas y redundancias detectados**

1. Los scopes de caché `web` y `server` nunca se escriben: configuración muerta. Solo `application`
   funciona, y el primer `build-push` (web) no la escribe, así que un fallo en server pierde la caché.
2. `publish` vuelve a hacer checkout y recompila todo el monorepo bajo Buildx en lugar de reutilizar la
   compilación del job `validate` (el `Dockerfile` ya mitiga el coste con `--platform=$BUILDPLATFORM`,
   pero aun así se compila dos veces).
3. Las tres ejecuciones rojas del 31-oct (runs 41149604545, 41149849805, 41150288590) fallaron todas en
   **"Audit production dependencies"** por el aviso `GHSA-6pq8-jhm2-2vcw` de `qs` (dependencia transitiva
   de Express). El `npm audit` bloquea después de 2 min de trabajo útil y por vulnerabilidades que no son
   del código propio; debería ir al principio o ser no bloqueante con informe.
4. Un solo workflow para todo: un cambio de CSS recompila y publica también la imagen del servidor
   (y viceversa). No hay `paths` filters.
5. No hay job de E2E ni de Playwright en CI (documentado como "solo local").
6. Dentro de `validate` todo es secuencial: typecheck → lint → test → build podrían ir en paralelo.
7. Los pasos de SSH/Tailscale están copiados tres veces (dos workflows); candidatos a *composite action*.
8. Las imágenes son multi-arch con QEMU; el servidor es `node:22-alpine` con `sharp` (binario nativo, hay
   un `npm install --force` manual del paquete musl-arm64 en el Dockerfile para que la capa compilada en
   amd64 sirva para arm64). Frágil pero funciona.

### 1.4 Persistencia actual

PostgreSQL 17 vía Prisma 6.12 (`apps/server/prisma/schema.prisma`): **32 modelos, 9 enums nativos de
PostgreSQL, 16 migraciones SQL** (`prisma/migrations/*/migration.sql`, ago–sep 2026). Prisma crea
tablas PascalCase y columnas camelCase **entrecomilladas** (`"User"`, `"nationalDexNumber"`), ids
`cuid()` en texto, `Json` ⇒ `jsonb`, `String[]` ⇒ `text[]`, `Decimal(12,4)`.

Bloques funcionales:

| Bloque | Tablas | Volumen (BD local, 28 MB en total) | Escritura | Lectura crítica |
|---|---|---|---|---|
| Cuentas | `User`, `UserStats`, `UserGameStats`, `UserGameConfig`, `CustomCategory`, `CustomWouldYouRatherPrompt` | pequeño (usuarios reales de PRO) | registro, login, avatar, CRUD de preferencias | `User` por email/username; cachés en memoria cargadas al arrancar (`UserGameConfig`, categorías, pares WYR) |
| Historial | `RoomHistory`, `GameHistory`, `PlayerGameResult` | crece con cada partida | `RoomAuditSink` encolado (crear/cerrar sala, inicio/abandono de partida) y `persistGameResults` en transacción **Serializable** con 3 reintentos e idempotencia por `resultId`; al arrancar `interruptStaleActivity` marca lo que quedó `IN_PROGRESS` | perfil de usuario, panel admin (paginado) |
| Contenido | `Changelog`, `Feedback` | pequeño | admin / usuarios | listado público de versiones publicadas |
| Catálogo Pokémon | `Pokemon` (1.083 formas), `PokemonSpecies` (1.025), `PokemonGeneration`, `PokemonType`, `PokemonTypeAssignment`, `PokemonStat`, `Ability`, `PokemonAbility`, `PokemonEvolution`, `PokemonAssetReference`, `PokedexEntry` (5.818), `Move` (745), `PokemonLevelUpMove` (**68.308**), `PokemonPokedexNumber`, `PokemonCatalogSync` | ~75k filas, datos de referencia | solo data-sync (PokéAPI) | **se carga entero en memoria al arrancar** y se reconstruye tras cada sync; los juegos nunca consultan la BD en caliente |
| TCG | `TcgSet`, `TcgCard`, `TcgCardPokemon`, `TcgCardPrice` | vacío en local; en PRO depende de TCGdex | data-sync diario (refresco de precios) | catálogo cacheado en memoria (`CachedTcgCardCatalog`) |
| Operación | `DataSyncRun`, `DataSyncState` | pequeño | scheduler 06:00 Europe/Madrid | panel admin |

Fuera de PostgreSQL: avatares personalizados como `.webp` en un volumen (`/data/avatars`,
`FilesystemAvatarStorage`), y **las salas viven solo en memoria** (`InMemoryRoomStore`, timers con
`setTimeout`): un reinicio conserva cuentas e historial pero termina las salas activas (documentado).

Fuentes externas (solo desde `data-sync/` y `seed.ts`): `https://pokeapi.co/api/v2/*`,
`https://api.tcgdex.net/v2/en`, sprites desde `raw.githubusercontent.com/PokeAPI/sprites`.

### 1.5 Riesgos de la migración y lógica a portar

**Lógica de servidor que hay que portar** (por orden de esfuerzo):

1. **28 motores de minijuego** (`packages/shared/src/games/*/server.ts`, ~11k LOC) y su contrato
   `MiniGameModule` (`createInitialState, start, handleAction, handleTimeout, handlePresenceChange,
   getPublicState, getPlayerState, resolveAsset, getLifecycle, isFinished, getResults`), más la
   infraestructura compartida (`timing`, `runoff-voting`, `lifecycle`, `scoring POSITION_V1`, registro).
   Incluyen algoritmos no triviales: emparejamiento bipartito (Bingo), footrule de Spearman (Secret
   Ranking), generador de tableros (Connections, 517 líneas de catálogo), undo/redo vectorial (Sketchmon).
2. **Coordinador de salas** (`rooms/manager.ts` + `presence`, `timers`, `game-skip`, `cursor-channel`):
   máquina de estados `LOBBY → fases del juego → GAME_RESULTS → SESSION_RESULTS`, rotación fija/aleatoria/
   votación, *ready*, roles host/co-host, expulsión, gracia de reconexión de 30 s, transferencia de host,
   `gameInstanceId` + `actionEpoch`, proyección pública + proyección privada por socket, `revision`.
   Todo **síncrono y de un solo proceso** por diseño: en Java hay que serializar las mutaciones por sala
   (un *lock* por sala o un actor/hilo virtual por sala).
3. **Proxy de assets de ronda con `sharp`**: silueta, normalizado 320×320, recorte con zoom, pixel-art,
   recolor HSL de *shinies* falsos, extracción de paletas (`game-image-cache.ts`, `pokemon-palette-sync.ts`,
   `avatar/service.ts` para redimensionar avatares a webp). En Java: `ImageIO`/`BufferedImage` con
   operaciones por píxel propias; webp requiere librería adicional (TwelveMonkeys o `webp-imageio`).
4. **Data-sync**: cliente PokéAPI con límites de tamaño/tiempo, seed de 1.025 especies + formas regionales
   + learnsets + entradas de Pokédex en español, *backfill* de tablas normalizadas, TCGdex, scheduler diario,
   recuperación de runs interrumpidos.
5. **Auth y perfil**: bcrypt coste 12 (`bcryptjs` 3), JWT HS256, invitado con `guest_<uuid>`, avatares
   (preset/custom/default), rate limits (global 120/min, auth 30/15 min, avatar 12/15 min, feedback,
   imágenes de juego, y 50 eventos/10 s por socket).
6. CRUD de categorías, pares WYR (con importación JSON por lotes), changelog, feedback, admin.
7. Caché de preferencias por usuario con normalización/reparación de configuraciones JSON antiguas
   contra el esquema actual de cada juego.

**Riesgos principales**

| Riesgo | Impacto | Mitigación propuesta |
|---|---|---|
| Pérdida de paridad al portar los motores (reglas, puntuaciones, qué se publica y qué no) | Alto: afecta a la jugabilidad y a la privacidad (secretos filtrados) | Los motores reciben `now` y `random` inyectados ⇒ **golden tests**: ejecutar el motor TS y el Java con la misma semilla y secuencia de acciones y comparar `getPublicState`, `getPlayerState`, `getResults` JSON a JSON. Los 36 ficheros de test de `shared` se convierten en la especificación del port. |
| Cambio de transporte Socket.IO → WebSocket | Medio: reconexión, acuses, orden de mensajes | Sobre un solo WebSocket, un sobre `{id, event, payload}` con respuesta `{id, ok, data|error}`; reconexión con *backoff* en el cliente; la gracia de 30 s y `session:restored` ya existen en el servidor. |
| Esquema de BD generado por Prisma (nombres entrecomillados, enums nativos, `text[]`, `jsonb`) | Medio: Hibernate por defecto no encaja | `quote-identifiers.strategy=all`, naming físico sin transformación, `@JdbcTypeCode(SqlTypes.NAMED_ENUM)`, mapeo de arrays de Hibernate 6. Decidir el día 1. |
| Migraciones: Prisma deja `_prisma_migrations` y PRO tiene datos | Alto si se rompe PRO | Flyway con **baseline**: `V1__baseline.sql` desde `pg_dump --schema-only` del esquema actual y `baseline-on-migrate=true`; no se toca `_prisma_migrations`. |
| Continuidad de sesiones y contraseñas | Medio | Misma cookie, mismo secreto, mismas *claims* ⇒ sesiones vivas sobreviven. bcrypt `$2a$/$2b$` es interoperable; verificar el prefijo generado por `bcryptjs` 3 en PRO. |
| Ids `cuid` generados por Prisma | Bajo | Las columnas son `text`; Java puede generar UUID o cuid2. Solo los avatares exigen formato (`<uuid>.webp`). |
| Despliegue en dos etapas con dos backends conviviendo | Medio | nginx como *strangler*; mismo JWT; cada etapa con sus tests E2E en verde. |
| Imagen nativa GraalVM con `ImageIO`, reflexión de Jackson y Hibernate | Medio: tiempos de build y fallos en runtime | Construir nativo solo en `main`/tags; mantener imagen JVM como *fallback*; tests de integración contra el binario nativo (`@QuarkusIntegrationTest`). |
| Arranque: el servidor Node sincroniza PokéAPI al primer arranque (minutos) y carga 75k filas en memoria | Bajo | Mismo comportamiento; `start_period` del healthcheck ya es de 5 min. |
| Quedan 28 pantallas React acopladas a 28 estados públicos tipados con Zod | Medio | El contrato TS permanece en el frontend (ver §3.3). |

---

## FASE 2 — Decisiones de stack

### 2.1 Framework backend: Quarkus vs Micronaut

Cifras de arranque/memoria: las de los fabricantes; no se han medido aquí.

| Criterio | Quarkus (3.34.x) | Micronaut (5.0.x) | Comentario |
|---|---|---|---|
| Java 25 | Soportado desde 3.31 (runtime y nativo con Mandrel 25) | Baseline Java 25 en 5.0 (GA mayo 2026) | Empate. Micronaut 5 es muy reciente (Jackson 3, sin RxJava 2): más riesgo de ecosistema. |
| Arranque JVM / nativo | ~1 s JVM, decenas de ms nativo (vendor) | Similar (DI en compilación) | Empate práctico. |
| RAM nativo | Decenas de MB (vendor) | Decenas de MB (vendor) | Empate. |
| Build en Actions | Augmentación en build; `quarkus-maven-plugin` | Annotation processors | Empate; nativo 8–15 min en ambos. |
| Hilos virtuales | `@RunOnVirtualThread`, WebSockets Next y REST preparados | Soportados vía Netty loom executor | Quarkus más integrado. |
| **WebSocket** | **WebSockets Next**: mismo puerto HTTP, anotaciones, virtual threads, broadcast, *ping* | `@ServerWebSocket` sobre Netty | **Decisivo**: las salas son WebSocket y aquí Quarkus está más maduro y en el mismo puerto (nginx no cambia). |
| ORM / validación / OpenAPI / seguridad | Hibernate ORM + Panache, Flyway, Hibernate Validator, SmallRye OpenAPI, SmallRye JWT | Micronaut Data (JDBC o Hibernate), Flyway, Validation, OpenAPI, Security JWT | Ambos completos. Micronaut Data JDBC es más ligero; Hibernate 6 mapea mejor `jsonb`/`text[]`/enums nativos del esquema Prisma. |
| Experiencia de desarrollo | `quarkus dev`: live reload, **Dev Services** (levanta PostgreSQL en contenedor solo), *continuous testing*, Dev UI | Live reload, Test Resources (Testcontainers) | Quarkus algo superior por Dev Services y testing continuo. |
| Facilidad para portar la lógica actual | Modelo imperativo con virtual threads ≈ código síncrono de hoy | Igual | Empate. |

**Recomendación técnica: Quarkus. Decisión del usuario: Micronaut 5.** Es viable sin problemas de
fondo; lo que cambia y hay que asumir:

- **Versión reciente**: Micronaut 5.0 es GA desde mayo de 2026 (5.0.1 ya corrige dos avisos de
  seguridad). Fijamos la versión exacta en el *version catalog* y se actualiza con cada patch.
- **Jackson 3** (3.1.x en el BOM) o Micronaut Serialization. Elegimos **Micronaut Serialization**
  (sin reflexión, nativo-friendly) con `@Serdeable` en DTOs y mensajes WebSocket.
- **WebSocket**: `@ServerWebSocket` sobre Netty, mismo puerto HTTP. Tiene `@OnOpen/@OnMessage/@OnClose`,
  *broadcaster* y acceso a cookies del *handshake*; menos azúcar que WebSockets Next pero suficiente
  para el sobre `{id, event, payload}`. La serialización de mutaciones por sala la hacemos nosotros
  (un ejecutor de hilos virtuales con una cola por sala), igual que habría sido en Quarkus.
- **Hilos virtuales**: `@ExecuteOn(TaskExecutors.BLOCKING)` usa hilos virtuales en JDK 21+; los
  controladores y el coordinador se declaran bloqueantes y síncronos, como el código Node actual.
- **Persistencia**: Micronaut Data JPA con **Hibernate 7.3** (mapea `jsonb`, `text[]` y enums nativos;
  mismas reglas de nombres entrecomillados que en §1.5).
- **Dev loop**: sin Dev Services; `./gradlew run -t` recompila en caliente y **Micronaut Test
  Resources** levanta PostgreSQL con Testcontainers en dev y test automáticamente.
- **OpenAPI** se genera en compilación (annotation processor), no en runtime: más rápido y apto para nativo.
- **Nativo**: plugin Gradle de Micronaut con `nativeCompile`; Micronaut genera metadatos de reflexión en
  compilación, así que el riesgo en nativo es menor que con Hibernate bajo Quarkus.

### 2.2 Base de datos

| Opción | Encaje con el modelo real | Veredicto |
|---|---|---|
| **PostgreSQL 17** (actual) | PRO tiene datos vivos; `jsonb`, `text[]`, enums nativos, `Decimal(12,4)`, transacciones Serializable con reintentos, scripts de backup/verificación, healthchecks y volúmenes ya en Compose | **Mantener** |
| MariaDB | Sin `jsonb` indexable ni arrays nativos; habría que replanificar 5 tablas y migrar datos de PRO | No |
| SQLite | Un solo escritor, sin tipos nativos de arrays/enums, fichero en volumen compartido entre contenedores; rompe el modelo de 3 servicios | No |

La carga en caliente es baja: el catálogo (75k filas) se lee al arrancar y tras cada sync; en juego
solo se escriben historial, resultados, estadísticas y feedback. Nada justifica cambiar de motor; sí
cambiar el motor obligaría a migrar PRO.

### 2.3 Migraciones de esquema

| | Flyway | Liquibase |
|---|---|---|
| Formato | SQL plano, igual que las 16 migraciones Prisma actuales | XML/YAML/SQL |
| Baseline sobre esquema existente | `baseline-on-migrate` + `V1__baseline.sql` | `changelogSync` |
| Integración Micronaut | `micronaut-flyway`: corre al arrancar, soporta nativo | `micronaut-liquibase` |
| Recomendación | **Flyway**: las migraciones ya son SQL y el equipo trabaja en SQL | — |

Plan: `V1__baseline.sql` = `pg_dump --schema-only` del esquema que generan las migraciones Prisma;
Flyway marca baseline en PRO sin tocar datos. **Mientras convivan los dos backends** (etapa 1),
`scripts/start-server.sh` sigue ejecutando `prisma migrate deploy` en cada arranque de Node, así que
Flyway se limita a `baseline` + `validate` y **no se añade ninguna `V2__`**; cualquier cambio de
esquema espera a retirar Node. Al retirar Node se elimina `migrate deploy` del arranque y Flyway pasa a
ser el único dueño del esquema. La tabla `_prisma_migrations` se deja (inofensiva) y se borra en una
migración posterior.

### 2.4 Build tool

| | Maven | Gradle |
|---|---|---|
| Velocidad CI (un módulo) | `setup-java` con `cache: maven` ≈ 10–20 s de restauración; compilación paralela `-T 1C` | Más rápido en incremental; en CI necesita `gradle/actions/setup-gradle` (caché de dependencias, wrapper y *build cache*), `org.gradle.configuration-cache=true`, `org.gradle.caching=true` y `--no-daemon` |
| Soporte Micronaut | Soportado | **Gradle es el build primario de Micronaut**: plugin `io.micronaut.application` (`run -t`, `nativeCompile`, `dockerBuild`, Test Resources) |
| Mantenibilidad | POM declarativo, sin scripts | Kotlin DSL con *version catalog* (`gradle/libs.versions.toml`), BOM de la plataforma Micronaut |
| **Decisión (del usuario)** | — | **Gradle** con Kotlin DSL, wrapper fijado, Java toolchain 25, configuration cache y build cache activados. Reglas: `./gradlew` siempre (nunca Gradle del sistema), `gradle/actions/setup-gradle` en CI con `cache-read-only` fuera de `main`, y `dependency-verification` fuera de alcance salvo que se pida. |

### 2.5 Testing

- **Unitarios**: JUnit 5 para motores y reglas; **golden tests** generados desde TS (fixtures JSON con
  semilla, acciones y proyecciones esperadas) que Java debe reproducir byte a byte.
- **Integración**: `@MicronautTest` + Test Resources (Testcontainers PostgreSQL automático), cliente
  HTTP declarativo de Micronaut y `WebSocketClient` de prueba para flujos de sala (crear, unirse, ready,
  empezar, reconectar).
- **Contrato de API**: OpenAPI generado en compilación por `micronaut-openapi` ⇒ `openapi-typescript` en el frontend; un test
  en CI que falla si el `openapi.json` publicado cambia sin regenerar los tipos. Para los mensajes WebSocket,
  las fixtures JSON de los golden tests se validan además con los esquemas Zod del frontend (Vitest), así
  los dos lados comparten la misma prueba.
- **E2E**: la suite Playwright actual pasa a ejecutarse en CI contra `compose` (ver Fase 5).

### 2.6 Documentación de API

`micronaut-openapi` (annotation processor, anotaciones Swagger) genera `openapi.yml` en compilación y
Swagger UI se sirve solo en los entornos `dev`/`test`. El fichero se publica como artefacto de CI y es la
fuente de los tipos TS del front.

### 2.7 Frontend

**Mantener React 19 + Vite 6 + TypeScript + Tailwind 3**: 6.700 líneas, 43 tests, rúbrica visual y
E2E ya existentes. Cambios justificados:

1. Sustituir `socket.io-client` por un adaptador WebSocket nativo (consecuencia de la opción A; dos
   ficheros + hooks de reconexión). Motivo: evitar `netty-socketio`, sin mantenimiento desde marzo de 2025.
2. Mover `packages/shared/src` (solo la parte `public`) dentro de `frontend/` como paquete interno: el
   front sigue siendo el dueño del contrato TS (esquemas de configuración, tipos de estados públicos).
3. Tipos REST generados desde OpenAPI en lugar de escritos a mano.

Sin cambios de framework, bundler ni estilos.

### 2.8 Observabilidad básica

- **Health**: `micronaut-management` (`/health`, con `/health/liveness` y `/health/readiness`;
  indicadores de BD y de catálogo cargado). Se mantiene `/api/health` como alias para no tocar
  `deploy.sh` ni Compose.
- **Métricas**: Micrometer + registro Prometheus en `/prometheus` (HTTP, JVM, pool HikariCP, y métricas
  propias: salas activas, jugadores conectados, partidas por juego).
- **Logs**: Logback con `logstash-logback-encoder` en `prod` (JSON una línea por evento), texto en `dev`;
  MDC con `roomCode` y `userId` en salas.

---

## FASE 3 — Arquitectura objetivo

### 3.1 Monorepo vs repos separados

**Monorepo**, con `/frontend` y `/backend`. El árbol siguiente es el **estado final**; durante la
etapa 1 conviven `apps/server` y `packages/shared` en la raíz (Node sigue importando la entrada raíz
de `shared`) junto al nuevo `backend/`. Motivos del monorepo: el contrato front↔back cambia a la vez en los dos
lados (28 estados públicos de juego), un PR y un SHA cubren los dos despliegues, el modelo PRE/PRO actual
promociona *un* SHA, y los `paths` filters de Actions dan workflows independientes sin perder lo anterior.

```
/
├── frontend/                 # React + Vite (antes apps/web)
│   ├── src/
│   ├── packages/shared/      # contratos TS (antes packages/shared/src, solo entrada public)
│   ├── e2e/                  # Playwright
│   ├── Dockerfile            # multi-stage → nginx-unprivileged
│   └── package.json
├── backend/                  # Micronaut 5, Java 25, Gradle
│   ├── src/main/java/es/pokemonuniverse/
│   ├── src/main/resources/{application.yml,application-{dev,test,prod}.yml,db/migration/}
│   ├── src/test/…
│   ├── Dockerfile            # JVM (ubi9/openjdk-25-runtime, no root)
│   ├── Dockerfile.native     # UBI-micro
│   ├── build.gradle.kts  settings.gradle.kts  gradle/libs.versions.toml  gradlew
├── infra/nginx.conf
├── scripts/                  # deploy, backup (sin cambios funcionales)
├── compose.yaml  compose.dev.yaml  compose.local.yaml
├── .github/workflows/{frontend.yml,backend.yml,e2e.yml,promote-production.yml}
└── README.md  docs/
```

### 3.2 Arquitectura hexagonal del backend

```
es.pokemonuniverse
├── domain/                     # sin dependencias de framework
│   ├── game/                   # MiniGameModule, GameContext, GameResults, registro, scoring, timing, runoff
│   ├── game/<id>/              # 28 motores (records inmutables, funciones puras)
│   ├── room/                   # LiveRoom, GameRuntime, máquina de estados, presencia, skip-vote
│   ├── pokemon/, tcg/          # catálogo inmutable, condiciones, formas
│   └── identity/               # AuthUser, roles, avatar
├── application/                # casos de uso; puertos (interfaces)
│   ├── rooms/RoomCoordinator   # serializa mutaciones por sala (lock o hilo virtual por sala), timers
│   ├── auth/, profile/, categories/, prompts/, changelog/, feedback/, admin/
│   ├── datasync/               # orquestación, scheduler, recuperación
│   └── ports/                  # RoomAuditSink, StatsWriter, AvatarStorage, PokemonSource, TcgSource, Clock, Random, RoomEvents
├── adapters/
│   ├── in/rest/                # @Controller, DTOs @Serdeable, mappers, filtros de rate limit
│   ├── in/ws/                  # @ServerWebSocket /ws, sobre {id,event,payload}, proyecciones por conexión
│   ├── out/persistence/        # Micronaut Data JPA (Hibernate 7): entidades = esquema Prisma, repositorios
│   ├── out/http/               # clientes PokéAPI y TCGdex (@Client declarativo), límites de tamaño/tiempo
│   ├── out/image/              # transformaciones de sprites (silueta, zoom, pixel-art, recolor, paleta)
│   └── out/storage/            # avatares en disco
└── config/                     # mapeo de propiedades, perfiles, seguridad
```

Reglas: `domain` no importa Micronaut ni Hibernate; los motores son puros (`now`, `random`, catálogo
inyectados) para poder correr los golden tests sin contenedor; una sola mutación por sala a la vez.

### 3.3 Contrato front ↔ back

- **REST** bajo `/api/*` con las mismas rutas y JSON que hoy (compatibilidad total en la etapa 1), DTOs
  como `record`, errores `{error, issues?}` como ahora, OpenAPI generado.
- **WebSocket** en `/ws` (nginx añade esa `location`; `/socket.io/` se retira al final de la etapa 2).
  Mensajes JSON: cliente `{id, event, payload}`; servidor `{id, ok, data | error}` para acuses y
  `{event, payload}` para push (`room:state`, `session:restored`, `room:kicked`, `error:message`,
  cursores). Mismos nombres de evento y mismos payloads que hoy, de modo que `RoomView` y los estados
  públicos no cambian.
- **Fuente de verdad del contrato**: REST ⇒ `openapi.json` ⇒ tipos TS generados. WebSocket y juegos ⇒
  esquemas Zod en `frontend/packages/shared` + fixtures JSON compartidas con los golden tests Java.
- **CORS**: mismo origen en producción vía nginx; en `dev` Micronaut (`micronaut.server.cors`) permite
  `http://localhost:5173` con credenciales. El proxy de Vite se desdobla en la etapa 1 (`/api/auth/…`, `/api/changelog`, … → Java
  `:8080`; el resto de `/api` y `/socket.io` → Node `:3001`) y al final de la etapa 2 queda `/api` y
  `/ws` → `:8080`.
- **Autenticación**: cookie `pu_session` HttpOnly, SameSite=Lax, HS256 con `JWT_SECRET`, mismas claims
  y caducidades; verificación en REST (filtro) y en el *upgrade* del WebSocket. Roles `USER|ADMIN`
  comprobados contra BD en `/api/admin/*` como ahora.

### 3.4 Configuración por entornos

`application.yml` + `application-{dev,test,prod}.yml` seleccionados con `MICRONAUT_ENVIRONMENTS`;
todo secreto viene del entorno, nada en el código ni en la imagen. Se conservan los nombres actuales
para no tocar `.env` de PRE/PRO:

| Variable (entorno) | Propiedad Micronaut |
|---|---|
| `PORT` | `micronaut.server.port` (8080 por defecto) |
| `DATABASE_URL` (`postgresql://…`) | Compose pasa `JDBC_URL=jdbc:postgresql://postgres:5432/${PU_POSTGRES_DB}`, `DB_USER`, `DB_PASSWORD` → `datasources.default.*` |
| `JWT_SECRET` | `pu.auth.secret` (≥ 32) |
| `WEB_ORIGIN`, `COOKIE_SECURE`, `ROOM_MAX_PLAYERS`, `RECONNECT_GRACE_MS`, `AVATAR_STORAGE_DIR`, `RATE_LIMIT_DISABLED`, `DATA_SYNC_*`, `PU_COMMIT_SHA` | `pu.*` tipadas con `@ConfigurationProperties` + Bean Validation al arrancar (equivalente al Zod actual) |

`dev` y `test`: Test Resources levanta PostgreSQL; `prod`: logs JSON, Swagger UI desactivado,
`micronaut.server.netty.use-forwarded-headers` o lectura de `X-Forwarded-*` detrás de nginx/Cloudflare.

---

## Etapa 2: subproyectos (añadido 2026-10-31)

La etapa 2 se ejecuta como cuatro subproyectos con plan propio; cada uno deja software que funciona y se verifica:

| Subproyecto | Contenido | Verificación |
|---|---|---|
| **2A Núcleo de salas** (`docs/superpowers/plans/2026-10-31-etapa-2a-nucleo-salas.md`) | arnés dorado (exportador TS + replayer Java con PRNG determinista `mulberry32`), SPI `GameEngine`, coordinador de salas (port de `rooms/manager.ts`), transporte `@ServerWebSocket("/ws")` con sobre `{id,event,payload}`, motores piloto `higher-lower` y `pokedex-distance`, adaptador WebSocket en el frontend bajo `VITE_REALTIME` (`node` por defecto), nginx `/ws` | fixtures doradas en verde, escenarios del coordinador, E2E `sala.spec` contra Java con la bandera |
| **2B Motores** (`docs/superpowers/plans/2026-10-31-etapa-2b-motores.md`; hecho el 2026-11-02 en `etapa-2b-motores`) | los 26 motores restantes por lotes con fixtures doradas, proxy de imágenes y audio de ronda, canal de cursores | fixtures doradas por motor (28/28); E2E por juego (`e2e/tests/juegos.spec.ts`) |
| 2C Datos y administración | data-sync PokéAPI/TCGdex y refresco del catálogo, catálogo TCG y `/api/tcg/*`, API admin, categorías/WYR/avatares con escritura y notificación a lobbies, caché de configuraciones por usuario, `/api/health` | tests de integración con Testcontainers; paridad de respuestas con Node |
| 2D Cutover | `VITE_REALTIME=java` por defecto, nginx todo a Java, retirada de Node y de `prisma migrate deploy`, `apps/web` → `frontend/` con `shared/public` dentro, Flyway único dueño, CI sin `node-server.yml`, documentación | E2E completos solo contra Java; despliegue a PRE |

Las salas no admiten un cutover parcial (una sala puede lanzar cualquiera de los 28 juegos), así que hasta 2D las salas Java son solo de desarrollo y E2E; producción sigue en Node.

## Decisiones aprobadas (2026-10-31)

1. **Alcance del backend Java**: **A**, todo en Java en dos etapas por estrangulamiento.
2. **Framework**: **Micronaut 5** (decisión del usuario; la recomendación técnica era Quarkus).
3. **Monorepo** `/frontend` + `/backend`.
4. **Frontend**: sustituir `socket.io-client` por WebSocket nativo **en la etapa 2**.
5. **Base de datos y migraciones**: PostgreSQL 17 + Flyway con baseline (sin migrar datos de PRO).
6. **Build**: Gradle (Kotlin DSL, wrapper, toolchain Java 25).

Con tu aprobación, el orden de implementación será:

- **Etapa 1**: backend Java (REST sin efectos sobre salas) → Docker (imagen Java, Compose con tres
  servicios de aplicación y nginx como *strangler*) → CI (workflows separados por rutas) → frontend
  (tipos REST generados desde OpenAPI; sin cambio de transporte).
- **Etapa 2**: backend Java (coordinador de salas, 28 motores con golden tests, data-sync, admin,
  WebSocket) → frontend (adaptador WebSocket, mover `shared/public` a `frontend/`) → retirar Node y
  `prisma migrate deploy` → Flyway como único dueño del esquema → README final y lista de pendientes.

Esto se desvía del orden literal del encargo (backend → Docker → CI → frontend) porque el cambio de
transporte del frontend solo puede hacerse cuando exista el servidor WebSocket en Java, y `shared`
no puede moverse mientras Node lo importe.

---

Fuentes consultadas para versiones: [Quarkus 3.31 (Java 25)](https://quarkus.io/blog/quarkus-3-31-released/),
[guía de imagen nativa de Quarkus](https://quarkus.io/version/main/guides/building-native-image/),
[Micronaut 5.0 con baseline Java 25](https://micronaut.io/2026/04/27/micronaut-framework-5-0-with-java-25-baseline/),
[Micronaut blog](https://micronaut.io/blog/), [netty-socketio](https://github.com/mrniko/netty-socketio).
