# Etapa 2D · Corte: Java único backend · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el backend Java sea el único servidor desplegado: la web habla solo con Java (HTTP y `/ws`), nginx manda todo `/api/` a Java, Flyway es el único dueño del esquema, Node deja de desplegarse y su código queda en el repo solo como oráculo de pruebas, y la web vive en `frontend/`.

**Architecture:** El corte se hace en el repositorio y queda listo para un único despliegue; cada tarea deja la rama en verde. No se toca ningún entorno remoto: desplegar a PRE (push y CI) lo hace el usuario.

**Tech Stack:** Java 25 · Micronaut 5.1.5 · Flyway · React 19 + Vite 6 · Playwright · nginx · Docker/Compose · GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (fila 2D: «`VITE_REALTIME=java` por defecto, nginx todo a Java, retirada de Node y de `prisma migrate deploy`, `apps/web` → `frontend/` con `shared/public` dentro, Flyway único dueño, CI sin `node-server.yml`, documentación»; verificación «E2E completos solo contra Java; despliegue a PRE»). Lista de comprobación acumulada: `docs/migracion-java-pendientes.md` §«Corte 2D».

## Decisión del usuario (2026-11-03)

Node se **retira del despliegue** y su código (`apps/server`) se **conserva** solo como referencia para las fixtures doradas y los scripts de paridad. El esquema Prisma queda congelado; Flyway pasa a ser el dueño.

## Global Constraints

Se mantienen las de etapas anteriores (Java 25, Micronaut 5.1.x, sin dependencias no usadas, comentarios Java en español, commits en español **sin líneas de atribución**; el `MINIJUEGOS_MEJORAS.md` sin seguimiento es del usuario y no se toca). Se añaden:

1. **Rama siempre verde**: tras cada tarea, `cd backend && ./gradlew check`, `npm run typecheck`, `npm run lint` y `npm test` en verde; desde la Tarea 2 también `npm run test:e2e`, que pasa a ser solo Java.
2. **Oráculo Node intacto**: `apps/server` sigue compilando y sus tests siguen en `npm test`; `npm run check:golden` sigue regenerando y comparando las fixtures doradas (usa `apps/server/dist`). Ningún artefacto de despliegue construye, publica ni arranca Node.
3. **`packages/shared` se queda en su sitio**: lo consumen el frontend (`@pokemon-universe/shared/public`), el oráculo Node y el arnés dorado. La frase de la especificación «con `shared/public` dentro» se resuelve así (anotarlo en el Estado de la especificación).
4. **Un solo despliegue**: imágenes `backend` y `web` con la misma etiqueta; `deploy.sh` y `promote-production.yml` solo las conocen a ellas.
5. **Esquema**: contra una BD vacía, Flyway crea el esquema completo (`V1__baseline.sql`); contra una BD creada por Prisma, Flyway la reconoce (baseline 1) sin cambiar nada. Desde esta etapa los cambios de esquema son migraciones Flyway `V2__…` (se elimina la prohibición de `AGENTS.md`).
6. **Producción**: `ROOMS_ENABLED=true`, `INTERRUPT_STALE_ROOMS=true` y `BACKEND_DATA_SYNC_ENABLED=true` en el servicio `backend` de `compose.yaml`; nada de Node en compose.

## Review Focus

1. **BD de producción existente** (creada por Prisma, con `flyway_schema_history` en baseline 1): el arranque no reaplica `V1__baseline.sql` ni falla la validación (Tarea 3).
2. **BD vacía en un despliegue nuevo**: el backend crea el esquema, ejecuta `ensureInitialPokemon` antes de aceptar tráfico, y el healthcheck y el `--wait-timeout` de compose dan tiempo suficiente (Tarea 4).
3. **Rutas admin con variantes** (`/api/admin/`, `//api/admin/users`, `/api/%61dmin/users`, `/api/ADMIN/users`) a través de nginx y Micronaut: siempre 401/403/404, nunca 200 sin guardia (Tarea 5).
4. **Primera conexión en frío al `/ws`**: el aviso «Conectando con la sala» no tapa la cabecera (hoy falla `acceso.spec` a 1280×720 en frío) (Tarea 2).
5. **Imagen arm64**: la codificación WebP de avatares funciona en `linux/arm64` (Tarea 5, prueba en CI con QEMU).

---

### Task 1: `apps/web` → `frontend/`

