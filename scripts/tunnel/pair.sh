#!/usr/bin/env bash
# Neuen Kopplungslink (Einmal-Token, 10 min) erzeugen - headless, nur lokal. Optional: qrencode fuer QR im Terminal.
set -euo pipefail
ROOT="${CONNECT_DATA_ROOT:-$HOME/.connect-app}"; PORT="${PORT:-3101}"
KEY="$(tr -d '\r\n' < "$ROOT/data/tunnel/admin.key")"
OUT="$(curl -fsS -X POST -H "x-connect-tunnel-key: $KEY" -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$PORT/api/tunnel/pair")"
URL="$(printf '%s' "$OUT" | sed -E 's/.*"pairUrl":"([^"]+)".*/\1/')"
echo "Kopplungslink: $URL"
command -v qrencode >/dev/null && qrencode -t ansiutf8 "$URL" || true
