# Despliegue de Pokémon Universe como Tabi

> Para la instalación recomendada con PRE automático y promoción manual del mismo SHA a PRO, sigue primero [`docs/pre-production.md`](docs/pre-production.md). Este documento conserva el detalle operativo del stack.

La publicación replica el modelo operativo de Tabi, adaptado a las tres imágenes de esta aplicación (`web`, `server` y `backend`):

```text
Cloudflare Tunnel → 127.0.0.1:8080 → pokemon-universe-web (nginx)
                                        ↓ 11 rutas        ↓ resto de /api y /socket.io
                              pokemon-universe-backend   pokemon-universe-server
                                  (Java, :8080)              (Node, :3001)
                                        ↓                          ↓
                                  pokemon-universe-postgres
                                                ↓
                           volumen pokemon_universe_postgres_data
```

El servicio `backend` (Java, Micronaut) atiende solo las rutas de la etapa 1 descritas en `docs/architecture.md` y,
desde 2C, `GET /api/health`; nginx las enruta a él y el resto sigue en `server` (las demás rutas que Java ya porta,
como administración, TCG, categorías, dilemas y subida de avatares, no se enrutan hasta el corte 2D). Comparte con `server` el volumen de avatares (`pokemon_universe_avatar_data`,
uid/gid 1000 en ambos) y el secreto `PU_JWT_SECRET`. Arranca después de que `server` esté sano, porque Node aplica las
migraciones Prisma y Flyway hace baseline sobre ese esquema. No hace falta ninguna variable nueva salvo `PU_BACKEND_IMAGE`
(con valor por defecto igual al de `.env.example`). `PU_ROOMS_ENABLED` (`ROOMS_ENABLED` del backend) vale `false` por
defecto: el `/ws` de Java cierra cada conexión con 4403 y las salas siguen en Node; el corte 2D lo pone a `true`.
`PU_POKEMON_ARTWORK_DIR` (opcional, `/data/pokemon-artworks`) no tiene volumen montado, así que las salas Java no tienen
artworks locales; solo importa a partir del corte 2D.
El data-sync de Java (`BACKEND_DATA_SYNC_ENABLED`, no definido en compose, así que `false`) está apagado: PokéAPI y
TCGdex los sigue sincronizando Node (`PU_DATA_SYNC_ENABLED`). Es una variable distinta a propósito, para que nunca
sincronicen los dos procesos la misma BD; el corte 2D la pone a `true` en `backend` y apaga o retira la de Node.
Para escribir avatares (WebP) el backend carga la libwebp nativa de `webp-imageio`: la extrae a `/tmp` y, si el tmpfs
es `noexec`, escribe una vez «Failed to load native library…» en stderr y la carga desde `/app/native` (copiada en la
imagen para la arquitectura de destino). No hace falta cambiar la base Alpine ni el `tmpfs` del compose.

PostgreSQL no publica puertos. GitHub Actions valida el proyecto y publica imágenes `linux/amd64` y `linux/arm64` en
GHCR con el SHA completo del commit y el tag móvil `pre`. El tag `latest` solo se mueve después de promocionar correctamente ese SHA a PRO. El servidor solo descarga imágenes ya verificadas; no compila.

## 1. Publicar las imágenes

Sube el proyecto a GitHub con rama principal `main`. La integración continua está separada por rutas:

| Workflow | Se dispara en PR cuando cambia | Valida | Imagen |
| --- | --- | --- | --- |
| `.github/workflows/frontend.yml` | `frontend/`, `packages/shared/`, `e2e/`, `package*.json`, `tsconfig.base.json`, `eslint.config.mjs`, `Dockerfile`, `.dockerignore`, `infra/nginx.conf`, `backend/openapi/` | lint, typecheck y tests en paralelo (incluye `check:boundaries` y `check:registry`), build Vite | `pokemon-universe-web` (target `web`) |
| `.github/workflows/node-server.yml` (transitorio) | `apps/server/`, `packages/shared/`, `Dockerfile`, `.dockerignore`, `scripts/start-server.sh`, `package*.json`, `tsconfig.base.json`, `eslint.config.mjs` | migraciones sobre PostgreSQL de prueba, typecheck, lint, tests, build; `npm audit` no bloqueante en el resumen | `pokemon-universe-server` (target `server`) |
| `.github/workflows/backend.yml` | `backend/` | `./gradlew check` (tests con Testcontainers y `verifyOpenApi`) | `pokemon-universe-backend` (JVM); `main.yml` añade `:<sha>-native` experimental, no bloqueante |

En cada push a `main`, `.github/workflows/main.yml` detecta qué zonas cambiaron desde el último Main verde en `main`
(no desde el push anterior; sin ninguno, construye todo), llama solo a los workflows afectados
con `publish: true` y reetiqueta las imágenes no afectadas de `:pre` a `:<commit-sha>`, de modo que **cada SHA de `main`
tiene las tres imágenes**. Después despliega ese SHA en PRE (ver [`docs/pre-production.md`](docs/pre-production.md)).
La promoción a PRO (`promote-production.yml`) toma como SHA el tag de imagen que ejecuta PRE (las tres imágenes deben
compartirlo); el `PU_COMMIT_SHA` incorporado en una imagen reetiquetada puede ser de un commit anterior y solo se usa
como respaldo si el tag no es un SHA.
Las imágenes son `linux/amd64` y `linux/arm64` con caché de Buildx en GitHub Actions (`type=gha`, un `scope` por imagen):

