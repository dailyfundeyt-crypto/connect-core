# Cloud-Deployment — Connect/Connect

Dieses Dokument beschreibt den Cloud-Build und das Deployment der Web-App (`app/`).
Der Dev-Stack (localhost:3010) wird von diesem Dokument nicht berührt.

---

## Architektur

```
Connect/app/       ← Gemeinsame Codebasis (Dev + Cloud)
   dev:   bun run dev   → HMR auf :3010
   cloud: bun run build:cloud → dist/ → Supabase/CDN
```

| Modus | Variable | Port | Auth |
|-------|----------|------|------|
| Dev (lokal) | `VITE_CONNECT_EDITION=dev` | 3010 | Desktop-Google-Client |
| Cloud | `VITE_CONNECT_EDITION=cloud` | 43122 (Preview) | Web-Google-Client |

---

## Cloud-Build

```bash
cd Connect/app

# Build für Cloud (setzt VITE_CONNECT_EDITION=cloud)
bun run build:cloud
# oder direkt:
bun scripts/build-cloud.ts
```

Ergebnis: `app/dist/` — statische Dateien für CDN/Supabase-Hosting.

---

## Preview lokal (Port 43122)

```bash
cd Connect/app
bun serve.ts
# → http://localhost:43122
```

Der Preview-Server nutzt dieselbe `dist/` wie das Cloud-Deployment.
Nützlich um Cloud-Builds vor dem Deploy zu prüfen.

---

## Google OAuth für Cloud

Der Cloud-Build benötigt den **Web-OAuth-Client** (nicht den Desktop-Client).

Anleitung: [WEB-GOOGLE-AUTH.md](./WEB-GOOGLE-AUTH.md)

### `.env` Einträge für Cloud:

```env
# Web-Client (für Cloud-Deployment)
GOOGLE_OAUTH_WEB_CLIENT_ID=XXXX-2ucfqocj...apps.googleusercontent.com
GOOGLE_OAUTH_WEB_CLIENT_SECRET=GOCSPX-...
```

### Aktivieren:

```bash
bun --env-file=.env scripts/activate-web-google-oauth.ts
```

---

## Supabase-Projekt

**Projekt:** `connect`  
**Ref:** `uagtqafgnsinjqtrmwve`  
**URL:** https://uagtqafgnsinjqtrmwve.supabase.co

Dev, PC und Cloud teilen dasselbe Supabase-Projekt.

### Tabellen (Supabase):
- `connect_profiles` — Google-Profil nach Login
- `connect_workspaces` — Workspace-Daten
- `connect_onboarding` — Onboarding-Status

### Sync-Secrets:

```env
CONNECT_SYNC_SECRET=<server-side-secret>
VITE_CONNECT_SYNC_SECRET=<client-side-secret>
```

Diese Secrets werden beim Setup generiert und in `.env` eingetragen.

---

## Deployment-Schritte

1. **Google Console**: Web-Client konfigurieren (Redirect-URI + JS-Origin)
2. **`.env`**: `GOOGLE_OAUTH_WEB_CLIENT_ID/SECRET` eintragen
3. **Script**: `bun --env-file=.env scripts/activate-web-google-oauth.ts`
4. **Build**: `cd app && bun run build:cloud`
5. **Preview**: `bun serve.ts` → http://localhost:43122
6. **Deploy**: Cloud-Provider deiner Wahl (Vercel, Netlify, Supabase-Hosting)

---

## Checkliste nach Deployment

```bash
# 1. authProviders enthält google:
curl https://DEINE-API-URL/api/capabilities

# 2. Login-Flow funktioniert:
# Browser → /sign → "Continue with Google" → stefankunc994@gmail.com

# 3. Session erstellt:
curl -H "Cookie: ..." https://DEINE-API-URL/api/me
# → {"user":{"id":"...","email":"stefankunc994@gmail.com",...}}

# 4. DB prüfen (lokal):
docker exec connect-postgres-1 psql -U connect -d connect \
  -c "SELECT count(*) FROM sessions; SELECT count(*) FROM accounts WHERE provider_id='google';"
```
