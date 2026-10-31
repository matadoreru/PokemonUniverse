#!/usr/bin/env sh
# Regenera backend/src/main/resources/db/migration/V1__baseline.sql desde la BD local
# migrada por Prisma (contenedor de compose.local.yaml). No toca el esquema de Prisma.
#
# Variables: PU_PG_CONTAINER (def. pokemonuniverse_postgres_1), PU_CONTAINER_RUNTIME
# (def. podman si existe, si no docker), PU_PG_USER (pokemon), PU_PG_DB (pokemon_universe).
#
# Comprobar el baseline sobre la BD existente (Flyway solo registra la versión 1):
#   cd backend && MICRONAUT_ENVIRONMENTS=dev ./gradlew run
#   podman exec pokemonuniverse_postgres_1 psql -U pokemon -d pokemon_universe \
#     -c 'select version, description, success from flyway_schema_history'
set -eu

project_dir=${PU_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
container=${PU_PG_CONTAINER:-pokemonuniverse_postgres_1}
pg_user=${PU_PG_USER:-pokemon}
pg_db=${PU_PG_DB:-pokemon_universe}
if [ -n "${PU_CONTAINER_RUNTIME:-}" ]; then
  runtime=$PU_CONTAINER_RUNTIME
elif command -v podman >/dev/null 2>&1; then
  runtime=podman
else
  runtime=docker
fi

target="$project_dir/backend/src/main/resources/db/migration/V1__baseline.sql"
tmp="$target.tmp"
mkdir -p "$(dirname -- "$target")"
trap 'rm -f "$tmp"' EXIT

"$runtime" exec "$container" pg_dump --schema-only --no-owner --no-acl \
  --exclude-table=_prisma_migrations -U "$pg_user" "$pg_db" \
  | grep -v -e '^\\restrict ' -e '^\\unrestrict ' -e '^SET ' \
      -e '^SELECT pg_catalog\.set_config' -e '^-- Dumped from' -e '^-- Dumped by' \
  | cat -s > "$tmp"
mv "$tmp" "$target"
echo "Escrito $target"
