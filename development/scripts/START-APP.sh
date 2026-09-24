#!/usr/bin/env bash
# Connect IS the browser: open Host-Chrome/Edge with the Connect profile
# (tabs, address bar, extensions). NOT --app= wrapping the web UI as a site.
# Usage (from Connect/): ./START-APP.sh [optional-start-url]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONTROL_URL="${1:-http://127.0.0.1:3010}"
PROFILE="${CONNECT_CHROME_PROFILE:-${HOME}/.connect-chrome-profile/desktop}"

log() { printf '\033[1;36m[Connect]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Connect]\033[0m %s\n' "$*"; }

# Stack must be up so Lab / open-chrome can talk to the API.
port="$(printf '%s' "$CONTROL_URL" | sed -n 's/.*:\([0-9][0-9]*\).*/\1/p')"
port="${port:-3010}"
if ! curl -sf -o /dev/null --max-time 2 "$CONTROL_URL" 2>/dev/null; then
  log "API/UI unter $CONTROL_URL antwortet nicht — starte Stack mit ./START.sh …"
  if [ -x "$ROOT/START.sh" ]; then
    CONNECT_FORCE_START="${CONNECT_FORCE_START:-1}" "$ROOT/START.sh" &
    for _ in $(seq 1 60); do
      if curl -sf -o /dev/null --max-time 1 "$CONTROL_URL" 2>/dev/null; then
        break
      fi
      sleep 1
    done
  else
    warn "START.sh fehlt. Starte den Dev-Server selbst und rufe dieses Script erneut auf."
  fi
fi

mkdir -p "$PROFILE"

# Real browser window with Connect profile — never --app= (that packs Connect as a website).
open_browser() {
  local bin="$1"
  if command -v "$bin" >/dev/null 2>&1; then
    log "Connect-Browser: $bin · Profil $PROFILE"
    log "Steuerung (Tab): $CONTROL_URL — Surfen/Extensions im selben Fenster."
    nohup "$bin" \
      --user-data-dir="$PROFILE" \
      --no-first-run \
      --no-default-browser-check \
      --new-window \
      "$CONTROL_URL" \
      >/dev/null 2>&1 &
    return 0
  fi
  return 1
}

if open_browser google-chrome-stable; then exit 0; fi
if open_browser google-chrome; then exit 0; fi
if open_browser chromium; then exit 0; fi
if open_browser chromium-browser; then exit 0; fi
if open_browser microsoft-edge; then exit 0; fi
if open_browser brave-browser; then exit 0; fi

# macOS — open as real Chrome/Edge with Connect profile (not --app=).
if [ "$(uname -s)" = "Darwin" ]; then
  if [ -d "/Applications/Google Chrome.app" ]; then
    log "Connect-Browser: Google Chrome (macOS) · Profil $PROFILE"
    open -na "Google Chrome" --args \
      --user-data-dir="$PROFILE" \
      --no-first-run \
      --no-default-browser-check \
      --new-window \
      "$CONTROL_URL"
    exit 0
  fi
  if [ -d "/Applications/Microsoft Edge.app" ]; then
    log "Connect-Browser: Microsoft Edge (macOS) · Profil $PROFILE"
    open -na "Microsoft Edge" --args \
      --user-data-dir="$PROFILE" \
      --no-first-run \
      --no-default-browser-check \
      --new-window \
      "$CONTROL_URL"
    exit 0
  fi
fi

warn "Kein Chrome/Edge gefunden. Installiere Chrome oder setze CONNECT_CHROME_BIN."
warn "Connect ist der Browser — nicht die Website im Normal-Tab."
exit 1
