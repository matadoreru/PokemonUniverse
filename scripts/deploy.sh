#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <tag-o-sha-de-imagen>" >&2
  exit 2
fi

project_dir=${PU_PROJECT_DIR:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)}
cd "$project_dir"
if [ -f .env ]; then
  set -a
  # Deployment files only contain shell-compatible KEY=value assignments.
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

new_tag=$1
# Interna (compose.yaml): los interruptores de salas y sincronización de Java valen true salvo en el rollback del corte.
# Se fija aquí para que ni el entorno ni un .env la cambien.
export PU_CUTOVER_ROLLBACK_JAVA=true
configured_tag=${PU_IMAGE_TAG:-latest}
# Con la BD vacía el backend sincroniza PokéAPI antes de estar sano (107 s medidos; start_period 5 min). El
# --wait-timeout debe superar start_period + interval × retries = 390 s más la descarga: no bajar de 450 s.
deploy_wait_seconds=${PU_DEPLOY_WAIT_SECONDS:-600}
project_name=${PU_COMPOSE_PROJECT_NAME:-pokemon-universe}
environment_name=${PU_DEPLOY_ENVIRONMENT:-production}
web_container=$(docker compose ps -q web 2>/dev/null || true)
backend_container=$(docker compose ps -q backend 2>/dev/null || true)
# Contenedor Node (`server`) de antes del corte 2D. compose.yaml ya no lo define. Se para (sin borrarlo) antes de
# arrancar el backend nuevo: Java enciende salas, interrupción de salas y sincronización, y Node no puede seguir
# sirviendo salas ni escribiendo esas tablas a la vez. Si hay rollback se vuelve a arrancar (el nginx de la imagen web
# anterior enruta a server:3001 y no arranca sin él); si el humo pasa, se borra.
legacy_server_container=$(docker ps -aq \
  --filter "label=com.docker.compose.project=$project_name" \
  --filter "label=com.docker.compose.service=server" 2>/dev/null || true)

# Preserve the exact local images that are running. A tag such as `latest` can
# move during pull, so a tag alone is not a reliable rollback target.
rollback_tag="deployment-rollback-$$"
rollback_web_image="${project_name}-web-rollback"
rollback_backend_image="${project_name}-backend-rollback"
previous_web_ref=$(docker inspect "$web_container" --format '{{.Config.Image}}' 2>/dev/null || true)
previous_backend_ref=$(docker inspect "$backend_container" --format '{{.Config.Image}}' 2>/dev/null || true)
previous_web_id=$(docker inspect "$web_container" --format '{{.Image}}' 2>/dev/null || true)
previous_backend_id=$(docker inspect "$backend_container" --format '{{.Image}}' 2>/dev/null || true)
rollback_snapshot=0
cutover_fallback=0
if [ -n "$previous_web_id" ] && [ -n "$previous_backend_id" ] \
  && docker image tag "$previous_web_id" "$rollback_web_image:$rollback_tag" \
  && docker image tag "$previous_backend_id" "$rollback_backend_image:$rollback_tag"; then
  rollback_snapshot=1
fi

