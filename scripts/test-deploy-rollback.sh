#!/usr/bin/env bash
# Simulación de scripts/deploy.sh con `docker` y `git` falsos: comprueba que ningún `compose up` deja a Node (contenedor
# `server`) y a Java con salas o sincronización encendidas a la vez, también en el rollback del primer despliegue tras
# el corte 2D. La configuración efectiva sale del docker compose real (`config`, sin daemon).
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
# compose.yaml anterior al corte: el del último commit con Node (igual al de main antes de fusionar el corte). Fijo:
# tras la fusión, el de main ya no tiene server. Necesita el historial completo (en CI, fetch-depth: 0).
git -C "$repo" show 9275fd9:compose.yaml > "$work/pre-cutover-compose.yaml"
grep -q '^  server:' "$work/pre-cutover-compose.yaml" || { echo "El compose anterior no tiene server" >&2; exit 2; }

mkdir -p "$work/bin"
cat > "$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
# docker falso: registra, simula el estado de Node y valida cada `compose up` con la configuración real.
set -uo pipefail
log=$STUB_DIR/log
echo "docker $*" >> "$log"
node_state=$(cat "$STUB_DIR/node" 2>/dev/null || echo absent)
if [ "$1" = compose ]; then
  shift
  files=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -f) files+=(-f "$2"); shift 2 ;;
      --project-directory) shift 2 ;;
      *) break ;;
    esac
  done
  [ "${#files[@]}" -gt 0 ] || files=(-f "$STUB_PROJECT/compose.yaml")
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
      shift
      requested=()
      while [ "$#" -gt 0 ]; do
        case "$1" in
          --wait-timeout) shift 2 ;;
          -*) shift ;;
          *) requested+=("$1"); shift ;;
        esac
      done
      n=$(cat "$STUB_DIR/ups" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$STUB_DIR/ups"
      config=$("$REAL_COMPOSE" "${files[@]}" --project-directory "$STUB_PROJECT" config --format json 2>>"$log" </dev/null) || { echo "config falló" >> "$log"; exit 3; }
      services=$(printf '%s' "$config" | python3 -c 'import json,sys; print(" ".join(json.load(sys.stdin)["services"]))')
      # Como compose: un servicio pedido que el fichero no define hace fallar el `up` sin arrancar nada.
      for service in "${requested[@]}"; do
        case " $services " in
          *" $service "*) ;;
          *) echo "UPFAIL files=${files[*]} no existe el servicio $service" >> "$log"; exit 1 ;;
        esac
      done
      # Los `up` fallidos (STUB_FAIL_UPS, por número de orden) no arrancan nada: el peor caso para el rollback.
      case " ${STUB_FAIL_UPS:-} " in
        *" $n "*) echo "UPFAIL files=${files[*]} (simulado)" >> "$log"; exit 1 ;;
      esac
      java=$(printf '%s' "$config" | python3 -c 'import json,sys; c=json.load(sys.stdin)["services"]["backend"]["environment"]; print(c.get("ROOMS_ENABLED","false"), c.get("BACKEND_DATA_SYNC_ENABLED","false"), c.get("INTERRUPT_STALE_ROOMS","false"))')
      has_server=$(printf '%s' "$config" | python3 -c 'import json,sys; print("yes" if "server" in json.load(sys.stdin)["services"] else "no")')
      [ "$has_server" = yes ] && node_state=running && echo running > "$STUB_DIR/node"
      echo "UP files=${files[*]} node=$node_state java(rooms,sync,interrupt)=$java tag=${PU_IMAGE_TAG:-}" >> "$log"
      if [ "$node_state" = running ] && printf '%s' "$java" | grep -q true; then
        echo "VIOLACION: Node en marcha con Java (rooms,sync,interrupt)=$java" >> "$log"
      fi
      exit 0 ;;
  esac
  exit 0
