#!/usr/bin/env sh
set -eu

project_dir=${PU_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
cd "$project_dir"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

backup_dir=${PU_BACKUP_DIR:-"$project_dir/backups"}
environment_name=${PU_DEPLOY_ENVIRONMENT:-production}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/pokemon-universe-$environment_name-$timestamp.dump"
temporary="$target.partial"

mkdir -p "$backup_dir"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
docker compose exec -T postgres sh -c \
  'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --compress 6 --no-owner --no-acl' \
  > "$temporary"
docker compose exec -T postgres pg_restore --list < "$temporary" >/dev/null
mv "$temporary" "$target"
trap - EXIT HUP INT TERM
printf '%s\n' "$target"
