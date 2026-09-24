#!/usr/bin/env bash
# =============================================================
# activate-google-oauth.sh — Google OAuth in 1 Schritt aktivieren
#
# Was dieses Script tut:
#   1. Fragt nach Google Desktop-Client Credentials
#   2. Trägt sie in .env ein (uncommentiert die Zeilen)
#   3. Aktiviert BETTER_AUTH_* und INITIAL_ADMIN_EMAILS
#   4. Deaktiviert CONNECT_SINGLE_USER=true
#   5. Startet den API-Server neu
#   6. Prüft dass Google in authProviders erscheint
#
# Aufruf (in WSL):
#   cd '/mnt/c/Users/Kunc GmbH/Desktop/Connect'
#   bash activate-google-oauth.sh
# =============================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║  Google OAuth Aktivierung — Connect Dev              ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Benötigt: Google Desktop-OAuth-Client"
echo "  Redirect URI (muss im Client eingetragen sein):"
echo "  → http://localhost:3001/api/auth/callback/google"
echo ""
echo "  Google Console: https://console.cloud.google.com/apis/credentials"
echo ""

# ─── Schritt 1: Credentials abfragen ───────────────────────
echo "  GOOGLE_OAUTH_CLIENT_ID:"
echo "  (Format: XXXXXXXXXX-xxxxxxxx.apps.googleusercontent.com)"
read -rp "  > " NEW_CLIENT_ID
NEW_CLIENT_ID="${NEW_CLIENT_ID// /}"   # Leerzeichen entfernen

if [[ -z "$NEW_CLIENT_ID" ]]; then
  echo "  ❌ Abbruch: Client-ID ist leer."
  exit 1
fi

echo ""
echo "  GOOGLE_OAUTH_CLIENT_SECRET:"
echo "  (Format: GOCSPX-...)"
read -rp "  > " NEW_CLIENT_SECRET
NEW_CLIENT_SECRET="${NEW_CLIENT_SECRET// /}"

if [[ -z "$NEW_CLIENT_SECRET" ]]; then
  echo "  ❌ Abbruch: Client-Secret ist leer."
  exit 1
fi

echo ""
echo "  ┌─ Zusammenfassung ────────────────────────────────────"
echo "  │ Client-ID:     ${NEW_CLIENT_ID:0:50}"
echo "  │ Client-Secret: ${NEW_CLIENT_SECRET:0:12}..."
echo "  └──────────────────────────────────────────────────────"
echo ""
read -rp "  In .env eintragen und Server neustarten? [j/N] " CONFIRM
if [[ "${CONFIRM,,}" != "j" ]]; then
  echo "  Abbruch."
  exit 0
fi

echo ""
echo "  [1/5] Schreibe .env ..."

# Backup
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"

# Credentials eintragen: kommentierte Zeilen durch aktive ersetzen
sed -i "s|^# GOOGLE_OAUTH_CLIENT_ID=.*|GOOGLE_OAUTH_CLIENT_ID=${NEW_CLIENT_ID}|" "$ENV_FILE"
sed -i "s|^# GOOGLE_OAUTH_CLIENT_SECRET=.*|GOOGLE_OAUTH_CLIENT_SECRET=${NEW_CLIENT_SECRET}|" "$ENV_FILE"

# BETTER_AUTH_* einkommentieren (# entfernen)
sed -i "s|^# BETTER_AUTH_URL=|BETTER_AUTH_URL=|" "$ENV_FILE"
sed -i "s|^# BETTER_AUTH_SECRET=|BETTER_AUTH_SECRET=|" "$ENV_FILE"
sed -i "s|^# INITIAL_ADMIN_EMAILS=|INITIAL_ADMIN_EMAILS=|" "$ENV_FILE"

# CONNECT_SINGLE_USER deaktivieren
sed -i "s|^CONNECT_SINGLE_USER=true|# CONNECT_SINGLE_USER=true  ← Google OAuth aktiv|" "$ENV_FILE"

echo "  [2/5] Verifiziere .env ..."

# Prüfe ob alle Keys aktiv sind
check_env() {
  local key="$1"
  local val
  val=$(grep "^${key}=" "$ENV_FILE" | cut -d= -f2- | xargs 2>/dev/null || echo "")
  if [[ -z "$val" ]]; then
    echo "  ❌ FEHLER: ${key} ist leer oder nicht aktiv!"
    echo "  Restore mit: cp ${ENV_FILE}.bak.* ${ENV_FILE}"
    exit 1
  fi
  echo "  ✅ ${key}: ${val:0:40}"
}

check_env "GOOGLE_OAUTH_CLIENT_ID"
check_env "GOOGLE_OAUTH_CLIENT_SECRET"
check_env "BETTER_AUTH_URL"
check_env "BETTER_AUTH_SECRET"
check_env "INITIAL_ADMIN_EMAILS"

# Sicherstellen SINGLE_USER weg ist
if grep -q "^CONNECT_SINGLE_USER=true" "$ENV_FILE"; then
  echo "  ❌ FEHLER: CONNECT_SINGLE_USER=true konnte nicht entfernt werden!"
  exit 1
fi
echo "  ✅ CONNECT_SINGLE_USER: deaktiviert"

echo ""
echo "  [3/5] Beende alten API-Server ..."
OLD_PID=$(pgrep -f "bun.*production-entry" 2>/dev/null || true)
if [[ -n "$OLD_PID" ]]; then
  echo "  Beende PID $OLD_PID ..."
  kill "$OLD_PID" 2>/dev/null || true
  sleep 3
else
  echo "  Kein laufender Server gefunden."
fi

echo "  [4/5] Starte API-Server mit Google OAuth ..."
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/server-google-oauth.log"

nohup bun --env-file="$ENV_FILE" "$SCRIPT_DIR/server/src/production-entry.ts" \
  > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "  Server PID: $NEW_PID | Log: $LOG_FILE"

echo "  [5/5] Warte auf API ..."
for i in {1..15}; do
  sleep 2
  if curl -sf http://localhost:3001/api/capabilities >/dev/null 2>&1; then
    echo "  ✅ API antwortet nach ${i}×2s"
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "  ⚠  API noch nicht bereit — Log prüfen:"
    tail -30 "$LOG_FILE"
    exit 1
  fi
  echo -n "  ."
done

# Ergebnis prüfen
echo ""
CAPS=$(curl -s http://localhost:3001/api/capabilities)
echo "  API: $CAPS"
echo ""

if echo "$CAPS" | grep -q '"google"'; then
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║  ✅ ERFOLG! Google OAuth ist aktiv.                  ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "  Nächster Schritt:"
  echo "  → Browser: http://localhost:3010/sign"
  echo "  → 'Continue with Google' klicken"
  echo "  → Mit stefankunc994@gmail.com anmelden"
  echo ""
  echo "  Nach Login prüfen:"
  echo "  curl http://localhost:3001/api/me"
else
  echo "  ❌ Google nicht in authProviders!"
  echo "  Log (letzte 40 Zeilen):"
  tail -40 "$LOG_FILE"
  echo ""
  echo "  Restore: cp ${ENV_FILE}.bak.* ${ENV_FILE}"
fi
