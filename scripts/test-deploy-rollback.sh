#!/usr/bin/env bash
# Simulación de scripts/deploy.sh con un `docker` falso: comprueba que cada `compose up` arranca Java con salas,
# interrupción de salas y sincronización encendidas (también con un .env antiguo que las apagaba) y que un fallo del
# `up` o del humo restaura las imágenes exactas anteriores de backend y web (sin snapshot local, el tag anterior). La
# configuración efectiva sale del docker compose real (`config`, sin daemon).
# Uso: scripts/test-deploy-rollback.sh   (necesita docker compose v2: `docker compose` o el binario docker-compose)
# DEPLOY_UNDER_TEST y COMPOSE_UNDER_TEST permiten probar otras versiones (por defecto, las del repositorio).
set -euo pipefail

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
real_compose=${REAL_COMPOSE:-}
if [ -z "$real_compose" ]; then
  # Primero el plugin: algunos /usr/bin/docker-compose reenvían a `docker compose`, que aquí es el docker falso.
  for candidate in /usr/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose /usr/lib/docker/cli-plugins/docker-compose "$HOME/.docker/cli-plugins/docker-compose" docker-compose; do
    if command -v "$candidate" >/dev/null 2>&1; then real_compose=$(command -v "$candidate"); break; fi
  done
fi
[ -n "$real_compose" ] || { echo "Falta docker compose v2 (define REAL_COMPOSE)" >&2; exit 2; }

work=$(mktemp -d)
trap '[ -n "${KEEP_WORK:-}" ] || rm -rf "$work"' EXIT
prev_sha=1111111111111111111111111111111111111111
new_sha=2222222222222222222222222222222222222222

mkdir -p "$work/bin"
cat > "$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
# docker falso: registra cada llamada y valida cada `compose up` con la configuración real.
set -uo pipefail
log=$STUB_DIR/log
echo "docker $*" >> "$log"
if [ "$1" = compose ]; then
  shift
  case "$1" in
    ps)
      case "$*" in
        *postgres*) ;;
        *web*) echo webid ;;
        *backend*) echo backendid ;;
      esac
      exit 0 ;;
    pull|logs|rm) exit 0 ;;
    port) echo 127.0.0.1:8080; exit 0 ;;
    up)
      n=$(cat "$STUB_DIR/ups" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$STUB_DIR/ups"
      config=$("$REAL_COMPOSE" -f "$STUB_PROJECT/compose.yaml" --project-directory "$STUB_PROJECT" config --format json 2>>"$log" </dev/null) || { echo "config falló" >> "$log"; exit 3; }
      # Los `up` fallidos (STUB_FAIL_UPS, por número de orden) no arrancan nada.
      case " ${STUB_FAIL_UPS:-} " in
        *" $n "*) echo "UPFAIL (simulado)" >> "$log"; exit 1 ;;
      esac
      java=$(printf '%s' "$config" | python3 -c 'import json,sys; c=json.load(sys.stdin)["services"]["backend"]["environment"]; print(c.get("ROOMS_ENABLED","false"), c.get("BACKEND_DATA_SYNC_ENABLED","false"), c.get("INTERRUPT_STALE_ROOMS","false"))')
      image=$(printf '%s' "$config" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["backend"]["image"])')
      web=$(printf '%s' "$config" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["web"]["image"])')
      echo "UP java(rooms,sync,interrupt)=$java image=$image web=$web" >> "$log"
      exit 0 ;;
  esac
  exit 0
fi
case "$1" in
  image)
    # STUB_FAIL_TAG=1 simula que no se puede crear el snapshot local (`docker image tag` falla).
    if [ "$2" = tag ] && [ "${STUB_FAIL_TAG:-0}" = 1 ]; then exit 1; fi
    exit 0 ;;
  inspect)
    case "$*" in
      *webid*Config.Image*) echo "ghcr.io/x/pokemon-universe-web:$STUB_PREV_SHA" ;;
      *backendid*Config.Image*) echo "ghcr.io/x/pokemon-universe-backend:$STUB_PREV_SHA" ;;
      *) echo sha256:abc ;;
    esac
    exit 0 ;;
esac
exit 0
STUB
chmod +x "$work/bin/docker"

