#!/usr/bin/env bash
# Connect Handy-Tunnel einrichten (Linux/VM). Portabel, alles per Env/Argument.
#   ./setup-tunnel.sh                       Quick-Tunnel (trycloudflare.com)
#   ./setup-tunnel.sh named <TOKEN> https://connect.deinedomain.de
#   ./setup-tunnel.sh external https://connect.deinedomain.de   (cloudflared als systemd-Dienst, s.u.)
#   ./setup-tunnel.sh off
# Variablen: CONNECT_DATA_ROOT (Standard ~/.connect-app), CONNECT_ENV_FILE (Standard $CONNECT_DATA_ROOT/data/connect.env)
set -euo pipefail
MODE="${1:-quick}"; TOKEN=""; PUBLIC_URL=""
case "$MODE" in
  named) TOKEN="${2:?Token fehlt}"; PUBLIC_URL="${3:?Oeffentliche URL fehlt}";;
  external) PUBLIC_URL="${2:?Oeffentliche URL fehlt}";;
  quick|off) ;;
  *) echo "Modus: quick|named|external|off" >&2; exit 2;;
esac
ROOT="${CONNECT_DATA_ROOT:-$HOME/.connect-app}"
ENV_FILE="${CONNECT_ENV_FILE:-$ROOT/data/connect.env}"
TOOLS="$ROOT/tools"; BIN="$TOOLS/cloudflared"
mkdir -p "$TOOLS" "$(dirname "$ENV_FILE")"
if [[ "$MODE" == quick || "$MODE" == named ]]; then
  case "$(uname -m)" in x86_64) A=amd64;; aarch64|arm64) A=arm64;; armv7l) A=arm;; *) A=386;; esac
  curl -fsSL -o "$BIN.download" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$A"
  chmod +x "$BIN.download" && mv -f "$BIN.download" "$BIN"
  "$BIN" --version
fi
touch "$ENV_FILE"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$ENV_FILE.bak-helium-tunnel-$STAMP"
grep -vE '^\s*CONNECT_TUNNEL_(MODE|TOKEN|PUBLIC_URL|BIN)\s*=|^# ---- Handy-Tunnel' "$ENV_FILE.bak-helium-tunnel-$STAMP" > "$ENV_FILE" || true
{
  echo "# ---- Handy-Tunnel (scripts/tunnel/setup-tunnel.sh, $STAMP) ----"
  echo "CONNECT_TUNNEL_MODE=$MODE"
  [[ -x "$BIN" ]] && echo "CONNECT_TUNNEL_BIN=$BIN"
  [[ -n "$TOKEN" ]] && echo "CONNECT_TUNNEL_TOKEN=$TOKEN"
  [[ -n "$PUBLIC_URL" ]] && echo "CONNECT_TUNNEL_PUBLIC_URL=${PUBLIC_URL%/}"
} >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Gesetzt in $ENV_FILE (Sicherung .bak-helium-tunnel-$STAMP). Connect-Server neu starten."
cat <<'HINT'
Autostart auf einer VM (Beispiel systemd, Connect startet cloudflared selbst):
  [Unit] Description=Connect   After=network-online.target postgresql.service
  [Service] EnvironmentFile=%h/.connect-app/data/connect.env  WorkingDirectory=<connect>/apps/server
            ExecStart=/usr/local/bin/bun src/index.ts  Restart=always
  [Install] WantedBy=default.target
Alternative fuer feste Domain: cloudflared selbst als Dienst (sudo cloudflared service install <TOKEN>)
und hier Modus "external" mit der Domain.
HINT
