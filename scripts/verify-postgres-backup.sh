#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo "Uso: $0 /ruta/al/backup.dump" >&2
  exit 2
fi

project_dir=${PU_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
cd "$project_dir"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
docker compose exec -T postgres pg_restore --list < "$1" >/dev/null
echo "Backup legible: $1"
