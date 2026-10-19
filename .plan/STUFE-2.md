# Stufe 2 — Generalisiertes Agenten-Konzept: AI-Bot · App-Instanz · Browser-Profil

**Status:** 🚧 IN ARBEIT — Plan abgestimmt mit dem User (2026-10-18 21:34)

## Vision

Heute ist ein Connect-Agent immer ein **KI-Bot** (Codex/Claude/Antigravity CLI).
Der User will, dass ein Agent auch eine **Verbindung zu einer App-Instanz**
oder ein **Browser-Profil** sein kann. Konkret:

1. **AI-Bot** wie bisher — CLI-Backend (Codex, Claude, Antigravity, …)
2. **App-Instanz** — startet eine externe App (Codex Desktop, Ottermind, Manus,
   Figma, Cursor, Perplexity, …) mit einer **bestimmten E-Mail/Profil** als
   registrierte Instanz. Statt „Modell" und „System-Prompt" werden hier
   **App-ID + Instanz-Name/E-Mail** gespeichert.
3. **Browser-Profil** — startet ein Helium-Profil mit dem Agent-Namen als
   Profil-Label und einer konfigurierbaren Start-URL. Der User klickt den
   Agenten an, der Browser öffnet sich, der User gibt direkt einen Auftrag.

Allen drei Typen gemeinsam:
- **Name**, **Titel**, **Rolle** (roleDescription) — wie heute
- **Avatar-Seed** — wie heute
- **Visibility** (private/public) — wie heute
- **Auftrag senden** — der Prompt wird rechts vom Chat als Kopier-Bereich
  angezeigt (für externe Apps) ODER links über die CLI-Web-UI (für AI-Bots)

## Datenmodell-Erweiterung

Neue Engine-Typen als enum-Erweiterung in `agent_type`:

```sql
ALTER TYPE agent_type ADD VALUE 'app_instance';   -- Codex Desktop, Ottermind, Manus, ...
ALTER TYPE agent_type ADD VALUE 'browser_profile'; -- Helium-Profil mit Start-URL
```

Die `configuration` (jsonb) bekommt pro Engine-Typ eigene Felder:

| Engine         | configuration-Felder                                                                 |
|----------------|--------------------------------------------------------------------------------------|
| `built_in`     | `{ systemPrompt: string }` (unverändert)                                             |
| `remote_ag_ui` | `{ endpoint: string, auth?: … }` (unverändert)                                       |
| `remote_mastra`| `{ endpoint, remoteAgentId }` (unverändert)                                          |
| `app_instance` | `{ appId: "codex" \| "ottermind" \| "manus" \| "figma" \| "cursor" \| "perplexity" \| ..., instance: { name: string, email?: string, slot: number, enabled: boolean } }` |
| `browser_profile` | `{ startUrl: string, profileLabel: string, allowWrite: boolean }`                |

## UI-Konzept

Drei-Spalten-Layout im Agent-Panel:

```
┌─────────────┬─────────────────────────┬──────────────────────┐
│ TOOLS       │  AKTIVE ANSICHT         │  AUFTRAG / PROMPT    │
│             │                         │                      │
│ • Profil    │  • AI-Bot:              │  Hier ist dein       │
│ • Browser   │    CLI-Stream-Panel     │  Auftrag, den du     │
│ • CLI-Live  │    (Stufe 1.3)          │  dem Agent gibst.    │
│ • MCP-Tools │                         │                      │
│ • Snippets  │  • App-Instanz:         │  [Kopieren-Button]   │
│ • Wissen    │    - App-Knopf (startet │  [Senden-Button]     │
│             │      extern)            │                      │
│             │    - "Login-Status:     │  History der letzten │
│             │      email@example.com" │  Aufträge (optional) │
│             │  • Browser-Profil:      │                      │
│             │    - Helium-Frame       │                      │
│             │      (URL = startUrl)   │                      │
│             │    - URL-Bar zum ändern │                      │
└─────────────┴─────────────────────────┴──────────────────────┘
```

Bei **AI-Bots** kann der User zwischen **Web-Interface-Modus** (CLI läuft
in Sandbox auf `http://localhost:<port>`, eingebettet im in-app-Browser)
und **Chat-Modus** (wie bisher) umschalten. **Standard ist „ausgeblendet"**
(Browser-Engine versteckt), auf Wunsch sichtbar.

## CLI-Sandboxing (localhost-only)

