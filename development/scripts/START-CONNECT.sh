#!/usr/bin/env bash
# Open Connect as a native window (title bar, no address bar).
# The Connect UI is the window content. This does not open Chrome or Edge.
#
#   ./START-CONNECT.sh            # launch a built binary, or tauri dev
#   ./START-CONNECT.sh --dev      # always the dev window
#   ./START-CONNECT.sh --build    # tauri build (installer for this OS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DESKTOP="$ROOT/desktop"
export CONNECT_PRODUCT_WINDOW=1
export CONNECT_ROOT="$ROOT"
export CONNECT_FORCE_START="${CONNECT_FORCE_START:-1}"

mode="${1:-}"
cd "$DESKTOP"

if [ "$mode" = "--build" ]; then
  exec bun run connect:package
fi

release=""
if [ -x "$DESKTOP/src-tauri/target/release/connect-desktop" ]; then
  release="$DESKTOP/src-tauri/target/release/connect-desktop"
elif [ -x "$DESKTOP/src-tauri/target/release/connect-desktop.exe" ]; then
  release="$DESKTOP/src-tauri/target/release/connect-desktop.exe"
fi

if [ "$mode" != "--dev" ] && [ -n "$release" ]; then
  printf '\033[1;36m[Connect]\033[0m Natives Fenster: %s\n' "$release"
  exec "$release"
fi

if ! command -v bun >/dev/null 2>&1; then
  printf '\033[1;33m[Connect]\033[0m Bun fehlt. Im Ordner desktop:\n'
  printf '  bun install\n  bun run connect\n  bun run connect:package\n'
  exit 1
fi

exec bun run connect