previous_tag=${previous_backend_ref##*:}
previous_tag=${previous_tag:-$configured_tag}

rollback() {
  echo "El despliegue falló. Estado y últimos logs del backend:" >&2
  docker compose ps -a >&2 || true
  docker compose logs --no-color --tail=200 backend web >&2 || true
  if [ -n "$legacy_server_container" ]; then
    rollback_across_cutover
  fi
  if [ "$rollback_snapshot" -eq 1 ]; then
    echo "Restaurando las imágenes exactas anteriores: $previous_backend_ref / $previous_web_ref" >&2
    export PU_WEB_IMAGE="$rollback_web_image"
    export PU_BACKEND_IMAGE="$rollback_backend_image"
    export PU_IMAGE_TAG="$rollback_tag"
  else
    echo "No se pudo crear el snapshot local; restaurando el tag $previous_tag" >&2
    export PU_IMAGE_TAG="$previous_tag"
  fi
  docker compose up -d --wait --wait-timeout "$deploy_wait_seconds" backend web || true
  if [ "$cutover_fallback" -eq 1 ]; then
    cat >&2 <<AVISO
################################################################################
ATENCIÓN: rollback de emergencia. Node (server) sirve salas y sincroniza junto al compose.yaml NUEVO, con salas,
interrupción de salas y sincronización apagadas en Java (PU_CUTOVER_ROLLBACK_JAVA=false). Este estado no se sostiene
solo: un 'docker compose up' a mano con este compose.yaml vuelve a encender esos interruptores con Node en marcha.
En cuanto puedas, redespliega el SHA anterior ($previous_tag) desde su propio checkout:
  git checkout --detach SHA_ANTERIOR && ./scripts/deploy.sh SHA_ANTERIOR
################################################################################
AVISO
  fi
  exit 1
}

# Rollback del primer despliegue tras el corte 2D (había un contenedor Node `server`). Node vuelve a servir salas y a
# sincronizar, así que Java no puede tener encendidos sus interruptores.
# 1. Si el SHA anterior está en el checkout (deploy-ssh hace `git fetch` y despliega por SHA) y su compose.yaml define
#    `server` y `backend`, se levanta ese compose.yaml con sus imágenes: el stack de antes del corte tal cual.
# 2. Si no, o si ese `up` falla, se arranca de nuevo Node y rollback() restaura las imágenes anteriores con el
#    compose.yaml nuevo y PU_CUTOVER_ROLLBACK_JAVA=false (salas, interrupción de salas y sincronización de Java
#    apagadas). Es un estado de emergencia: rollback() avisa de que hay que redesplegar el SHA anterior.
rollback_across_cutover() {
  previous_compose=$(mktemp)
  if printf '%s' "$previous_tag" | grep -Eq '^[0-9a-f]{40}$' \
    && git -C "$project_dir" show "$previous_tag:compose.yaml" > "$previous_compose" 2>/dev/null \
    && grep -q '^  server:' "$previous_compose" && grep -q '^  backend:' "$previous_compose"; then
    echo "Volviendo al stack anterior al corte con el compose.yaml de $previous_tag" >&2
    if PU_IMAGE_TAG="$previous_tag" docker compose -f "$previous_compose" --project-directory "$project_dir" \
      up -d --wait --wait-timeout "$deploy_wait_seconds" server backend web; then
      rm -f "$previous_compose"
      # Ese stack usa las imágenes de GHCR del SHA anterior: los tags locales del snapshot ya no hacen falta.
      if [ "$rollback_snapshot" -eq 1 ]; then
        docker image rm "$rollback_web_image:$rollback_tag" "$rollback_backend_image:$rollback_tag" >/dev/null 2>&1 \
          || true
      fi
      exit 1
    fi
    echo "Falló el stack anterior al corte de $previous_tag" >&2
  else
    echo "Sin un compose.yaml de $previous_tag con server y backend" >&2
  fi
  rm -f "$previous_compose"
  echo "Node vuelve y Java arranca con salas y sincronización apagadas" >&2
  export PU_CUTOVER_ROLLBACK_JAVA=false
  cutover_fallback=1
  # El `up` fallido del compose anterior puede haber recreado el contenedor: se vuelve a buscar por etiquetas.
  server_containers=$(docker ps -aq \
    --filter "label=com.docker.compose.project=$project_name" \
    --filter "label=com.docker.compose.service=server" 2>/dev/null || true)
  # Puede haber más de un id (uno por línea): se separan a propósito.
  # shellcheck disable=SC2086
  docker start ${server_containers:-$legacy_server_container} >&2 || true
}

postgres_container=$(docker compose ps -q postgres 2>/dev/null || true)
known_postgres_container=$(docker compose ps -q --all postgres 2>/dev/null || true)
if [ -z "$postgres_container" ] && [ -n "$known_postgres_container" ]; then
  docker compose up -d --wait --wait-timeout "$deploy_wait_seconds" postgres
  postgres_container=$(docker compose ps -q postgres 2>/dev/null || true)
fi
if [ -n "$postgres_container" ]; then
  "$project_dir/scripts/backup-postgres.sh"
else
  echo "Primera instalación de $environment_name: todavía no existe un PostgreSQL activo que respaldar."
fi
export PU_IMAGE_TAG="$new_tag"
docker compose pull backend web
if [ -n "$legacy_server_container" ]; then
  echo "Parando Node (server), anterior al corte 2D: el backend Java pasa a servir salas y sincronización"
  # shellcheck disable=SC2086
  docker stop $legacy_server_container >/dev/null || rollback
fi
docker compose up -d --wait --wait-timeout "$deploy_wait_seconds" backend web || rollback

# A través de nginx, para que una ruta rota de nginx hacia el backend también dispare el rollback.
published_port=$(docker compose port web 8080 | sed 's/.*://')
if ! "$project_dir/scripts/smoke-check.sh" "http://127.0.0.1:${published_port:-8080}" "${PU_PUBLIC_ORIGIN:-}"; then
  rollback
fi

if [ -n "$legacy_server_container" ]; then
  echo "Retirando el contenedor Node (server) anterior al corte 2D"
  # Puede haber más de un id (uno por línea): se separan a propósito.
  # shellcheck disable=SC2086
  docker rm -f $legacy_server_container >/dev/null 2>&1 || true
fi
if [ "$rollback_snapshot" -eq 1 ]; then
  docker image rm "$rollback_web_image:$rollback_tag" "$rollback_backend_image:$rollback_tag" >/dev/null 2>&1 || true
fi

echo "Despliegue correcto en $environment_name: $new_tag"