`textcortex/claude-code-sandbox` (https://github.com/textcortex/claude-code-sandbox)
erlaubt es, Claude/Codex-CLI-Prozesse in einem Docker-Container zu starten
und über einen lokalen Port exposed. Wir machen das ohne Docker (Windows-
kompatibel): wir spawnen die CLI direkt, lesen den Prompt aus stdin, und
exponen den **gleichen** Browser-Frame (Helium) als Web-UI — die CLI selbst
läuft headless, das Helium-Profil ist die UI.

Konkret für Stufe 2:
- **Codex-CLI**: `codex exec --json` (schon da) — wir exposen das Output nicht
  als Web-UI, sondern **füttern** den Browser-Tab mit dem Prompt
- **Claude-CLI**: `claude -p --output-format stream-json` (schon da) — gleich
- **Antigravity-CLI**: `agy --output-format stream-json -p "<prompt>"` (schon da)

Wir brauchen das textcortex-Sandbox-Pattern **nicht** (es ist Docker-only).
Stattdessen reicht es, **dasselbe Helium-Profil** zu nutzen, das der Agent
schon hat — der User tippt in sein Helium-Fenster, wir hören die Browser-
Aktionen via CDP ab.

## Schritt-für-Schritt-Plan

### Phase A — Datenmodell (1 Commit)

1. **DB-Migration `0045_engine_types.sql`**:
   - `ALTER TYPE agent_type ADD VALUE 'app_instance'`
   - `ALTER TYPE agent_type ADD VALUE 'browser_profile'`
   - Neue Tabelle `agent_app_instances` (id, agent_id, app_id, slot, name, email, enabled, created_at)
     — hängt am `agents` 1:n, damit ein AI-Bot/App/Profile mehrere Slots haben kann
2. **Schema-Update `core.ts`**: `agentType` enum erweitern
3. **TypeScript-Typen** in `profile-types.ts` um `AppInstance`, `BrowserProfileConfig` erweitern
4. **`profile-store.ts`**: `runForDuplicate` und `create` um die zwei neuen Typen erweitern
5. **`profile-types.ts`**: `AgentProfile` um `engineType` und `engineConfig` erweitern

### Phase B — App-Engine (1 Commit)

6. **Modul `app-launcher.ts`**: registriert verfügbare Apps (Codex Desktop, Ottermind,
   Manus, Figma, Cursor, Perplexity) mit:
   - `appId`, `displayName`, `icon`, `launchCommand` (z.B. `codex://launch?email=…`)
   - `loginUrl` (für „Account hinzufügen")
   - `defaultSlots` (z.B. 3)
7. **REST-Routen**:
   - `GET  /api/agent-mcp/:agentId/app-instances` — listet alle Instanzen
   - `POST /api/agent-mcp/:agentId/app-instances` — neue Instanz anlegen
   - `PATCH /api/agent-mcp/:agentId/app-instances/:slot` — Name/E-Mail/Enabled
   - `DELETE /api/agent-mcp/:agentId/app-instances/:slot` — entfernen
   - `POST /api/agent-mcp/:agentId/app-instances/:slot/launch` — externer App-Launch
8. **`AgentMcpContext.deps.invokeAppInstance`**: Wrapper analog zu `invokeAntigravity`

### Phase C — Browser-Profile-Engine (1 Commit)

9. **Helium-Profile-Lifecycle**: schon da (Stufe 1.2). Wir fügen nur
   `startUrl` und `profileLabel` als Helium-Args hinzu
10. **`AgentBrowserPanel`** zeigt jetzt **eigene Browser-Panels für jeden
    Agent-Typ**:
    - `app_instance`: zeigt App-Logo + E-Mail-Status + „App öffnen"-Button
    - `browser_profile`: zeigt Helium-Frame + URL-Bar
11. **`GET /api/agent-mcp/:agentId/browser-profile`** liefert die Config

### Phase D — Frontend-Drei-Spalten-Layout (1-2 Commits)

12. **Neue Komponente `<AgentWorkspace>`** ersetzt das aktuelle
    `<AgentProfile>`-Layout. Drei Spalten: Tools | Active | Prompt-Copy
13. **`<AgentPromptPanel>`**: rechts, mit Copy-Button + History
14. **`<AgentToolSidebar>`**: links, mit Tabs für Profil/Browser/CLI/MCP-Tools/Snippets/Wissen
15. **View-Mode-Toggle** im AI-Bot-Panel: `Chat` (default) | `Web-UI` (Helium mit
    der CLI-Web-UI) | `Off` (versteckt)

### Phase E — Sandbox-Pattern (optional, später)

16. **Wenn textcortex-Pattern gebraucht wird**: wir wrappen die CLIs in eine
    HTTP-Bridge (kleines Bun-Script), die `/prompt?text=…` anbietet und die
    CLI streamt. Aber das ist nicht zwingend — die Helium-Lösung deckt 90% ab.

## Reihenfolge

1. Phase A (DB + Schema) → Commit 1
2. Phase B (App-Engine Backend) → Commit 2
3. Phase C (Browser-Profile-Engine) → Commit 3
4. Phase D (Frontend-3-Spalten) → Commits 4-5
5. Phase E (Sandbox) — später, falls gebraucht

## Geänderte/neue Dateien (geplant)

- `apps/server/src/db/migrations/0045_engine_types.sql` — **neu**
- `apps/server/src/db/schema/core.ts` — enum erweitern
- `apps/server/src/db/schema/coworker.ts` — `agentAppInstances` Tabelle
- `apps/server/src/agents/profile-types.ts` — neue Felder
- `apps/server/src/agents/profile-store.ts` — Engine-Logik
- `apps/server/src/agent-hub/app-launcher.ts` — **neu**
- `apps/server/src/agent-hub/agent-mcp-routes.ts` — neue Routen
- `apps/app/src/components/agents/agent-workspace.tsx` — **neu** (3 Spalten)
- `apps/app/src/components/agents/agent-prompt-panel.tsx` — **neu**
- `apps/app/src/components/agents/agent-tool-sidebar.tsx` — **neu**
- `apps/app/src/components/agents/agent-profile.tsx` — umbauen

## Was bleibt aus Stufe 1.x

- Stufe 1.1: Echter Turn-Runner statt Stub
- Stufe 1.3.1: Tool-Call-Klick → Browser-Tab öffnen

Diese sind nicht blockiert von Stufe 2 — wir machen sie danach.