fi
case "$1" in
  ps) [ "$node_state" != absent ] && echo legacyid; exit 0 ;;
  inspect)
    case "$*" in
      *webid*Config.Image*) echo "ghcr.io/x/pokemon-universe-web:$STUB_PREV_SHA" ;;
      *backendid*Config.Image*) echo "ghcr.io/x/pokemon-universe-backend:$STUB_PREV_SHA" ;;
      *) echo sha256:abc ;;
    esac
    exit 0 ;;
  stop) echo stopped > "$STUB_DIR/node"; exit 0 ;;
  start) echo running > "$STUB_DIR/node"; exit 0 ;;
  rm) echo absent > "$STUB_DIR/node"; exit 0 ;;
  image) exit 0 ;;
esac
exit 0
STUB
cat > "$work/bin/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >> "$STUB_DIR/log"
if [ "${STUB_GIT:-1}" = 1 ] && [ "$3" = show ] && [ "$4" = "$STUB_PREV_SHA:compose.yaml" ]; then
  cat "$STUB_PRE_COMPOSE"; exit 0
fi
exit 128
STUB
chmod +x "$work/bin/docker" "$work/bin/git"

failures=0
# escenario: nombre, Node antes (running/absent), `up` que fallan (números de orden, "" ninguno), git tiene el SHA
# (1/0), humo pasa (1/0); opcionales: compose.yaml del SHA anterior y líneas extra del .env.
run_case() {
  local name=$1 node=$2 fail_ups=$3 has_git=$4 smoke_ok=$5 pre_compose=${6:-$work/pre-cutover-compose.yaml}
  local env_extra=${7:-}
  local dir="$work/$name" project="$work/$name/project"
  mkdir -p "$dir" "$project/scripts"
  cp "${COMPOSE_UNDER_TEST:-$repo/compose.yaml}" "$project/compose.yaml"
  cp "${DEPLOY_UNDER_TEST:-$repo/scripts/deploy.sh}" "$project/scripts/deploy.sh"
  printf '#!/bin/sh\nexit %s\n' "$([ "$smoke_ok" = 1 ] && echo 0 || echo 1)" > "$project/scripts/smoke-check.sh"
  chmod +x "$project/scripts/"*.sh
  # .env de antes del corte (sin PU_CUTOVER_ROLLBACK_JAVA) e intentando apagar/encender cosas.
  printf 'PU_POSTGRES_PASSWORD=x\nPU_JWT_SECRET=y\nPU_PUBLIC_ORIGIN=https://example.test\nPU_ROOMS_ENABLED=false\nPU_DATA_SYNC_ENABLED=true\n' > "$project/.env"
  [ -z "$env_extra" ] || printf '%s\n' "$env_extra" >> "$project/.env"
  echo "$node" > "$dir/node"
  set +e
  STUB_DIR=$dir STUB_PROJECT=$project STUB_PREV_SHA=$prev_sha STUB_PRE_COMPOSE=$pre_compose \
    STUB_FAIL_UPS=$fail_ups STUB_GIT=$has_git REAL_COMPOSE=$real_compose PATH="$work/bin:$PATH" \
    PU_PROJECT_DIR=$project sh "$project/scripts/deploy.sh" "$new_sha" > "$dir/out" 2>&1
  local status=$?
  set -e
  local final_node; final_node=$(cat "$dir/node")
  local verdict=ok
  grep -q VIOLACION "$dir/log" && verdict="Node y Java a la vez"
  grep -q 'config falló' "$dir/log" && verdict="compose config falló"
  echo "== $name: salida $status, Node al final: $final_node, $verdict"
  grep '^UP' "$dir/log" | sed 's/^/   /'
  [ "$verdict" = ok ] || failures=$((failures + 1))
  printf '%s' "$verdict|$status|$final_node" > "$dir/result"
}
expect() {
  local name=$1 want_status=$2 want_node=$3
  IFS="|" read -r _ status node < "$work/$name/result" || true
  if [ "$status" != "$want_status" ] || [ "$node" != "$want_node" ]; then
    echo "   FALLO: se esperaba salida $want_status y Node $want_node" ; failures=$((failures + 1))
  fi
}