```text
ghcr.io/matadoreru/pokemon-universe-web:pre
ghcr.io/matadoreru/pokemon-universe-server:pre
ghcr.io/matadoreru/pokemon-universe-backend:pre
ghcr.io/matadoreru/pokemon-universe-web:<commit-sha>
ghcr.io/matadoreru/pokemon-universe-server:<commit-sha>
ghcr.io/matadoreru/pokemon-universe-backend:<commit-sha>
ghcr.io/matadoreru/pokemon-universe-backend:<commit-sha>-native   # experimental, solo amd64
```

Un tag git `v*` (por ejemplo `v0.9.0`) reconstruye las tres imágenes y les añade ese tag; no despliega. Lanzar `main.yml`
a mano (`workflow_dispatch`) fuerza las tres builds; solo hace falta si el job `retag` avisa de que falta un `:pre`
(la primera ejecución ya lo construye todo porque aún no hay ningún Main verde). Los cambios en `main.yml` o en
`.github/actions/` reconstruyen las tres imágenes.

### Tiempos antes/después

Antes: un único workflow (`docker.yml`) en cada push, medido. Después: **estimaciones**, a corregir con la primera
ejecución real de `main.yml`.

| Fase | Antes (medido) | Después (estimado) |
| --- | --- | --- |
| Validación Node | validate 2:43 (npm ci 47 s, typecheck 24 s, lint 11 s, test 30 s, build 25 s) | frontend ≈ 2:00 (install 45 s, lint/typecheck/test en paralelo ≈ 30 s, build 25 s); node-server ≈ 2:30 |
| Imágenes | publish 4:13 (web + server multi-arch bajo QEMU, siempre) | web ≈ 1:00; server ≈ 2:30; backend JVM ≈ 2:00 tras check ≈ 2:30 (Gradle cacheado, Testcontainers ≈ 40 s); solo las que cambian |
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
PU_SERVER_IMAGE=ghcr.io/matadoreru/pokemon-universe-server
PU_WEB_IMAGE=ghcr.io/matadoreru/pokemon-universe-web
PU_BACKEND_IMAGE=ghcr.io/matadoreru/pokemon-universe-backend
PU_POSTGRES_DB=pokemon_universe
PU_POSTGRES_USER=pokemon
PU_POSTGRES_PASSWORD=CONTRASENA_HEXADECIMAL_ALEATORIA
PU_JWT_SECRET=SECRETO_HEXADECIMAL_ALEATORIO
PU_PUBLIC_ORIGIN=https://pokemon.example.com
PU_SECURE_COOKIE=true
PU_ROOMS_ENABLED=false
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
etapa 1 construye las tres imágenes (aún no hay Main verde), así que basta con esperar a que termine antes de desplegar.
`latest` solo se mueve al promocionar a PRO (`promote-production.yml` reetiqueta también el backend); por eso un servidor
con `PU_IMAGE_TAG=latest` no puede arrancar el backend hasta la primera promoción: despliega por SHA o `pre`.

Al arrancar, `server` aplica las migraciones Prisma antes de aceptar tráfico y descarga una sola vez las 1.025 especies.
En reinicios posteriores detecta el catálogo completo y continúa sin consultar PokéAPI.

En Cloudflare Tunnel configura el hostname público para enviar tráfico HTTP a `http://127.0.0.1:8080`. Socket.IO usa
el mismo origen y la ruta `/socket.io/`, por lo que no necesita otro túnel ni puerto. `PU_PUBLIC_ORIGIN` debe coincidir
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

El script crea y valida un backup, descarga las tres imágenes y espera mientras el servidor aplica migraciones y sincroniza
el catálogo; después comprueba los healthchecks y, a través de nginx, `/api/health` y `/api/games` (Java) y `/api/tcg/options` (Node: responde 200 aunque el catálogo TCG esté vacío), para que una ruta rota de nginx hacia cualquiera de los dos dispare el rollback. Si falla, vuelve a las imágenes exactas anteriores. Si el despliegue que falla es el primero que incluye el backend
(no hay contenedor `backend` previo), el rollback elimina el backend nuevo y restaura solo `server` y `web` con
`--no-deps`, porque `web` depende de que el backend esté sano y el nginx anterior no tiene rutas hacia él. Flyway (backend) no aplica migraciones propias en la etapa 1: solo hace baseline del esquema Prisma. Una migración no se deshace
automáticamente; antes de cambios incompatibles debe existir un procedimiento de migración inversa o restaurarse el dump.

No uses `docker compose down -v`: elimina PostgreSQL. Mantén `PU_WATCHTOWER_ENABLE=false`; un despliegue automático sin
backup ni healthcheck rompe las garantías anteriores.

### Salas activas

En la arquitectura actual las salas y sus temporizadores viven en memoria. Reiniciar `server` conserva cuentas y
estadísticas, pero termina las salas activas. Programa el despliegue entre sesiones y avisa a los jugadores. Para hacer
rolling deployments sin perder salas hay que implementar el adaptador Redis documentado en `docs/architecture.md`.

## 6. Desarrollo local con Docker

El Compose principal consume GHCR, como Tabi. Para construir el código local:

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait
```
