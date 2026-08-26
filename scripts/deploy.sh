#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <tag-o-sha-de-imagen>" >&2
  exit 2
fi

project_dir=${PU_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
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
deploy_wait_seconds=${PU_DEPLOY_WAIT_SECONDS:-600}
project_name=${PU_COMPOSE_PROJECT_NAME:-pokemon-universe}
environment_name=${PU_DEPLOY_ENVIRONMENT:-production}
server_container=$(docker compose ps -q server 2>/dev/null || true)
web_container=$(docker compose ps -q web 2>/dev/null || true)

# Preserve the exact local images that are running. A tag such as `latest` can
# move during pull, so a tag alone is not a reliable rollback target.
rollback_tag="deployment-rollback-$$"
rollback_server_image="${project_name}-server-rollback"
rollback_web_image="${project_name}-web-rollback"
previous_server_ref=$(docker inspect "$server_container" --format '{{.Config.Image}}' 2>/dev/null || true)
previous_web_ref=$(docker inspect "$web_container" --format '{{.Config.Image}}' 2>/dev/null || true)
previous_server_id=$(docker inspect "$server_container" --format '{{.Image}}' 2>/dev/null || true)
previous_web_id=$(docker inspect "$web_container" --format '{{.Image}}' 2>/dev/null || true)
rollback_snapshot=0
if [ -n "$previous_server_id" ] && [ -n "$previous_web_id" ] \
  && docker image tag "$previous_server_id" "$rollback_server_image:$rollback_tag" \
  && docker image tag "$previous_web_id" "$rollback_web_image:$rollback_tag"; then
  rollback_snapshot=1
fi

rollback() {
  echo "El despliegue falló. Estado y últimos logs del servidor:" >&2
  docker compose ps -a >&2 || true
  docker compose logs --no-color --tail=200 server >&2 || true
  if [ "$rollback_snapshot" -eq 1 ]; then
    echo "Restaurando las imágenes exactas anteriores: $previous_server_ref / $previous_web_ref" >&2
    export PU_SERVER_IMAGE=$rollback_server_image
    export PU_WEB_IMAGE=$rollback_web_image
    export PU_IMAGE_TAG=$rollback_tag
  else
    echo "No se pudo crear el snapshot local; restaurando el tag $previous_tag" >&2
    export PU_IMAGE_TAG=$previous_tag
  fi
  docker compose up -d --wait --wait-timeout "$deploy_wait_seconds" server web || true
  exit 1
}

previous_tag=${previous_server_ref##*:}
previous_tag=${previous_tag:-$configured_tag}

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
export PU_IMAGE_TAG=$new_tag
docker compose pull server web
docker compose up -d --wait --wait-timeout "$deploy_wait_seconds" server web || rollback

published_port=$(docker compose port web 8080 | sed 's/.*://')
if ! curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${published_port:-8080}/api/health" >/dev/null; then
  rollback
fi

if [ "$rollback_snapshot" -eq 1 ]; then
  docker image rm "$rollback_server_image:$rollback_tag" "$rollback_web_image:$rollback_tag" >/dev/null 2>&1 || true
fi

echo "Despliegue correcto en $environment_name: $new_tag"
