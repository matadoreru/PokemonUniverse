# Despliegue de Pokémon Universe como Tabi

> Para la instalación recomendada con PRE automático y promoción manual del mismo SHA a PRO, sigue primero [`docs/pre-production.md`](docs/pre-production.md). Este documento conserva el detalle operativo del stack.

La publicación replica el modelo operativo de Tabi, adaptado a las dos imágenes de esta aplicación:

```text
Cloudflare Tunnel → 127.0.0.1:8080 → pokemon-universe-web (nginx)
                                                ↓ HTTP / WebSocket
                                      pokemon-universe-server
                                                ↓
                                  pokemon-universe-postgres
                                                ↓
                           volumen pokemon_universe_postgres_data
```

PostgreSQL no publica puertos. GitHub Actions valida el proyecto y publica imágenes `linux/amd64` y `linux/arm64` en
GHCR con el SHA completo del commit y el tag móvil `pre`. El tag `latest` solo se mueve después de promocionar correctamente ese SHA a PRO. El servidor solo descarga imágenes ya verificadas; no compila.

## 1. Publicar las imágenes

Sube el proyecto a GitHub con rama principal `main`. El workflow `.github/workflows/docker.yml` ejecuta migraciones de
prueba, typecheck, lint, tests, build y auditoría antes de publicar:

```text
ghcr.io/matadoreru/pokemon-universe-server:pre
ghcr.io/matadoreru/pokemon-universe-web:pre
ghcr.io/matadoreru/pokemon-universe-server:<commit-sha>
ghcr.io/matadoreru/pokemon-universe-web:<commit-sha>
```

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

El script crea y valida un backup, descarga las dos imágenes y espera mientras el servidor aplica migraciones y sincroniza
el catálogo; después comprueba los healthchecks y `/api/health`. Si falla, vuelve al tag anterior. Una migración no se deshace
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
