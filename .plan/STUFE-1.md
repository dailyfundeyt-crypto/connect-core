# Stufe 1 — Per-Agent MCP-Server

**Abgeschlossen am:** 2026-10-18
**Build:** ✅ OK (`bun run build`, ~35s)
**Sync:** ✅ OK

## Was gebaut wurde

Jeder Agent wird sein eigener MCP-Server. Andere Agents / Tools rufen ihn
über HTTP auf, ohne ein SDK oder ein spezielles Protokoll.

### Server (apps/server/src/agent-hub/)

- **`agent-mcp-routes.ts`** (NEU) — Hono-Router für `/api/agent-mcp/*`
  - `GET  /api/agent-mcp/:agentId/tools`     — Tool-Liste
  - `POST /api/agent-mcp/:agentId/tools/:name` — einzelnes Tool aufrufen
  - `GET  /api/agent-mcp/:agentId/profile`   — Kurzprofil
  - Loopback-only wie `/api/agent-hub/*`
- **`mcp-tools.ts`** (NEU) — Tool-Definitionen (JSON-Schema, Handler)
  - `chat(prompt, attachments?)` — Nachricht an Agent, synchrone Antwort
  - `steer(instruction)` — Notiz für nächsten Turn (Stufe 1: Stub)
  - `query(question)` — einmalige Frage, keine History
  - `profile()` — Eigenes Profil lesen
  - `list_browser_tabs()` — Browser-Tabs (Stufe 1.2: kommt mit echtem Browser)
- **`agent-mcp-deps.ts`** (NEU) — Dependency-Injection für die Tool-Handler
  - `chat` / `query`: rufen `runTurn()` (Stub in Stufe 1)
  - `steer`: schreibt in `STEER_NOTES`-Map
  - `list_browser_tabs`: liest `agent_browser_tabs`-Tabelle (leer bis 1.2)

### DB-Schema (apps/server/src/db/schema/core.ts)

- **`agent_browser_tabs`** (NEU) — Browser-Tabs pro Agent
  - `tab_id` (PK), `agent_id` (FK→agents), `url`, `title`, `profile_dir`,
    `opened_at`, `closed_at`
  - Index auf `agent_id`

### Server-Hook (apps/server/src/app.ts)

- Import: `buildAgentMcpDeps` + `createAgentMcpRoutes`
- Mount: `/api/agent-mcp` nur wenn `agentProfileStore` da ist
- In `agent-hub`-Block integriert, nicht daneben

### Run-Turn-Helper (apps/server/src/routines/run-turn-helper.ts)

- **`runTurn()`** (NEU) — Stub-Wrapper, der heute eine ehrliche Stub-Antwort
  liefert. Stufe 1.1+ ersetzt den Stub durch den echten
  `createTurnRunner`-Pfad aus `run-turn.ts` (CopilotKit Intelligence).

### Frontend (apps/app/src/)

- **`lib/agents/agent-mcp-client.ts`** (NEU) — typed Client
  - `listAgentMcpTools(agentId)`, `getAgentMcpProfile(agentId)`,
    `callAgentMcpTool(agentId, toolName, args)`
- **`components/agents/agent-mcp-tools.tsx`** (NEU) — UI-Komponente
  - Tool-Liste mit "Test"-Button pro Tool
  - Endpoint-Anzeige + Copy-Button
  - Eingebaut in `agent-profile.tsx` (erscheint im Agent-Detail-Panel)
- **`components/agents/agent-profile.tsx`** (EDIT) — neue Sektion
  "MCP-Tools (Stufe 1)" zwischen "Role" und "Gespräch öffnen"

## Was Stufe 1.1+ braucht (offene Punkte)

1. **Echter Run-Turn** — `run-turn-helper.ts` ist ein Stub. Stufe 1.1+ baut
   den echten `createTurnRunner`-Aufruf ein, der einen CopilotKit-Turn mit
   dem Agenten ausführt und die Antwort zurückgibt. Vorlage:
   `routines/run-turn.ts` → `createTurnRunner`.

2. **DB-Migration** — die neue Tabelle `agent_browser_tabs` muss in
   `apps/server/src/db/schema/index.ts` (oder wo die Schemas registriert
   werden) exportiert und im Migrations-Run erzeugt werden. Stufe 1 hat den
   Drizzle-Table definiert, aber die Migration selbst nicht laufen lassen.

3. **Browser-Tab-Lifecycle** — Stufe 1.2 fügt:
   - `POST /api/agent-mcp/:id/browser/open` — Tab öffnen
   - `POST /api/agent-mcp/:id/browser/close` — Tab schließen
   - `POST /api/agent-mcp/:id/browser/action` — click/type/navigate
   - `GET  /api/agent-mcp/:id/browser/screenshot` — Live-Bild
   - Profile-Storage in `%LOCALAPPDATA%/ConnectAgents/browser-profiles/<agentId>/`
   - Auf der UI: neuer Tab "Browser" im `ComputerViewPanel`

