#!/usr/bin/env sh
# Comprobaciones de humo a través de nginx (las usa deploy.sh; también sirven a mano contra un stack local):
# - /api/health, /api/games y /api/tcg/options del backend Java (las tres responden 200 aunque la sincronización
#   inicial de TCGdex siga en segundo plano);
# - el handshake de /ws: 101 y, sin sesión, cierre 4401 «Authentication required» (no 4403 «Rooms disabled», que
#   delataría ROOMS_ENABLED=false).
# Uso: smoke-check.sh <url-base> [origen]   p. ej. smoke-check.sh http://127.0.0.1:8080 https://pokemon.example.com
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Uso: $0 <url-base> [origen]" >&2
  exit 2
fi
base_url=${1%/}
origin=${2:-$base_url}

for smoke_path in /api/health /api/games /api/tcg/options; do
  if ! curl --fail --silent --show-error --max-time 10 "$base_url$smoke_path" >/dev/null; then
    echo "Humo: $smoke_path no respondió 200" >&2
    exit 1
  fi
done

# Tras el 101 el backend manda el cierre 4401 y corta; --max-time acota el caso de que no lo haga (curl sale con 28).
ws_output=$(mktemp)
trap 'rm -f "$ws_output"' EXIT
ws_status=$(curl --silent --max-time 10 --http1.1 --output "$ws_output" --write-out '%{http_code}' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: cG9rZW1vbi11bml2ZXJzZQ==' -H "Origin: $origin" \
  "$base_url/ws") || true
if [ "$ws_status" != 101 ]; then
  echo "Humo: /ws respondió $ws_status al handshake, se esperaba 101" >&2
  exit 1
fi
if ! grep -q 'Authentication required' "$ws_output"; then
  echo "Humo: /ws no cerró con 4401 «Authentication required» (¿salas apagadas?)" >&2
  exit 1
fi
echo "Humo correcto en $base_url: /api/health, /api/games, /api/tcg/options y /ws"