# El primer `up` que arranca algo tiene estos interruptores de Java (rooms, sync, interrupt).
expect_first_java() {
  local name=$1 want=$2 got
  got=$(grep -m1 '^UP ' "$work/$name/log" | sed 's/.*java(rooms,sync,interrupt)=\(.*\) tag=.*/\1/')
  if [ "$got" != "$want" ]; then
    echo "   FALLO: el primer up debía tener Java $want y tiene ${got:-ninguno}"; failures=$((failures + 1))
  fi
}
# El último `up` (el que queda en marcha) tiene estos interruptores de Java.
expect_last_java() {
  local name=$1 want=$2 got
  got=$(grep '^UP ' "$work/$name/log" | tail -n1 | sed 's/.*java(rooms,sync,interrupt)=\(.*\) tag=.*/\1/')
  if [ "$got" != "$want" ]; then
    echo "   FALLO: el último up debía tener Java $want y tiene ${got:-ninguno}"; failures=$((failures + 1))
  fi
}
expect_out() {
  local name=$1 text=$2
  if ! grep -qF -- "$text" "$work/$name/out"; then
    echo "   FALLO: falta «$text» en la salida"; failures=$((failures + 1))
  fi
}

# El log del docker falso contiene esta llamada.
expect_log() {
  local name=$1 text=$2
  if ! grep -qF -- "$text" "$work/$name/log"; then
    echo "   FALLO: falta «$text» en las llamadas a docker"; failures=$((failures + 1))
  fi
}

fallback_note='redespliega el SHA anterior'
# compose.yaml con server y sin backend (anterior a la etapa 1).
git -C "$repo" show ac5b3ff:compose.yaml > "$work/no-backend-compose.yaml"
! grep -q '^  backend:' "$work/no-backend-compose.yaml" || { echo "ac5b3ff ya tiene backend" >&2; exit 2; }

run_case corte-ok running "" 1 1;                expect corte-ok 0 absent
expect_first_java corte-ok "true true true"
run_case corte-up-falla-con-git running 1 1 1;   expect corte-up-falla-con-git 1 running
# Vuelve con el compose anterior (imágenes de GHCR): los tags locales *-rollback:deployment-rollback-* sobran.
expect_log corte-up-falla-con-git "docker image rm pokemon-universe-web-rollback:deployment-rollback-"
run_case corte-up-falla-sin-git running 1 0 1;   expect corte-up-falla-sin-git 1 running
expect_last_java corte-up-falla-sin-git "false false false"; expect_out corte-up-falla-sin-git "$fallback_note"
run_case corte-humo-falla-sin-git running "" 0 0; expect corte-humo-falla-sin-git 1 running
expect_last_java corte-humo-falla-sin-git "false false false"; expect_out corte-humo-falla-sin-git "$fallback_note"
# El compose anterior no tiene backend: no se usa y se cae al rollback con el compose nuevo.
run_case corte-anterior-sin-backend running 1 1 1 "$work/no-backend-compose.yaml"
expect corte-anterior-sin-backend 1 running
expect_last_java corte-anterior-sin-backend "false false false"; expect_out corte-anterior-sin-backend "$fallback_note"
# El `up` del compose anterior también falla: no se sale con Node parado, se cae al rollback con el compose nuevo.
run_case corte-up-anterior-falla running "1 2" 1 1; expect corte-up-anterior-falla 1 running
expect_last_java corte-up-anterior-falla "false false false"; expect_out corte-up-anterior-falla "$fallback_note"
run_case normal-falla absent 1 1 1;              expect normal-falla 1 absent
run_case normal-ok absent "" 1 1;                expect normal-ok 0 absent
expect_first_java normal-ok "true true true"
# Un .env con PU_CUTOVER_ROLLBACK_JAVA=false no apaga a Java en un despliegue normal: deploy.sh la fija a true.
run_case normal-env-rollback-false absent "" 1 1 "" "PU_CUTOVER_ROLLBACK_JAVA=false"
expect normal-env-rollback-false 0 absent; expect_first_java normal-env-rollback-false "true true true"

if [ "$failures" -ne 0 ]; then echo "$failures fallos" >&2; exit 1; fi
echo "Rollback: Node y Java nunca sirven salas ni sincronizan a la vez"
