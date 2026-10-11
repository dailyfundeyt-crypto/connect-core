# Handy-Brücke (Vercel → PC → CLIs) – Stand 06.10.2026

## Ausgangslage (vor heute)
- Es gab keinen Weg vom Handy (connect-kunc-preview.vercel.app) zum PC: kein Relay, kein Tunnel.
- Das Vercel-Bundle hatte kein agent-hub und keinen codex-cli/claude-cli/grok-bot. Agent-hub-Routen sind `localOnly` (nur Loopback).
- Folge: Online liefen alle Agenten auf dem Standardmodell, CLI-Anbieter waren dort nicht nutzbar.
- Lokale DB (Postgres 5544) und Supabase sind getrennt. Die 53 lokal importierten Grok Bots gibt es online nicht als Agenten.

## Optionen
| Option | Sicherheit | Aufwand | Echte Fremdnutzer | Bewertung |
|---|---|---|---|---|
| (a) Relay über Supabase-Warteschlange | Nur ausgehende Verbindung vom PC, kein Port, Login = Connect-Login | mittel (gebaut) | ja, über die normale Vorschau-URL | **gewählt** |
| (b) Cloudflare Tunnel + Access (Google) | PC wird öffentlich erreichbar (hinter Access); zweiter Login, Fehlkonfiguration = offener PC | mittel + Cloudflare-Konto/Domain | ja, aber die ganze lokale App hängt am Netz | Alternative, wenn das Handy die *ganze* lokale App sehen soll |
| (c) Tailscale | sehr sicher (privates Netz) | gering | nein, jedes Gerät braucht Tailscale | nur für Stefans eigene Geräte |

Empfehlung (a): Stefan will alles verbunden mit echten Nutzern. (a) nutzt vorhandenen Login, Datenbank und Vorschau, öffnet keinen Port am PC und bleibt ohne Tunnel-Infrastruktur.

## Architektur (gebaut)
- Supabase (connect-core) hat drei additive Tabellen, alle mit RLS an und Besitzer connect_app:
  - `connect_pc_workers` (Heartbeat, Anbieter-Status, Grok-Bot-Liste),
  - `connect_pc_jobs` (Aufträge),
  - `connect_pc_agent_links` (Agent → Anbieter/Modell).
- Vercel-Server (`api/index.js` gepatcht, Modul `pc-bridge`):
  - `GET /api/pc-bridge/status`: PC online/offline, Anbieter, Grok Bots.
  - `GET /api/pc-bridge/grok-bots`
  - `GET|PUT|DELETE /api/pc-bridge/agents/:id`: nur eigene Agenten, Anbieter `codex-cli|claude-cli|grok-bot`.
  - buildAgent: Hat ein Agent einen Link und gehört er dem Nutzer, geht der Chat-Turn als Auftrag in die Warteschlange. Die Antwort wird gestreamt (Polling 0,7 s). Ist der PC offline, kommt ein klarer Hinweis statt eines Fehlers.
- PC-Worker in der Connect App (3101, `apps/server/src/pc-bridge/worker.ts`):
  - liest `%LOCALAPPDATA%\ConnectApp\data\pc-bridge.env` und verbindet sich ausgehend mit dem Supabase-Pooler 6543 (TLS),
  - Heartbeat 20 s, holt Aufträge mit SKIP LOCKED, max. 2 parallel,
  - Codex/Claude laufen über die vorhandene CLI-Ausführung, Grok Bots über `gbot send` + `gbot thread` (fertig nach 35 s Ruhe, max. 270 s),
  - bricht ab, wenn der Auftrag vom Handy abgebrochen wird. Aufträge älter als 3 Tage werden gelöscht.
- UI:
  - Handy, Agent › Einstellungen › Modell: Karte „Antwort über deinen PC“ (Anbieter, Modell, Grok-Bot-Auswahl).
  - Handy, Einstellungen › Anbieter-CLIs: PC-Status und Grok Bots per Häkchen als eigene Agenten anlegen.
  - Lokal (3101): Status der Handy-Brücke oben in Anbieter-CLIs.

## Tests
- Box: Vercel-Bundle mit Postgres 17 erfolgreich getestet (unauth 401, fremder PUT 403, falscher Anbieter 400, offline-Hinweis, online-Antwort gestreamt, fremder Nutzer abgelehnt).
- PC: Supabase-Queue → Worker → echter Codex → `CONNECT_BRIDGE_OK` (5,9 s).
- Live (06.10. 07:10): Auftrag in Supabase → Worker der von Connect.exe gestarteten App → Codex → `CONNECT_LIVE_OK` (5,8 s).
- Vorschau: `/api/health` 200, `/api/pc-bridge/status` 401 ohne Login, `/` 200.
- Offen: Klick-Test auf dem Handy mit Stefans Login. Ein echter Grok-Bot-Versand wurde nicht ausgelöst, um Nebenwirkungen im Grok-Account zu vermeiden.

## Grenzen / Nächste Schritte
- Eine Antwort darf max. ca. 5 min dauern (Vercel maxDuration 300). Das Grok-Ende wird per Ruhe-Heuristik erkannt.
- PC-Agenten haben keine Connect-Tools (nur Text rein/raus).
- Claude CLI am PC ist nicht angemeldet → `claude auth login`.
- Später: eigene DB-Rolle mit minimalen Rechten für den Worker (heute nutzt er connect_app). Google/Veo und freebuff als weitere Anbieter (gleiches Muster: Anbieter-Typ + Worker-Runner).
- Rückweg Vorschau: `vercel alias set connect-gkgkl9e01-stefans-projects-e40bb777.vercel.app connect-kunc-preview.vercel.app`.
- Rückweg lokal: Sicherungen `*.bak-helium-bridge-20261006-*` (Server-Dateien, UI-Dateien, `runtime\...\dist.bak-helium-bridge-20261006-070035`). Brücke abschalten: `pc-bridge.env` umbenennen und die Connect App neu starten.