4. **Tests** — kein Test geschrieben. Stufe 1.5 fügt `bun test` für
   `agent-mcp-routes` und `mcp-tools` hinzu.

## Verifikation (was der User tun sollte)

1. Server läuft mit `bun run dev` (oder so wie vorher).
2. Browser auf `http://localhost:3101/agent/<agentId>` (Agent-Detail-Panel)
3. Unten im Panel ist jetzt die Sektion "MCP-Tools (Stufe 1)" mit
   - Endpoint-Anzeige + Copy-Button
   - 5 Tool-Karten (chat, steer, query, profile, list_browser_tabs)
4. Klick "Test" auf `profile` → zeigt den Agent-Namen, Titel, Modell.
5. Klick "Test" auf `chat` → Stub-Antwort "[MCP-Stub für …]" (ehrlich).

## Tipps für die nächste Session

- **NICHT die Tool-Liste anpassen** wenn du ein neues Tool willst — füge
  einen Eintrag in `agentMcpTools` (in `mcp-tools.ts`) hinzu. Der Router
  pickt es automatisch auf.
- **Stub ersetzen** ist eine Code-Zeile in `run-turn-helper.ts:runTurn()`.
  Such nach `MCP-Stub`, dann ersetze den Block bis `return [...]` durch
  `return createTurnRunner(...).runTurn(...)`.
- **Loopback-Bar** ist absichtlich: ein Browser kann die Tools auch
  aufrufen, aber nicht aus dem Internet. Das ist die gleiche Schicht wie
  `/api/agent-hub`.
- **Browser-Profile-Storage**: das Verzeichnis existiert noch nicht
  physisch. Stufe 1.2 erstellt es beim ersten `browser/open`-Call.

## Datei-Inventar

**Server, neu:**
- `apps/server/src/agent-hub/agent-mcp-routes.ts`
- `apps/server/src/agent-hub/agent-mcp-deps.ts`
- `apps/server/src/agent-hub/mcp-tools.ts`
- `apps/server/src/routines/run-turn-helper.ts`

**Server, geändert:**
- `apps/server/src/app.ts` (Mount + 2 Imports)
- `apps/server/src/db/schema/core.ts` (`agent_browser_tabs` Tabelle)

**Frontend, neu:**
- `apps/app/src/lib/agents/agent-mcp-client.ts`
- `apps/app/src/components/agents/agent-mcp-tools.tsx`

**Frontend, geändert:**
- `apps/app/src/components/agents/agent-profile.tsx` (1 Sektion + 1 Import)

**Dokumentation:**
- `.plan/MASTER-PLAN.md` (6 Stufen Übersicht)
- `.plan/STUFE-1.md` (dieses Dokument)

---

## Production-Verify (2026-10-18, 19:22)

**Status:** ✅ KOMPLETT im Production-Build verifiziert.

- Server: `http://localhost:3101` (über `Connect.exe` aus `apps/connect-app/runtime/connect/`)
- DB: Postgres 5544, Tabelle `agent_browser_tabs` angelegt
- Profile: `%LOCALAPPDATA%/ConnectAgents/browser-profiles/<agentId>/`
- Auth: `GET /api/agent-mcp/:id/tools` → 401 ohne Cookie (korrekt)

### Was im UI sichtbar ist (http://localhost:3101/agent/agent_3c182f97-…?settings=true)

**MCP-Tools (Stufe 1)** Section mit **6 Tools + Test-Buttons**:
1. `chat` — Nachricht an Agenten
2. `steer` — laufende Konversation umlenken
3. `query` — einmalige Frage
4. `profile` — Profil lesen
5. `list_browser_tabs` — offene Tabs listen
6. `antigravity_run` — Antigravity-CLI Sub-Runner (Stufe 2 Hook, schon da!)

**Browser-Tab (Stufe 1.2)** Section:
- Offener Tab mit URL/Title + Profil-Pfad
- Status-Loader
- "Remote-Browser (Vorschau)" Section mit Tab-Liste + Open-Button

### Production-Sync
- Code: `apps/server/src/agent-hub/{agent-mcp-routes,mcp-tools,agent-browser,agent-mcp-deps}.ts`
- Code: `apps/server/src/routines/run-turn-helper.ts`
- Migration: `apps/server/drizzle/0044_agent_browser_tabs.sql`
- Eingebunden in: `apps/connect-app/runtime/connect/apps/server/src/app.ts`
- Frontend-Build: `apps/app/dist` → `apps/connect-app/runtime/connect/apps/app/dist`
