# Web-Google-OAuth einrichten

Anleitung für den **Web-OAuth-Client** (`…2ucfqocj….apps.googleusercontent.com`),
der für Cloud-Deployments (Supabase-Auth, Cloud-Preview) verwendet wird.

Der **Desktop-Client** (lokale Entwicklung, `localhost:3001`) ist separat und
wird durch `activate-google-oauth.sh` konfiguriert.

---

## Übersicht

| Client | Für | Redirect-URI |
|--------|-----|--------------|
| Desktop-Client (`GOOGLE_OAUTH_CLIENT_ID`) | `localhost:3001` Dev-Stack | `http://localhost:3001/api/auth/callback/google` |
| Web-Client (`GOOGLE_OAUTH_WEB_CLIENT_ID`) | Cloud-Deployment / Supabase | `https://DEINE-DOMAIN/api/auth/callback/google` |

---

## Schritt 1 — Google Console: Redirect-URI + JS-Origin setzen

1. Öffne [Google Cloud Console → APIs & Dienste → Anmeldedaten](https://console.cloud.google.com/apis/credentials)
2. Klicke auf den **Web-Client** (`…2ucfqocj…`)
3. Unter **Autorisierte Weiterleitungs-URIs** hinzufügen:
   ```
   http://localhost:3001/api/auth/callback/google
   ```
4. Unter **Autorisierte JavaScript-Quellen** hinzufügen:
   ```
   http://localhost:3010
   ```
5. **Speichern** — Änderungen brauchen ca. 5–10 Minuten bis sie aktiv sind

---

## Schritt 2 — Credentials in `.env` eintragen

```env
# Web-OAuth-Client (für Cloud / Supabase)
GOOGLE_OAUTH_WEB_CLIENT_ID=XXXX-2ucfqocj...apps.googleusercontent.com
GOOGLE_OAUTH_WEB_CLIENT_SECRET=GOCSPX-...
```

---

## Schritt 3 — Aktivieren mit Script

```bash
# In WSL oder Linux-Terminal im Connect-Verzeichnis:
bun --env-file=.env scripts/activate-web-google-oauth.ts
```

Das Script:
1. Liest `GOOGLE_OAUTH_WEB_CLIENT_ID` und `GOOGLE_OAUTH_WEB_CLIENT_SECRET`
2. Führt eine **Redirect-Probe** durch (prüft ob Google den URI akzeptiert)
3. Bei **PASS**: trägt Credentials als `GOOGLE_OAUTH_CLIENT_ID/SECRET` ein, startet Server neu
4. Bei **FAIL**: bricht ab mit Hinweis auf die Console-Einstellung

> **Nur ausführen wenn Redirect-Probe PASS** — nicht ohne Console-Einstellung erzwingen.

---

## Schritt 4 — Verifizieren

Nach erfolgreichem Start:

```bash
# Google muss in authProviders erscheinen:
curl http://localhost:3001/api/capabilities
# → {"authProviders":["google"],...}

# Browser öffnen:
START-APP.cmd http://localhost:3010/sign
# → "Continue with Google" Button erscheint
```

---

## Troubleshooting

### `redirect_uri_mismatch`
Der Redirect-URI ist nicht in der Google Console eingetragen.
→ Schritt 1 wiederholen, 10 Minuten warten.

### Google schlägt sofort fehl (kein Consent-Screen)
Der Client ist nicht für `localhost` freigegeben.
→ App-Typ muss **"Web application"** sein (nicht "Desktop").

### Server crasht beim Start
Log prüfen:
```bash
tail -40 .logs/server.log
```
Häufigste Ursache: `BETTER_AUTH_SECRET` fehlt oder zu kurz.
Der generierte Secret ist in `.env` als Kommentar vorbereitet.

---

## Zustand nach Aktivierung

```
CONNECT_SINGLE_USER=true    ← entfernt/auskommentiert
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=<generiert>
INITIAL_ADMIN_EMAILS=stefankunc994@gmail.com
GOOGLE_OAUTH_CLIENT_ID=<web-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<web-client-secret>
GOOGLE_OAUTH_WEB_CLIENT_ID=<web-client-id>     ← Quelle
GOOGLE_OAUTH_WEB_CLIENT_SECRET=<web-secret>    ← Quelle
```
