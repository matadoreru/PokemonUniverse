# Despliegue de Pokémon Universe como Tabi

> Para la instalación recomendada con PRE automático y promoción manual del mismo SHA a PRO, sigue primero [`docs/pre-production.md`](docs/pre-production.md). Este documento conserva el detalle operativo del stack.

La publicación replica el modelo operativo de Tabi, adaptado a las dos imágenes de esta aplicación (`web` y `backend`):

```text
Cloudflare Tunnel → 127.0.0.1:8080 → pokemon-universe-web (nginx: SPA estática)
                                        ↓ /api/ y /ws (WebSocket)
                              pokemon-universe-backend (Java, :8080)
                                        ↓
                              pokemon-universe-postgres
                                        ↓
                           volumen pokemon_universe_postgres_data
```

`infra/nginx.conf` manda todo `/api/` (con `^~`, para que la regex de estáticos no le quite rutas como
`/api/auth/avatars/<id>.webp`) y `location = /ws` (cabeceras de upgrade, 75 s de lectura) a `backend:8080`; el resto es
la SPA. `proxy_pass` sin URI reenvía la ruta tal cual: las variantes de `/api/admin` (`//api/admin/users`,
`/api/%61dmin/users`, `/api/ADMIN/users`, `/api/admin/../admin/users`…) llegan sin normalizar a Micronaut, que responde
401/403 (guardia) o 404, nunca 200 (`AdminGateTest`). `client_max_body_size 10m` iguala el `max-request-size` de
Micronaut, así que un avatar de más de 5 MiB recibe el 413 JSON del backend y no el de nginx. Añade
`X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy` (sin CSP).

La imagen web sale del `Dockerfile` raíz (contexto la raíz del repositorio, única etapa final `web`): compila
`packages/shared` y `frontend` en la plataforma del runner y copia `frontend/dist` a nginx. Node (`apps/server`) se
queda en el repositorio como oráculo de pruebas: ni se compila en imagen ni se publica ni se despliega.

Desde el corte 2D, `compose.yaml` ya no tiene el servicio `server` (Node): el `backend` (Java, Micronaut) es el único
servidor. Solo depende de `postgres`: Flyway crea el esquema en una BD vacía o reconoce el de Prisma (baseline 1). Usa
el volumen de avatares (`pokemon_universe_avatar_data`, uid/gid 1000, el mismo que tenía Node) y el secreto
`PU_JWT_SECRET`. Enciende en compose tres interruptores que en el código valen `false` (solo los apaga
`PU_CUTOVER_ROLLBACK_JAVA`, interna del rollback de `deploy.sh`, §5):
`ROOMS_ENABLED=true` (salas en `/ws`), `INTERRUPT_STALE_ROOMS=true` (al arrancar marca `INTERRUPTED`/`SERVER_STOPPED`
las salas `ACTIVE` y las partidas `IN_PROGRESS` que dejó el proceso anterior) y `BACKEND_DATA_SYNC_ENABLED=true`
(PokéAPI y TCGdex, a diario a `PU_DATA_SYNC_HOUR`:`PU_DATA_SYNC_MINUTE` en `PU_DATA_SYNC_TIMEZONE`). No dependen de
las variables de antes del corte: un `.env` anterior, con `PU_ROOMS_ENABLED=false`, no los apaga; `PU_ROOMS_ENABLED`,
`PU_DATA_SYNC_ENABLED` y `PU_SERVER_IMAGE` ya no se leen y se pueden borrar del `.env`. Los artworks del modo Artwork
van dentro de la imagen (`backend/assets/pokemon-artworks` → `/app/pokemon-artworks`, `POKEMON_ARTWORK_DIR`).
Para escribir avatares (WebP) el backend carga la libwebp nativa de `webp-imageio`: la extrae a `/tmp` y, si el tmpfs
es `noexec`, escribe una vez «Failed to load native library…» en stderr y la carga desde `/app/native` (copiada en la
imagen para la arquitectura de destino). No hace falta cambiar la base Alpine ni el `tmpfs` del compose. CI lo comprueba
en `linux/arm64` bajo QEMU (job `webp-arm64` de `backend.yml`, con `--read-only` y `/tmp` `noexec`):

```bash
docker run --rm --platform linux/arm64 --read-only --tmpfs /tmp:size=64m,noexec --entrypoint java IMAGEN \
  --enable-native-access=ALL-UNNAMED -cp /app/app.jar es.pokemonuniverse.tools.WebpEncoderSmoke
```

PostgreSQL no publica puertos. GitHub Actions valida el proyecto y publica imágenes `linux/amd64` y `linux/arm64` en
GHCR con el SHA completo del commit y el tag móvil `pre`. El tag `latest` solo se mueve después de promocionar correctamente ese SHA a PRO. El servidor solo descarga imágenes ya verificadas; no compila.

