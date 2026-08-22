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

rollback() {
  echo "El despliegue falló; restaurando las imágenes con tag $previous_tag" >&2
  export PU_IMAGE_TAG=$previous_tag
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
