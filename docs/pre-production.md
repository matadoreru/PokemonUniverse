# Entornos PRE y PRO

Este proyecto publica una imagen inmutable por commit. Un cambio fusionado en `main` se despliega automáticamente en PRE; PRO solo cambia cuando se ejecuta y aprueba el workflow **Promote current PRE image to production**. La promoción no recompila: despliega exactamente el SHA que PRE está ejecutando.

```text
Rama de trabajo → PR a main → validación → imagen :<SHA> → PRE
                                                                └→ aprobación manual → PRO
```

PRE y PRO no comparten PostgreSQL, avatares, JWT, contraseñas, red Compose ni hostname.

## Orden seguro de activación

1. Crea en GitHub la variable de repositorio `PRE_DEPLOY_ENABLED=false`.
2. Fusiona esta infraestructura en `main`; se publicarán las imágenes, pero PRE todavía no se desplegará.
3. Sigue las secciones siguientes para preparar servidor, `.env`, Cloudflare y GitHub Environments.
4. Cambia `PRE_DEPLOY_ENABLED=true` y relanza manualmente el workflow de publicación sobre `main`.

Esto evita que el primer workflow intente conectarse a un PRE que aún no existe.

## 1. Preparar DNS y Cloudflare Tunnel

Configura dos hostnames HTTPS:

- `pre.pokemon.tudominio.com` → `http://127.0.0.1:8081`
- `pokemon.tudominio.com` → `http://127.0.0.1:8080`

No publiques PostgreSQL ni el servidor Node directamente. Ambos hostnames deben atravesar su contenedor web nginx.

## 2. Preparar el usuario de despliegue

El usuario del servidor necesita acceso a Docker sin `sudo`, lectura del repositorio y lectura de las imágenes GHCR. En una máquina de confianza, genera una clave exclusiva para GitHub Actions:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/pokemon-universe-actions -C pokemon-universe-actions
ssh-copy-id -i ~/.ssh/pokemon-universe-actions.pub USUARIO@SERVIDOR
ssh-keyscan -H SERVIDOR
```

Guarda la clave privada y la salida verificada de `ssh-keyscan`; se configurarán como secretos de GitHub. Si GHCR es privado, inicia sesión una sola vez en el servidor:

```bash
echo 'TOKEN_CON_READ_PACKAGES' | docker login ghcr.io -u matadoreru --password-stdin
```

El repositorio también debe poder ejecutar `git fetch` sin interacción. Para un repositorio privado, configura una deploy key de solo lectura o credenciales Git adecuadas en el servidor.

## 3. Conservar y preparar PRO

Antes de cambiar nada, crea un backup del PRO actual:

```bash
cd /srv/docker/pokemon-universe
./scripts/backup-postgres.sh
```

Mantén el checkout PRO actual en `/srv/docker/pokemon-universe`. Actualiza el repositorio y añade a su `.env` estas variables, conservando las contraseñas actuales:

```env
PU_COMPOSE_PROJECT_NAME=pokemon-universe
PU_DEPLOY_ENVIRONMENT=production
PU_HOST_PORT=8080
PU_POSTGRES_VOLUME=pokemon_universe_postgres_data
PU_AVATAR_VOLUME=pokemon_universe_avatar_data
```

Los nombres de volumen son deliberadamente los históricos. No los cambies y no ejecutes `docker compose down -v`.

Para una instalación PRO nueva, copia `.env.pro.example` como `.env`, reemplaza el dominio y genera dos secretos diferentes:

```bash
cp .env.pro.example .env
openssl rand -hex 32
openssl rand -hex 32
chmod 600 .env
```

## 4. Crear PRE

PRE puede vivir en el mismo servidor porque utiliza otro puerto y otros nombres de contenedor y volumen:

```bash
cd /srv/docker
git clone URL_DEL_REPOSITORIO pokemon-universe-pre
cd pokemon-universe-pre
cp .env.pre.example .env
openssl rand -hex 32
openssl rand -hex 32
chmod 600 .env
```

Edita `.env` y configura:

- `PU_POSTGRES_PASSWORD` con el primer secreto nuevo.
- `PU_JWT_SECRET` con el segundo secreto nuevo.
- `PU_PUBLIC_ORIGIN=https://pre.pokemon.tudominio.com`.

No reutilices secretos, base de datos ni volumen de avatares de PRO.

## 5. Validar ambos Compose

```bash
cd /srv/docker/pokemon-universe
docker compose config --quiet

cd /srv/docker/pokemon-universe-pre
docker compose config --quiet
```