**Files:** `git mv apps/web frontend`; actualizar `package.json` raíz (`workspaces`), scripts que nombran `apps/web` (el nombre de paquete `@pokemon-universe/web` se conserva), `Dockerfile` (etapa `web`), `.github/workflows/*.yml` (rutas y filtros), `e2e/playwright.config.ts`, `scripts/*`, configuración de ESLint y referencias de `tsconfig`, `AGENTS.md`, `README.md`, `DEPLOY.md`, `docs/architecture.md`, `e2e/README.md`.

- [ ] **Step 1:** Mover y buscar `apps/web` en el árbol (excepto `node_modules`, `.git` y planes/especificación históricos) hasta que no quede ninguna referencia viva.
- [ ] **Step 2:** `npm install`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run test:e2e -- inicio` en verde.
- [ ] **Step 3:** Commit: `La web pasa a frontend/`.

---

### Task 2: Web solo contra Java

**Files:** `frontend/src/lib/realtime*.ts` (fuera el adaptador Socket.IO y la bandera `VITE_REALTIME`; `createRealtime()` devuelve siempre el cliente `/ws`), `frontend/package.json` (quitar `socket.io-client` si deja de usarse), `frontend/vite.config.ts` y su test (todo `/api` y `/ws` a `:8080`; sin modo `node`), `e2e/playwright.config.ts` (sin el `webServer` de Node; un solo proyecto), `package.json` raíz (`test:e2e` = Java; `test:e2e:java` desaparece o queda como alias), `e2e/tests/*.spec.ts` (sin ramas por transporte; `juegos.spec.ts` exige `/ws`), el componente del aviso de conexión de la sala para que no tape la cabecera.

- [ ] **Step 1:** Reproducir el fallo de `acceso.spec` 1280×720 en frío (backend parado al empezar) y guardar el error.
- [ ] **Step 2:** Corregir el aviso «Conectando con la sala» para que no solape la cabecera, con las clases de componente y tokens de `frontend/src/styles.css`, texto ≥ 12 px, animaciones solo con `transform`/`opacity` y respetando `prefers-reduced-motion`.
- [ ] **Step 3:** Quitar el modo Node de la web, del proxy y de los E2E.
- [ ] **Step 4:** `npm run test:e2e` completo en frío y en caliente, todo en verde. Capturas a 1280×720, 1920×1080 y 390×844 de la pantalla con el aviso; `measureLayout` vacío; puntuación con `docs/visual-review.md` (≥ 19/24, ningún criterio a 0) anotada en el commit.
- [ ] **Step 5:** Commits: `La web habla solo con el backend Java` y `Aviso de conexión de la sala sin tapar la cabecera (rúbrica N/24)`.

---

### Task 3: Flyway, único dueño del esquema

**Files:** `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/PrismaSchemaGuard.java` (→ `FlywayMigrations`, sin exigir `_prisma_migrations`), `application.yml`, el lector de versión de `/api/health` (`schemaVersion` = última versión aplicada en `flyway_schema_history` con su descripción; si no existe, la de `_prisma_migrations`; si ninguna, `unknown`), tests; scripts de BD en `package.json` y `apps/server/package.json` (se conserva lo que necesita el oráculo, p. ej. `prisma generate`; lo que era flujo de desarrollo pasa a Java y se documenta cómo sembrar arrancando el backend con `BACKEND_DATA_SYNC_ENABLED=true`), `scripts/start-server.sh` (eliminar), `AGENTS.md` (quitar la prohibición de `V2__`; regla nueva: cambios de esquema con Flyway).

- [ ] **Step 1:** Test de paridad de esquema (Testcontainers): BD A con `V1__baseline.sql` aplicado por Flyway desde vacío; BD B con `prisma migrate deploy --schema apps/server/prisma/schema.prisma`; `pg_dump --schema-only` de ambas, normalizado (orden, propietarios, comentarios), sin `_prisma_migrations` ni `flyway_schema_history`: iguales. Si difieren, se corrige `V1__baseline.sql` (todavía no existe ninguna BD creada por Flyway) y se documenta.
- [ ] **Step 2:** Tests de arranque: BD vacía → esquema creado y `flyway_schema_history` con versión 1; BD creada por Prisma con baseline ya registrado → arranque sin cambios (`flyway info` igual antes y después); BD creada por Prisma sin `flyway_schema_history` → baseline 1 sin ejecutar `V1`.
- [ ] **Step 3:** `/api/health` informa la versión Flyway; test.
- [ ] **Step 4:** Implementar, ver pasar, verificación global. Commit: `Flyway, único dueño del esquema`.

---

### Task 4: Configuración de producción del backend

**Files:** `compose.yaml` (servicio `backend`: `ROOMS_ENABLED=true`, `INTERRUPT_STALE_ROOMS=true`, `BACKEND_DATA_SYNC_ENABLED=true`, `DATA_SYNC_*`, `POKEMON_ARTWORK_DIR` hacia el directorio de la imagen, healthcheck con `start_period` suficiente; fuera el servicio `server` y los volúmenes que solo usaba él), `.env.example`, `backend/Dockerfile` (copia de los artworks), mover `apps/server/assets/pokemon-artworks` a `backend/assets/pokemon-artworks` y actualizar el valor por defecto de `pu.artwork-dir` en dev, `application.yml` (decidir si `ROOMS_ENABLED` e `INTERRUPT_STALE_ROOMS` pasan a `true` por defecto o solo en compose; anotarlo), tests.

- [ ] **Step 1:** Test de arranque con data-sync encendido y catálogo vacío (Testcontainers + PokéAPI grabado de la etapa 2C): `ensureInitialPokemon` termina antes de que `/health/readiness` responda listo; la TCG inicial corre en segundo plano; `/api/pokemon` devuelve el catálogo.
- [ ] **Step 2:** Medir en local una sincronización inicial completa contra PokéAPI real con una BD desechable (nunca la de desarrollo) y fijar el `start_period` y el `--wait-timeout` de `scripts/deploy.sh` con margen; anotar la medida en `DEPLOY.md`.
- [ ] **Step 3:** Test de que, con la configuración de compose, el arranque marca `INTERRUPTED` las salas `ACTIVE` y las partidas `IN_PROGRESS` previas.
- [ ] **Step 4:** Commit: `Backend Java con salas, sincronización y artworks en producción`.

---

### Task 5: nginx, despliegue y CI sin Node

**Files:** `infra/nginx.conf` (una `location /api/` y `location = /ws` hacia `backend:8080`; fuera `/socket.io/` y el destino de Node), imagen web (`frontend/Dockerfile` con contexto la raíz, o el `Dockerfile` raíz solo con la etapa `web`; elegir y documentar), `scripts/deploy.sh` (sin Node; humo `/api/health`, `/api/games`, `/api/tcg/options` y el `/ws`), `.github/workflows/main.yml` (sin el job `node`; reetiquetado de dos imágenes), `promote-production.yml` (dos imágenes), `node-server.yml` (eliminar; los tests del oráculo siguen en el workflow que ejecuta `npm test`), `backend.yml` (prueba de humo arm64 del codificador WebP con QEMU), clase `es.pokemonuniverse.tools.WebpEncoderSmoke` en el backend, `DEPLOY.md`.

- [ ] **Step 1:** Rutas admin con variantes (Review Focus 3): tests en `AdminGateTest` y comprobación de nginx con `nginx -t` del nuevo `infra/nginx.conf` en un contenedor `nginxinc/nginx-unprivileged:1.27-alpine` y un backend de prueba en la misma red que registre qué ruta le llega; documentar el resultado.
- [ ] **Step 2:** `WebpEncoderSmoke` (codifica un PNG pequeño y sale con 0) con su test; el paso de CI ejecuta la imagen `linux/arm64` construida con `--entrypoint java … -cp /app/app.jar es.pokemonuniverse.tools.WebpEncoderSmoke`; validar el YAML con `actionlint`.
- [ ] **Step 3:** Construir en local las dos imágenes con podman y levantar `compose.yaml` completo con una BD desechable: la web sirve la SPA, `/api/health` y `/ws` responden a través de nginx y una sala se crea desde el navegador (Playwright contra el puerto de nginx). Bajar todo al terminar.
- [ ] **Step 4:** Commits: `nginx y despliegue solo con Java` y `CI sin Node y prueba de humo arm64 del codificador WebP`.

---

### Task 6: Documentación y cierre de la migración

**Files:** `README.md`, `AGENTS.md`, `DEPLOY.md`, `docs/architecture.md`, `docs/migracion-java-pendientes.md` (2D hecho; lo que queda: imagen nativa, primer push y primera ejecución real de CI, despliegue a PRE y producción por el usuario, deuda técnica), especificación (Estado: migración completada en local; fila 2D hecha), `e2e/README.md`.

- [ ] **Step 1:** Documentación.
- [ ] **Step 2:** Verificación final con tiempos: `cd backend && ./gradlew check`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run test:e2e` (con `juegos` 28/28 sobre el catálogo ya sincronizado de la BD local).
- [ ] **Step 3:** Commit: `Documentación del corte 2D: Java único backend`.