## 1. Publicar las imágenes

Sube el proyecto a GitHub con rama principal `main`. La integración continua está separada por rutas:

| Workflow | Se dispara en PR cuando cambia | Valida | Imagen |
| --- | --- | --- | --- |
| `.github/workflows/frontend.yml` | `frontend/`, `packages/shared/`, `e2e/`, `apps/server/`, `scripts/export-golden-*.mjs`, `backend/src/test/resources/golden/`, `package*.json`, `tsconfig.base.json`, `eslint.config.mjs`, `Dockerfile`, `.dockerignore`, `infra/nginx.conf`, `backend/openapi/` | lint, typecheck y tests en paralelo (incluye `check:boundaries` y `check:registry`); job `oracle`: oráculo Node (migraciones Prisma sobre una BD de prueba, typecheck, lint, tests, build) y `check:golden`; build Vite | `pokemon-universe-web` (target `web`) |
| `.github/workflows/backend.yml` | `backend/`, `compose.yaml` | `./gradlew check` (tests con Testcontainers, `ComposeStartupTest` y `verifyOpenApi`); `webp-arm64`: codificador WebP en la imagen `linux/arm64` | `pokemon-universe-backend` (JVM); `main.yml` añade `:<sha>-native` experimental, no bloqueante |

Desde el corte 2D no hay workflow ni imagen de Node: `node-server.yml` desapareció y los tests del oráculo pasaron al
job `oracle` de `frontend.yml`, que bloquea la imagen web como antes bloqueaban la de Node.

En cada push a `main`, `.github/workflows/main.yml` detecta qué zonas cambiaron desde el último Main verde en `main`
(no desde el push anterior; sin ninguno, construye todo), llama solo a los workflows afectados
con `publish: true` y reetiqueta las imágenes no afectadas de `:pre` a `:<commit-sha>`, de modo que **cada SHA de `main`
tiene las dos imágenes**. Después despliega ese SHA en PRE (ver [`docs/pre-production.md`](docs/pre-production.md)).
La promoción a PRO (`promote-production.yml`) toma como SHA el tag de imagen que ejecuta PRE (las dos imágenes deben
compartirlo); el `PU_COMMIT_SHA` incorporado en una imagen reetiquetada puede ser de un commit anterior y solo se usa
como respaldo si el tag no es un SHA.
Las imágenes son `linux/amd64` y `linux/arm64` con caché de Buildx en GitHub Actions (`type=gha`, un `scope` por imagen):

```text
ghcr.io/matadoreru/pokemon-universe-web:pre
ghcr.io/matadoreru/pokemon-universe-backend:pre
ghcr.io/matadoreru/pokemon-universe-web:<commit-sha>
ghcr.io/matadoreru/pokemon-universe-backend:<commit-sha>
ghcr.io/matadoreru/pokemon-universe-backend:<commit-sha>-native   # experimental, solo amd64
```

Un tag git `v*` (por ejemplo `v0.9.0`) reconstruye las dos imágenes y les añade ese tag; no despliega. Lanzar `main.yml`
a mano (`workflow_dispatch`) fuerza las dos builds; solo hace falta si el job `retag` avisa de que falta un `:pre`
(la primera ejecución ya lo construye todo porque aún no hay ningún Main verde). Los cambios en `main.yml` o en
`.github/actions/` reconstruyen las dos imágenes.

### Tiempos antes/después

Antes: un único workflow (`docker.yml`) en cada push, medido. Después: **estimaciones**, a corregir con la primera
ejecución real de `main.yml`.

| Fase | Antes (medido) | Después (estimado) |
| --- | --- | --- |
| Validación Node | validate 2:43 (npm ci 47 s, typecheck 24 s, lint 11 s, test 30 s, build 25 s) | frontend ≈ 2:00 (install 45 s, lint/typecheck/test en paralelo ≈ 30 s, build 25 s); oráculo Node (job `oracle`) ≈ 2:30 en paralelo |
| Imágenes | publish 4:13 (web + server multi-arch bajo QEMU, siempre) | web ≈ 1:00; backend JVM ≈ 2:00 tras check ≈ 2:30 (Gradle cacheado, Testcontainers ≈ 40 s) y `webp-arm64` bajo QEMU; solo las que cambian |
| Nativo backend | — | ≈ 10–15 min, job aparte en `main.yml`, no bloqueante y fuera de la cadena de `deploy-pre` |
| Retag de imágenes no afectadas | — | ≈ 0:20 |
| Despliegue PRE | 1:11 | ≈ 1:10 |
| **Total por push** | **≈ 8:15 siempre** | solo frontend ≈ 3:00 + deploy 1:10; solo docs ≈ 0:30 + deploy 1:10 |

