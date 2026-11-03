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
configured_tag=${PU_IMAGE_TAG:-latest}
# Con la BD vacía el backend sincroniza PokéAPI antes de estar sano (107 s medidos; start_period 5 min). El
# --wait-timeout debe superar start_period + interval × retries = 390 s más la descarga: no bajar de 450 s.
deploy_wait_seconds=${PU_DEPLOY_WAIT_SECONDS:-600}
project_name=${PU_COMPOSE_PROJECT_NAME:-pokemon-universe}
environment_name=${PU_DEPLOY_ENVIRONMENT:-production}
web_container=$(docker compose ps -q web 2>/dev/null || true)
backend_container=$(docker compose ps -q backend 2>/dev/null || true)
# Contenedor Node (`server`) de antes del corte 2D. compose.yaml ya no lo define, así que `compose up` lo deja vivo
# como huérfano: se mantiene hasta que el humo pasa (el nginx de la imagen web anterior, si hay rollback, enruta a
# server:3001 y no arranca sin él) y entonces se retira.
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
  if [ "$rollback_snapshot" -eq 1 ]; then
    echo "Restaurando las imágenes exactas anteriores: $previous_backend_ref / $previous_web_ref" >&2
    export PU_WEB_IMAGE="$rollback_web_image"
    export PU_BACKEND_IMAGE="$rollback_backend_image"
    export PU_IMAGE_TAG="$rollback_tag"
  else
    echo "No se pudo crear el snapshot local; restaurando el tag $previous_tag" >&2
    export PU_IMAGE_TAG="$previous_tag"
  fi
  if [ -n "$legacy_server_container" ]; then
    # Primer despliegue tras el corte: Node sigue vivo y las imágenes anteriores vuelven con el compose.yaml nuevo.
    # Para recuperar también el compose anterior: git checkout <SHA anterior> && ./scripts/deploy.sh <SHA anterior>.
    echo "Node (server) sigue en marcha; para volver del todo al stack anterior al corte despliega su SHA con su compose.yaml" >&2
  fi
  docker compose up -d --wait --wait-timeout "$deploy_wait_seconds" backend web || true
  exit 1
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
