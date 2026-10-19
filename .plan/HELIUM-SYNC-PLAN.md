# Connect Sync – Helium ↔ Connect ↔ Handy (17.10.2026)

## Bausteine
- Erweiterung (MV3) `OpenBot-v2-Helium\extensions\connect-sync\` (manifest, background.js, popup, Icons im Connect-Logo).
  Spricht nur mit http://127.0.0.1:3101. Startet bei onStartup/onInstalled, Alarm alle 30 s, Reconnect mit Backoff 1 s→60 s.
  Kopplung: POST /api/helium-sync/pair (nur Loopback + Origin chrome-extension://…, TOFU auf die erste Erweiterungs-ID) → Token in
  `%LOCALAPPDATA%\ConnectApp\data\helium-sync.json`. Long-Poll /poll (8 s, weil Bun nach 10 s Leerlauf trennt), /state, /result.
  Mehrere Browser mit der Erweiterung: einer ist „primary“, der andere übernimmt, wenn der erste 30 s weg ist.
- Server lokal: `apps/server/src/helium-sync/` (hub, routes, token, tools). Route in app.ts nur ohne CONNECT_SERVERLESS.
- Brücke: `pc-bridge/helium-store.ts` (Tabellen connect_pc_browser, connect_pc_browser_cmds; RLS an, keine Policies),
  Worker schiebt Tab-Stand bei Änderung (0,4 s entprellt) + alle 20 s, holt Befehle **jede Sekunde** (statt 20-s-Heartbeat).
- Vercel: `pc-bridge/helium-routes.ts` über installPcBridgeRoutes: GET /api/pc-bridge/browser, POST /api/pc-bridge/browser/commands,
  GET …/commands/:id. Besitzer aus der Sitzung, HMAC-SHA256 (Schlüssel aus DB-Passwort, beide Seiten identisch geprüft), Alter < 2 min, 40/min.
- Handy-UI: Einstellungen › „Mein Helium“ (`components/pc-bridge/mein-helium.tsx`), Link auch in Anbieter-CLIs › Dein PC.
- Profilmenü › Connect-Chrome (level-chrome-sidebar): vorher nur Connect-Chrome-Profil mit Chrome-Web-Store/Lab-URL geöffnet.
  Jetzt: POST /api/connect/browser-agents → Browser-Tab-Agenten an; ist kein Browser verbunden, startet Connect-Chrome
  (eigenes Connect-Profil) mit --load-extension=connect-sync. Agenten bekommen Tools browser_tabs/open/navigate/activate/reload/close.

## Realtime-Prüfung
Supabase Realtime vom PC wäre nur mit anon/authenticated-Key + RLS-Policies möglich; Connect-Logins sind better-auth (nicht
Supabase Auth), Policies könnten nicht an den Nutzer binden → Tabelle müsste geöffnet werden. LISTEN/NOTIFY geht über den
Transaction-Pooler (6543) nicht. Darum: 1-s-Polling (ein Index-Treffer). Gemessen 0,6–1,3 s PC-seitig.

## Tests (17.10. 11:39–11:41)
Test-Helium-Profil %TEMP%\cs-helium-test-profile mit --load-extension: Kopplung automatisch, Tab-Stand in Supabase,
signierte Befehle open/reload/activate/navigate/close je 0,6–1,3 s ok; gefälschte Signatur abgelehnt; javascript:-URL abgelehnt;
Neustart 3101 → Erweiterung verbindet sich selbst neu. Test-Instanz danach beendet.
Nicht getestet: Klick auf dem Handy mit Login, Connect-Chrome-Klick und Agent-Tool-Aufruf mit echtem Agenten (keine Sitzung ohne Stefans Login).

## Rückweg
Sicherungen `*.bak-helium-ext-20261017-*` (Repo + runtime + dist.bak-helium-ext-20261017-113718). Vorschau vorher: connect-dnvm7is1n.