failures=0
# escenario: nombre, `up` que fallan (números de orden, "" ninguno), humo pasa (1/0) y, opcional, `image tag` falla
# (1/0).
run_case() {
  local name=$1 fail_ups=$2 smoke_ok=$3 fail_tag=${4:-0}
  local dir="$work/$name" project="$work/$name/project"
  mkdir -p "$dir" "$project/scripts"
  cp "${COMPOSE_UNDER_TEST:-$repo/compose.yaml}" "$project/compose.yaml"
  cp "${DEPLOY_UNDER_TEST:-$repo/scripts/deploy.sh}" "$project/scripts/deploy.sh"
  printf '#!/bin/sh\nexit %s\n' "$([ "$smoke_ok" = 1 ] && echo 0 || echo 1)" > "$project/scripts/smoke-check.sh"
  chmod +x "$project/scripts/"*.sh
  # .env de antes del corte 2D, que intentaba apagar las salas de Java.
  printf 'PU_POSTGRES_PASSWORD=x\nPU_JWT_SECRET=y\nPU_PUBLIC_ORIGIN=https://example.test\nPU_ROOMS_ENABLED=false\nPU_DATA_SYNC_ENABLED=false\n' > "$project/.env"
  set +e
  STUB_DIR=$dir STUB_PROJECT=$project STUB_PREV_SHA=$prev_sha STUB_FAIL_UPS=$fail_ups STUB_FAIL_TAG=$fail_tag REAL_COMPOSE=$real_compose \
    PATH="$work/bin:$PATH" PU_PROJECT_DIR=$project sh "$project/scripts/deploy.sh" "$new_sha" > "$dir/out" 2>&1
  local status=$?
  set -e
  echo "== $name: salida $status"
  grep '^UP' "$dir/log" | sed 's/^/   /'
  if grep -q 'config falló' "$dir/log"; then
    echo "   FALLO: compose config falló"; failures=$((failures + 1))
  fi
  printf '%s' "$status" > "$dir/status"
}
expect_status() {
  local name=$1 want=$2 got; got=$(cat "$work/$name/status")
  if [ "$got" != "$want" ]; then
    echo "   FALLO: se esperaba salida $want y fue $got"; failures=$((failures + 1))
  fi
}
# Todos los `up` que arrancan algo tienen Java encendido (rooms, sync, interrupt).
expect_java_on() {
  local name=$1
  if grep '^UP ' "$work/$name/log" | grep -v 'java(rooms,sync,interrupt)=true true true ' >/dev/null; then
    echo "   FALLO: algún up arranca Java con un interruptor apagado"; failures=$((failures + 1))
  fi
}
# El último `up` (el que queda en marcha) usa estas imágenes del backend y de la web (patrones glob: el tag del
# snapshot lleva el PID).
expect_last_images() {
  local name=$1 want_backend=$2 want_web=$3 last backend web
  last=$(grep '^UP ' "$work/$name/log" | tail -n1)
  backend=$(printf '%s' "$last" | sed -n 's/.* image=\([^ ]*\).*/\1/p')
  web=$(printf '%s' "$last" | sed -n 's/.* web=\([^ ]*\).*/\1/p')
  # shellcheck disable=SC2254
  case "$backend" in
    $want_backend) ;;
    *) echo "   FALLO: el último up debía usar $want_backend y usa ${backend:-ninguna}"; failures=$((failures + 1)) ;;
  esac
  # shellcheck disable=SC2254
  case "$web" in
    $want_web) ;;
    *) echo "   FALLO: el último up debía usar $want_web y usa ${web:-ninguna}"; failures=$((failures + 1)) ;;
  esac
}
# El log del docker falso contiene esta llamada.
expect_log() {
  local name=$1 text=$2
  if ! grep -qF -- "$text" "$work/$name/log"; then
    echo "   FALLO: falta «$text» en las llamadas a docker"; failures=$((failures + 1))
  fi
}

rollback_backend='pokemon-universe-backend-rollback:deployment-rollback-*'
rollback_web='pokemon-universe-web-rollback:deployment-rollback-*'
ghcr=ghcr.io/matadoreru/pokemon-universe
run_case ok "" 1;           expect_status ok 0; expect_java_on ok
expect_last_images ok "$ghcr-backend:$new_sha" "$ghcr-web:$new_sha"
# Despliegue correcto: los tags locales del snapshot sobran.
expect_log ok "docker image rm pokemon-universe-web-rollback:deployment-rollback-"
run_case up-falla 1 1;      expect_status up-falla 1; expect_java_on up-falla
expect_last_images up-falla "$rollback_backend" "$rollback_web"
run_case humo-falla "" 0;   expect_status humo-falla 1; expect_java_on humo-falla
expect_last_images humo-falla "$rollback_backend" "$rollback_web"
# Sin snapshot (`docker image tag` falla), el rollback vuelve al tag del backend anterior en las dos imágenes.
run_case sin-snapshot 1 1 1; expect_status sin-snapshot 1; expect_java_on sin-snapshot
expect_last_images sin-snapshot "$ghcr-backend:$prev_sha" "$ghcr-web:$prev_sha"

if [ "$failures" -ne 0 ]; then echo "$failures fallos" >&2; exit 1; fi
echo "Despliegue: Java siempre encendido y el rollback restaura las imágenes anteriores"