Si los paquetes GHCR son privados, inicia sesión en el servidor con un token que tenga `read:packages`:

```bash
echo 'TOKEN_GITHUB' | docker login ghcr.io -u matadoreru --password-stdin
```

## 2. Preparar Ubuntu Server

```bash
sudo mkdir -p /srv/docker/pokemon-universe/backups
sudo chown -R "$USER":"$USER" /srv/docker/pokemon-universe
chmod 750 /srv/docker/pokemon-universe
cd /srv/docker/pokemon-universe
git clone https://github.com/matadoreru/REPOSITORIO.git .
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
```

Usa los dos valores aleatorios como contraseña PostgreSQL y secreto JWT. Configuración mínima:

```env
PU_HOST_PORT=8080
PU_IMAGE_TAG=latest
PU_WEB_IMAGE=ghcr.io/matadoreru/pokemon-universe-web
PU_BACKEND_IMAGE=ghcr.io/matadoreru/pokemon-universe-backend
PU_POSTGRES_DB=pokemon_universe
PU_POSTGRES_USER=pokemon
PU_POSTGRES_PASSWORD=CONTRASENA_HEXADECIMAL_ALEATORIA
PU_JWT_SECRET=SECRETO_HEXADECIMAL_ALEATORIO
PU_PUBLIC_ORIGIN=https://pokemon.example.com
PU_SECURE_COOKIE=true
PU_WATCHTOWER_ENABLE=false
```

Usa una contraseña hexadecimal: `DATABASE_URL` es una URL y otros caracteres necesitarían codificación porcentual.
No publiques `5432`, `3001` ni `8080` en el router.

## 3. Primera instalación

```bash
cd /srv/docker/pokemon-universe
docker compose config --quiet
docker compose pull
docker compose up -d --wait
docker compose ps -a
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
docker compose exec postgres pg_isready -U pokemon -d pokemon_universe
```

Antes del primer despliegue la imagen `pokemon-universe-backend` tiene que existir en GHCR con el tag que vayas a usar
(`pre`, `latest` o un SHA); `docker compose pull` falla si no está. La primera ejecución de `main.yml` tras fusionar la
etapa 1 construyó todas las imágenes (aún no había Main verde), así que basta con esperar a que termine antes de desplegar.
`latest` solo se mueve al promocionar a PRO (`promote-production.yml` reetiqueta también el backend); por eso un servidor
con `PU_IMAGE_TAG=latest` no puede arrancar el backend hasta la primera promoción: despliega por SHA o `pre`.

Al arrancar, el `backend` aplica las migraciones Flyway y, con el catálogo vacío, sincroniza PokéAPI
(`ensureInitialPokemon`) **antes** de abrir el puerto, así que `/health/readiness` no responde hasta que termina; la
sincronización inicial de TCGdex sigue después en segundo plano y no retrasa el arranque. En reinicios posteriores
detecta el catálogo completo (≥ 1.025 especies y suficientes paletas persistidas) y continúa sin consultar PokéAPI.

Medida (2026-11-03, BD vacía desechable, PokéAPI real, jar de producción con `MICRONAUT_ENVIRONMENTS=prod` en un
escritorio x86-64 de 12 núcleos): PokéAPI INITIAL 100,8 s (1.083 Pokémon con formas), `/health/readiness` en 200 a los
106,7 s de lanzar el proceso; la inicial de TCGdex, ya en segundo plano, tardó 434,6 s (23.771 cartas). Por eso el healthcheck del
backend (compose y `HEALTHCHECK` de la imagen) usa `start_period: 5m` (≈ 2,8 veces lo medido, margen para arm64 y una
PokéAPI lenta); un arranque sano pasa a healthy en el primer chequeo que responde. El `--wait-timeout` del despliegue
tiene que superar `start_period` + `interval` × `retries` = 300 + 30 × 3 = 390 s más la descarga de imágenes: los 600 s
de `PU_DEPLOY_WAIT_SECONDS` bastan; no lo bajes de 450 s.

En Cloudflare Tunnel configura el hostname público para enviar tráfico HTTP a `http://127.0.0.1:8080`. Las salas usan
el WebSocket `/ws` del mismo origen, por lo que no necesitan otro túnel ni puerto. `PU_PUBLIC_ORIGIN` debe coincidir
exactamente con el hostname HTTPS, sin barra final.

## 4. Backups

```bash
cd /srv/docker/pokemon-universe
chmod +x scripts/*.sh
./scripts/backup-postgres.sh
./scripts/verify-postgres-backup.sh backups/pokemon-universe-FECHA.dump
```

