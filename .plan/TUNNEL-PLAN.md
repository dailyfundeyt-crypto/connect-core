# Handy-Tunnel (helium-tunnel) – Stand 17.10.2026 12:15

Handy öffnet per QR-Code direkt die lokale Connect App (127.0.0.1:3101) über einen Cloudflare Quick-Tunnel.
Gleiche DB (Postgres 5544), gleiche Agenten, gleicher Server-Prozess – kein Sync, kein Vercel.

## Bausteine
- `apps/server/src/tunnel/` (NEU): config.ts (nur Env), store.ts (devices.json/state.json), process.ts (cloudflared versteckt, Wiedererkennung über Metrics-Port 127.0.0.1:3198, Wächter 30 s + öffentlicher Ping 5 min), index.ts (Gate), pages.ts (Kopplungs-/Sperrseite), qrcode-vendor.js (qrcode-generator 1.4.4, MIT).
- `apps/server/src/index.ts`: 3 Einfügungen (Import, Gate vor allem anderen in `fetch`, Start nach listen). Sicherung `index.ts.bak-helium-tunnel-*` (Quelle + Runtime).
- UI: `components/settings/phone-connect-panel.tsx` (NEU), Einstellungen › Handy verbinden (#handy-verbinden), Eintrag „Handy verbinden“ im Profilmenü (level-chrome-sidebar + app-sidebar), Chip in Übersicht › Verbindungen, Seitenleiste. Sicherungen `*.bak-helium-tunnel-*`.
- Skripte `scripts/tunnel/`: setup-tunnel.ps1 / setup-tunnel.sh (cloudflared laden + Signatur prüfen, connect.env setzen), pair.ps1 / pair.sh (Kopplungslink ohne Browser, z.B. VM).
- Daten: `%LOCALAPPDATA%\ConnectApp\tools\cloudflared.exe`, `...\data\tunnel\{state.json,devices.json,admin.key,cloudflared.log}`, connect.env `CONNECT_TUNNEL_MODE=quick` (Sicherung connect.env.bak-helium-tunnel-20261017-115239).

## Env
CONNECT_TUNNEL_MODE off|quick|named|external · CONNECT_TUNNEL_BIN · CONNECT_TUNNEL_TOKEN(_FILE) · CONNECT_TUNNEL_PUBLIC_URL · CONNECT_TUNNEL_PROTOCOL (http2 Standard) · CONNECT_TUNNEL_METRICS_PORT (3198) · CONNECT_TUNNEL_DATA_DIR · CONNECT_DATA_ROOT · CONNECT_TUNNEL_OWNER_USER_ID (sonst CONNECT_SINGLE_USER_ID) · CONNECT_TUNNEL_GUARD (on).

## Sicherheit
- Tunnel-Anfrage = Cloudflare-Header (cf-ray/cf-connecting-ip/cdn-loop) ODER Tunnel-Host – nicht IP (cloudflared kommt von 127.0.0.1).
- Ohne Geräte-Cookie `__Host-connect_device` (HttpOnly, Secure, SameSite=Lax, 400 Tage): HTML → Sperrseite (401), API/WS → 401, keine Assets.
- Kopplung: Einmal-Token 10 min, GET zeigt Bestätigung, POST verbraucht (Link-Vorschauen verbrauchen nichts), Rate-Limit 30 Fehlversuche/10 min.
- Mit Cookie: CSRF (Origin muss Tunnel-Host sein), eigene Better-Auth-Sitzung pro Gerät für Stefans Account (Google-Login-Account dailyfunde.yt@gmail.com), fremde better-auth-Cookies vom Client werden verworfen. ERST DANACH Host/Origin → localhost:3101, damit Brain/Agent-Hub/Helium-Sync/Voice (localOnly) für das gekoppelte Gerät gehen. Unauthentifiziert erreicht keine dieser Routen den Server.
- `/api/tunnel/*` nur lokal (Login + Header x-connect-tunnel bzw. admin.key); über Tunnel 403.
- Abmelden auf dem Handy = Gerät entfernen. Entfernen am PC löscht Gerät + Sitzung sofort.

## VM-Umzug (später)
1. Connect-Code + Bun + Postgres auf der VM; DB: `pg_dump -Fc -h 127.0.0.1 -p 5544 -U connect connect > connect.dump` → `pg_restore -d connect --no-owner connect.dump` (Server-Version ≥ PC). connect.env mitnehmen (KEY_ENCRYPTION_KEY! sonst sind gespeicherte Keys unlesbar), BETTER_AUTH_SECRET gleich lassen.
2. `scripts/tunnel/setup-tunnel.sh` (quick) oder `named <TOKEN> https://connect.<domain>`; systemd-Dienst für Connect (Restart=always) → Autostart nach Boot.
3. Brain-Vault: Obsidian-Ordner auf die VM synchronisieren (Syncthing/Obsidian Sync/rclone mit Drive); CONNECT_BRAIN_PATH/VAULT_PATH anpassen.
4. CLIs + Logins neu: codex, claude, gemini, gbot, freebuff (`… login`), pc-bridge.env, Google-Drive-OAuth (Loopback-Redirect), ggf. Telefon neu koppeln (Cookie hängt an der Domain).
5. Helium-Agent-Browser: braucht Desktop (X/Wayland oder Xvfb + noVNC) und Helium/Chromium-Profil auf der VM; Chrome-Erweiterung/Helium-Sync neu verbinden.
