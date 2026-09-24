#!/usr/bin/env bash
# Connect one-shot starter for this workspace.
# Usage: ./START.sh   (from Connect/)   or: bash Connect/START.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

log() { printf '\033[1;36m[Connect]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Connect]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[Connect]\033[0m %s\n' "$*"; exit 1; }

# --- Bun ---
if ! command -v bun >/dev/null 2>&1; then
  log "Bun fehlt — installiere…"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
log "Bun $(bun --version)"

# --- Docker ---
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker ist nicht installiert. Bitte Docker installieren und erneut starten."
fi
if ! docker info >/dev/null 2>&1; then
  warn "Docker-Daemon antwortet nicht — versuche Start…"
  sudo service docker start >/dev/null 2>&1 || true
  sudo chmod 666 /var/run/docker.sock >/dev/null 2>&1 || true
fi
if ! docker info >/dev/null 2>&1; then
  fail "Docker läuft nicht. Starte den Docker-Daemon und versuche es erneut."
fi
log "Docker ok"

# --- .env ---
if [ ! -f "$ROOT/.env" ]; then
  log "Lege .env aus .env.example an…"
  cp "$ROOT/.env.example" "$ROOT/.env"
fi

missing=()
if ! grep -qE '^INTELLIGENCE_API_KEY=.+' "$ROOT/.env"; then
  missing+=("INTELLIGENCE_API_KEY (cpk-… von: npx copilotkit@latest login && project select)")
fi
if ! grep -qE '^OPENAI_API_KEY=.+' "$ROOT/.env" && ! grep -qE '^ANTHROPIC_API_KEY=.+' "$ROOT/.env"; then
  missing+=("OPENAI_API_KEY oder ANTHROPIC_API_KEY")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  warn "Erforderliche Keys fehlen in .env:"
  for m in "${missing[@]}"; do
    warn "  - $m"
  done
  warn "Trage die Keys in Connect/.env ein und starte erneut mit ./START.sh"
  warn "Ohne Keys bricht scripts/start.sh beim API-Server ab."
  if [ "${CONNECT_FORCE_START:-}" != "1" ]; then
    fail "Abbruch (setze CONNECT_FORCE_START=1 um trotzdem zu starten)."
  fi
  warn "CONNECT_FORCE_START=1 — starte trotzdem…"
fi

# --- Dependencies ---
if [ ! -d "$ROOT/node_modules" ]; then
  log "bun install…"
  bun install
else
  log "node_modules vorhanden — überspringe bun install (FORCE_INSTALL=1 zum Neuinstallieren)"
  if [ "${FORCE_INSTALL:-}" = "1" ]; then
    bun install
  fi
fi

# --- Start ---
log "Starte Stack (API :3001, App :3010)…"
log "Stoppen später: bash scripts/stop.sh"

# Ensure Postgres is up before migrate fallbacks in scripts/start.sh
if ! docker compose ps --status running 2>/dev/null | grep -q postgres; then
  log "Starte Docker-Basisdienste…"
  docker compose up -d postgres >/dev/null
fi

exec bash "$ROOT/scripts/start.sh"