La copia se escribe primero como `.partial`, se valida con el catálogo de `pg_restore` y solo entonces se renombra. Hay
que programarla diariamente y copiar `backups/` fuera del servidor. El volumen no sustituye a un backup.

Prueba periódica de restauración:

```bash
docker compose exec -T postgres createdb -U pokemon pokemon_universe_restore_test
docker compose exec -T postgres pg_restore -U pokemon -d pokemon_universe_restore_test --clean --if-exists < backups/COPIA.dump
docker compose exec -T postgres psql -U pokemon -d pokemon_universe_restore_test -c 'SELECT count(*) FROM "User";'
docker compose exec -T postgres dropdb -U pokemon pokemon_universe_restore_test
```

## 5. Desplegar y volver atrás

Despliega un SHA que haya terminado correctamente en GitHub Actions:

```bash
cd /srv/docker/pokemon-universe
./scripts/deploy.sh SHA_COMPLETO_DEL_COMMIT
```

El script crea y valida un backup, descarga las imágenes `backend` y `web` y espera (`--wait-timeout`
`PU_DEPLOY_WAIT_SECONDS`, 600 s; no menos de 450 s, ver §3) mientras el backend aplica migraciones y, con el catálogo
vacío, sincroniza PokéAPI. Después ejecuta `scripts/smoke-check.sh` a través de nginx: `/api/health`, `/api/games` y
`/api/tcg/options` en 200 (las tres responden aunque la sincronización inicial de TCGdex siga en segundo plano) y el
handshake de `/ws` (101 y, sin sesión, cierre 4401 «Authentication required»; un 4403 «Rooms disabled» delataría
`ROOMS_ENABLED=false`). Si algo falla, vuelve a las imágenes exactas anteriores de `backend` y `web`. El mismo script
sirve a mano contra cualquier stack: `./scripts/smoke-check.sh http://127.0.0.1:8080 https://pokemon.example.com`.

**Primer despliegue tras el corte 2D.** El contenedor Node (`server`) del despliegue anterior ya no está en
`compose.yaml`. `deploy.sh` lo localiza por las etiquetas de compose, lo **para** (sin borrarlo) justo antes de arrancar
el backend nuevo, para que Node no siga sirviendo salas ni sincronizando mientras Java las enciende, y lo borra cuando
el humo pasa. Si ese despliegue falla, Node y Java nunca quedan a la vez con salas o sincronización:

1. Si el SHA anterior (el tag de la imagen `backend` que corría) está en el checkout del servidor (`deploy-ssh` hace
   `git fetch` y despliega por SHA), el rollback levanta su propio `compose.yaml` (`git show SHA:compose.yaml`,
   `--project-directory` el del despliegue) con `server`, `backend` y `web` de ese SHA: el stack anterior al corte
   tal cual, con el `.env` de siempre.
2. Si no (tag que no es un SHA o commit ausente), arranca de nuevo Node y restaura las imágenes `web` y `backend`
   anteriores con el `compose.yaml` nuevo y `PU_CUTOVER_ROLLBACK_JAVA=false`, que apaga en Java salas,
   interrupción de salas y sincronización. Esa variable es interna de `deploy.sh` (la fija a `true` en cada
   despliegue): no la pongas en `.env`.

`scripts/test-deploy-rollback.sh` simula `deploy.sh` con `docker` y `git` falsos (y la configuración real de
`docker compose config`) en seis escenarios, con y sin Node previo, y falla si algún `compose up` deja a Node en marcha
con un interruptor de Java encendido. Una imagen web anterior al corte no arranca sin un contenedor `server` en la red
(`host not found in upstream "server"`).

En ese mismo despliegue compose recrea una vez el contenedor `postgres` (sin tocar el volumen): la imagen pasó de
`postgres:17-alpine` a `docker.io/library/postgres:17-alpine` (nombre completo, para podman) y cambia el hash de su
configuración. El backup de `deploy.sh` se hace antes.

Una migración no se deshace automáticamente; antes de cambios incompatibles debe existir un procedimiento de migración
inversa o restaurarse el dump.

No uses `docker compose down -v`: elimina PostgreSQL. Mantén `PU_WATCHTOWER_ENABLE=false`; un despliegue automático sin
backup ni healthcheck rompe las garantías anteriores.

### Salas activas

En la arquitectura actual las salas y sus temporizadores viven en memoria. Reiniciar `backend` conserva cuentas y
estadísticas, pero termina las salas activas: al arrancar, el proceso nuevo las marca `INTERRUPTED` en el historial. Programa el despliegue entre sesiones y avisa a los jugadores. Para hacer
rolling deployments sin perder salas hay que implementar el adaptador Redis documentado en `docs/architecture.md`.

## 6. Desarrollo local con Docker

El Compose principal consume GHCR, como Tabi. Para construir el código local:

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait
```
