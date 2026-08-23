#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <tag-o-sha-de-imagen>" >&2
  exit 2
fi

project_dir=${PU_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
new_tag=$1
previous_tag=${PU_IMAGE_TAG:-}
cd "$project_dir"

# Preserve the exact local images that are running. A tag such as `latest` can
# move during pull, so a tag alone is not a reliable rollback target.
rollback_tag="deployment-rollback-$$"
previous_server_ref=$(docker inspect pokemon-universe-server --format '{{.Config.Image}}' 2>/dev/null || true)
previous_web_ref=$(docker inspect pokemon-universe-web --format '{{.Config.Image}}' 2>/dev/null || true)
previous_server_id=$(docker inspect pokemon-universe-server --format '{{.Image}}' 2>/dev/null || true)
previous_web_id=$(docker inspect pokemon-universe-web --format '{{.Image}}' 2>/dev/null || true)
rollback_snapshot=0
if [ -n "$previous_server_id" ] && [ -n "$previous_web_id" ] \
  && docker image tag "$previous_server_id" "pokemon-universe-server-rollback:$rollback_tag" \
  && docker image tag "$previous_web_id" "pokemon-universe-web-rollback:$rollback_tag"; then
  rollback_snapshot=1
fi

rollback() {
  echo "El despliegue falló. Estado y últimos logs del servidor:" >&2
  docker compose ps -a >&2 || true
  docker compose logs --no-color --tail=200 server >&2 || true
  if [ "$rollback_snapshot" -eq 1 ]; then
    echo "Restaurando las imágenes exactas anteriores: $previous_server_ref / $previous_web_ref" >&2
    export PU_SERVER_IMAGE=pokemon-universe-server-rollback
    export PU_WEB_IMAGE=pokemon-universe-web-rollback
    export PU_IMAGE_TAG=$rollback_tag
  else
    echo "No se pudo crear el snapshot local; restaurando el tag $previous_tag" >&2
    export PU_IMAGE_TAG=$previous_tag
  fi
  docker compose up -d --wait server web || true
  exit 1
}

if [ -z "$previous_tag" ]; then
  previous_image=$(docker inspect pokemon-universe-server --format '{{.Config.Image}}' 2>/dev/null || true)
  previous_tag=${previous_image##*:}
  previous_tag=${previous_tag:-latest}
fi

"$project_dir/scripts/backup-postgres.sh"
export PU_IMAGE_TAG=$new_tag
docker compose pull server web
docker compose up -d --wait server web || rollback

published_port=$(docker compose port web 8080 | sed 's/.*://')
if ! curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${published_port:-8080}/api/health" >/dev/null; then
  rollback
fi

echo "Despliegue correcto: $new_tag"