Puedes comprobar que los recursos no colisionan:

```bash
cd /srv/docker/pokemon-universe
docker compose config --format json | jq '.name, .volumes'

cd /srv/docker/pokemon-universe-pre
docker compose config --format json | jq '.name, .volumes'
```

## 6. Configurar GitHub Environments

En **Settings → Environments**, crea `pre` y `production`.

En **Settings → Secrets and variables → Actions → Variables**, comprueba que existe la variable de repositorio `PRE_DEPLOY_ENABLED=false`. Este interruptor permite fusionar la infraestructura antes de que el checkout PRE y sus secretos existan.

En ambos configura estas variables, cambiando `DEPLOY_PATH` y `PUBLIC_URL`:

| Variable | PRE | production |
|---|---|---|
| `DEPLOY_HOST` | IP o hostname SSH | IP o hostname SSH |
| `DEPLOY_PORT` | `22` | `22` |
| `DEPLOY_USER` | usuario Docker | usuario Docker |
| `DEPLOY_PATH` | `/srv/docker/pokemon-universe-pre` | `/srv/docker/pokemon-universe` |
| `PUBLIC_URL` | URL HTTPS de PRE | URL HTTPS de PRO |

En ambos configura estos secretos:

- `DEPLOY_SSH_KEY`: contenido completo de `~/.ssh/pokemon-universe-actions`.
- `DEPLOY_KNOWN_HOSTS`: línea verificada del host SSH, incluyendo el puerto si no es 22.

En el entorno `production`, activa **Required reviewers** y selecciónate como aprobador. PRE no debe requerir aprobación.
Configura también **Deployment branches and tags** para permitir exclusivamente `main` en ambos entornos. El workflow de promoción rechaza cualquier ejecución lanzada desde otra rama.

Cuando PRE ya esté preparado y todas las variables y secretos anteriores existan, cambia la variable de repositorio `PRE_DEPLOY_ENABLED` a `true`.

## 7. Proteger `main`

En **Settings → Branches → Add branch protection rule** para `main`:

- exige pull request antes de fusionar;
- exige que pase `Validate Pokémon Universe`;
- bloquea pushes forzados;
- exige que la rama esté actualizada antes de fusionar.

`main` representa el código candidato más reciente; PRO representa el último SHA promocionado. Así puedes probar un merge en PRE sin publicarlo inmediatamente para jugadores reales.

## 8. Primer despliegue y uso diario

Con la infraestructura ya fusionada inicialmente con `PRE_DEPLOY_ENABLED=false`, termina de preparar los directorios y GitHub Environments, cambia la variable a `true` y vuelve a ejecutar **Validate and publish Docker images** manualmente sobre `main`.

A partir de entonces, cada ejecución de **Validate and publish Docker images** hará lo siguiente:

1. aplicar migraciones sobre PostgreSQL de prueba;
2. ejecutar typecheck, lint, tests, build y auditoría;
3. publicar server y web como `:<SHA>` y `:pre`;
4. conectarse por SSH y desplegar `:<SHA>` en PRE.

Comprueba PRE, incluyendo login, creación de sala, Socket.IO, minijuegos, reconexión y migraciones. Cuando quieras llevarlo a PRO:

1. abre **Actions**;
2. selecciona **Promote current PRE image to production**;
3. pulsa **Run workflow**;
4. revisa el SHA detectado en PRE;
5. aprueba el job del entorno `production`.

El workflow despliega el mismo SHA en PRO y solo después mueve el tag `latest` a esa versión.

## 9. Comprobaciones

```bash
curl --fail --silent https://pre.pokemon.tudominio.com/api/health | jq
curl --fail --silent https://pokemon.tudominio.com/api/health | jq

cd /srv/docker/pokemon-universe-pre && docker compose ps
cd /srv/docker/pokemon-universe && docker compose ps
```

El campo `commit` de `/api/health` debe coincidir en ambos entornos justo después de una promoción.

## 10. Rollback

Los despliegues crean un backup y restauran las imágenes anteriores si falla el healthcheck. Para volver manualmente a un SHA anterior:

```bash
cd /srv/docker/pokemon-universe
./scripts/deploy.sh SHA_ANTERIOR
```

El rollback de imagen no revierte una migración PostgreSQL. Para migraciones incompatibles prepara primero una migración inversa o restaura el dump creado antes del despliegue.

Las salas viven en memoria: desplegar reinicia el servidor y termina las salas activas. Promociona PRO entre sesiones.
