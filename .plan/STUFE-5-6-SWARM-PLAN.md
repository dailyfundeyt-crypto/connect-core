# Stufe 5 + 6 — Connect wird externer MCP-Server (Swarm-Inversion)

**Workspace:** `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium`
**Stack:** Bun + Vite + TanStack Router + React 19 + better-auth + Postgres
**Datum:** 2026-10-18
**Status:** 🚧 PLAN — Stufe 1.x + 2 abgeschlossen, Stufe 5 + 6 stehen aus.

---

## 1. Vision (User-Wortlaut, 2026-10-18 23:41 — invertierte Steuerung)

> **Perplexity steuert Connect hier nicht — umgekehrt.**
> Perplexity hat ein **eigenes Chat-Interface** und einen **eigenen MCP-Server**.
> Es **kennt** Connect, weil es als MCP-Client Connect als **MCP-Server**
> einbindet. So greift Perplexity aus seinem eigenen Interface auf alle
> Connect-Agenten zu.
>
> **Genauso für alle anderen PC-Apps:**
> - **Perplexity Computer** → Recherche, Crypto-Daten, **Finanzen leiten**
> - **Codex-App-Interface** → **E-Commerce** über Connect-MCP
> - **Claude-Interface** → **Video-Editing** über Connect-MCP
> - **Manus-Interface** → **Short-Form-Video + Recherche** über Connect-MCP
> - **Grok-Bot** → steuert die **anderen Agenten** (Antigravity, Freebuff,
>   Codex-CLI, Claude-CLI). Verantwortlich für **3 Unter-Kategorien**:
>   **E-Commerce**, **Finanzen/Trading**, **Social-Media**
>
> **Architektur-Inversion:** Statt Connect → Perplexity → Agents ist es
> **Externe PC-App → Connect-MCP → Connect-Agenten**. Perplexity steuert
> Connect nicht, sondern ruft Connect als **Werkzeug** auf.

### Konkret

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Perplexity     │    │  Grok-Bot        │    │  Codex-App      │
│  (Web-UI)       │    │  (Web-UI)        │    │  (Desktop)      │
└────────┬────────┘    └────────┬─────────┘    └────────┬────────┘
         │                      │                       │
         │ MCP-Client           │ MCP-Client            │ MCP-Client
         │ (extern)             │ (extern)              │ (extern)
         │                      │                       │
         ▼                      ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CONNECT (localhost:3101)                      │
│                                                                  │
│   /api/connect-mcp  ← EIN MCP-Server, alle Tools + Agenten       │
│                                                                  │
│   Tools:                                                         │
│   • list_agents()                       ← alle Agenten            │
│   • get_agent_profile(id)               ← 1 Agent lesen           │
│   • chat_with_agent(id, prompt)         ← Agent ansprechen        │
│   • search(query, mode)                 ← Perplexity-Suche        │
│   • run_swarm(task, max_agents)         ← Swarm-Orchestration     │
│   • list_browser_tabs(agentId)          ← Tabs sehen              │
│   • open_browser_tab(agentId, url)      ← Tab öffnen              │
│   • browser_action(agentId, action)     ← Klicken/Tippen/Screenshot│
│   • mini_app_launch(agentId, app, email)← App starten             │
│   • create_task(agentId, prompt)        ← CLI-Task                │
│   • read_spark_note(path)               ← Spark-MD lesen          │
│   • write_spark_note(path, content)     ← Spark-MD schreiben      │
│   • list_browser_links()                ← gespeicherte Links      │
│   • crypto_quote(symbol)                ← Crypto-Preise           │
│   • finance_summary()                   ← Finanz-Übersicht        │
│                                                                  │
│   Agenten: Antigravity, Codex, Claude, Manus, Freebuff,          │
│            Grok-Bot, Perplexity-Bot, Browser-Profile-Agenten,    │
│            Mini-Apps-Instanzen (Codex, Ottermind, Manus, …)      │
└──────────────────────────────────────────────────────────────────┘
         │                      │                       │
         ▼                      ▼                       ▼
   ┌──────────┐          ┌──────────┐            ┌──────────┐
   │ Connect- │          │ Connect- │            │ Connect- │
   │ Agent 1  │          │ Agent 2  │            │ Agent 3  │
   └──────────┘          └──────────┘            └──────────┘
```

**Was das bringt:**
- Perplexity recherchiert im eigenen Interface, ruft aber Connect-Agenten als Tools auf
- Grok-Bot hat 3 Sub-Bots (E-Commerce, Finanzen, Social) — jeder delegiert an Antigravity/Codex-CLI
- Codex-App bedient E-Commerce über Connect-MCP
- Manus bedient Short-Form-Video über Connect-MCP
- Claude bedient Video-Editing über Connect-MCP
- Eine **gemeinsame Connect-MCP-Schnittstelle** für alle = AGI durch Spezialisierung

---

## 2. Was bereits lebt (Status quo)

| Layer | Stand | Datei |
|-------|-------|-------|
| MCP-Router pro Agent | ✅ DONE | `apps/server/src/agent-hub/agent-mcp-routes.ts` |
| Per-Agent MCP-Tools (chat/steer/query/profile/list_browser_tabs) | ✅ DONE | `apps/server/src/agent-hub/mcp-tools.ts` |
| Per-Agent Browser-Tab (Helium-Profil) | ✅ DONE | Stufe 1.2 |
| CLI-Stream-Panel (Live/Final/Off) | ✅ DONE | Stufe 1.3 |
| Antigravity/Codex/Claude/Freebuff CLIs | ✅ LIVE | Stufe 2a/b/c + 4 |
| Manus-Engine | ✅ DONE | Stufe 3 |
| browser-use-Sidecar-Engine | ✅ DONE | Stufe 2.1 |
| App-Launcher Registry (12 Apps) | ✅ DONE | `apps/server/src/agent-hub/app-launcher.ts` |
| Agent-Workspace (3-Spalten) | ✅ DONE | `agent-workspace.tsx` |
| Agent-App-Instance-Panel | ✅ DONE | `agent-app-instance-panel.tsx` |
| **MCP-Server-Tabelle `connect_mcp_servers`** | ✅ DB + CRUD | `apps/server/src/agent-hub/db.ts` |
| **Cursor-MCP-Connector-Katalog (localStorage)** | ✅ Frontend | `apps/app/src/lib/mcp/local-servers.ts` |
| **Globaler Connect-MCP-Endpoint** | ❌ FEHLT | — |
| **Tool-Komposition (mehrere Agenten + Spark + Crypto)** | ❌ FEHLT | — |
| **Auth für externe MCP-Clients** | ❌ FEHLT | — |
| **Grok-Bot-Engine** | ❌ FEHLT | — |
| **Perplexity-Engine** | ❌ FEHLT | — |

Die `connect_mcp_servers`-Tabelle ist da, CRUD-Funktionen sind da, aber **kein HTTP-Endpoint** der `/api/connect-mcp` exposet. Genau die Lücke.

---

## 3. Architektur-Entscheidungen

### 3.1 Connect-MCP-Endpoint-Form

**JSON-RPC 2.0 over HTTP** (Standard für MCP) unter:

```
POST http://localhost:3101/api/connect-mcp/jsonrpc
GET  http://localhost:3101/api/connect-mcp/manifest   # Tool-Liste (für Clients ohne JSON-RPC)
GET  http://localhost:3101/api/connect-mcp/health     # Status
```

**Authentifizierung:** Bearer-Token im Header (`Authorization: Bearer <token>`). Token wird vom User in Settings generiert (60s Ablauf für Probe, oder dauerhaft mit expliziter `permanent`-Flag). Der gleiche Token authentifiziert sich gegen die `connect_mcp_servers`-Tabelle.

**Transport-Discovery:** Wir liefern das Tool-Manifest über GET, damit Clients wie Perplexity und Grok, die kein volles JSON-RPC-Stack mitbringen, trotzdem Tools anzeigen können.

### 3.2 Tool-Registry

Connect-MCP bietet **17+ Tools** an, gegliedert in 4 Bereiche:

**Agenten (6 Tools):**
- `list_agents()` — alle Agenten der Company
- `get_agent_profile(agentId)` — Profil + Engine + MCP-Subtools
- `chat_with_agent(agentId, prompt, attachments?)` — synchrone Antwort
- `query_agent(agentId, question)` — einmalige Frage
- `steer_agent(agentId, instruction)` — laufendes Gespräch umlenken
- `create_task(agentId, prompt, allow_write?)` — CLI-Run starten (Antigravity/Codex/Claude/Grok)

**Browser-Steuerung (4 Tools):**
- `list_browser_tabs(agentId?)` — alle Tabs
- `open_browser_tab(agentId, url, profile?)` — Tab mit Profil öffnen
- `browser_action(agentId, action)` — click/type/navigate/screenshot
- `close_browser_tab(agentId, tabId)` — Tab schließen

**App-Instanzen (3 Tools):**
- `list_mini_apps(agentId?)` — alle App-Instanzen
- `mini_app_launch(agentId, slot)` — Codex/Ottermind/Manus/GrokBot/Perplexity öffnen
- `mini_app_login(agentId, slot, email)` — Account wechseln

**Wissen (4 Tools):**
- `list_spark_notes(path?)` — Spark-MD-Dateien lesen
- `read_spark_note(path)` — eine Datei
- `write_spark_note(path, content)` — eine Datei schreiben
- `list_browser_links(folder?)` — gespeicherte Browser-Links

**Swarm (1 Tool):**
- `run_swarm(task, max_agents?, strategy?)` — Perplexity/Sonnet orchestriert N Agenten

**Markt-Daten (2 Tools):**
- `crypto_quote(symbol)` — aktueller Preis
- `finance_summary()` — Portfolio-Übersicht

**Total: 20 Tools** (alle starten ohne externe Calls — sie lesen aus DB / rufen lokale Module auf).

### 3.3 Die 3 Grok-Bots (User-Vorgabe)

Drei vordefinierte Grok-Bots, die in der Default-Company als Templates liegen:

| Bot ID | Verantwortung | Engine | Sub-Agents |
|--------|---------------|--------|------------|
| `grok-ecommerce` | E-Commerce (Stripe, Shop, Produkte) | grok | Antigravity, Codex-CLI, Freebuff |
| `grok-finance` | Finanzen/Trading (Crypto, Depot, Reports) | grok | Perplexity, Antigravity, Manus |
| `grok-social` | Social-Media (X, Telegram, Posts) | grok | Antigravity, Claude-CLI, Freebuff |

Diese 3 sind **Smart-Default-Agenten** — sie haben einen fixen System-Prompt,
eine Kategorie-Beschreibung und sind als Vorlage in `seed-agents.ts`
hinterlegt. Der User kann sie duplizieren, umbenennen, neue Sub-Agents
hinzufügen.

### 3.4 Kein DB-Migration nötig

`connect_mcp_servers` ist schon da, `agents.configuration.engine` ist `jsonb` —
wir schreiben die neuen Engine-Kinds einfach rein. Tool-Liste wird in einer
Konstante gepflegt (analog zu `agentMcpTools`).

---

## 4. Stufe 5 — Connect-MCP + Grok-Bots

### 4.1 Phase A — Globaler MCP-Router (1 Commit)

**`apps/server/src/connect-mcp/router.ts`** (NEU) — Hono-Router mit JSON-RPC-2.0:

```ts
/**
 * Connect-MCP — globaler MCP-Server, der alle Agenten + Features
 * als Tools nach außen exponiert. Externe Clients (Perplexity,
 * Grok-Bot, Codex-App, Manus, Claude) rufen diesen Endpoint auf.
 *
 * Auth: Bearer-Token (per-user, optional permanent).
 * Format: JSON-RPC 2.0 mit Methoden `tools/list` und `tools/call`.
 */

export function createConnectMcpRouter(deps: ConnectMcpDeps) { ... }
```

**`apps/server/src/connect-mcp/tool-registry.ts`** (NEU) — 20 Tools als
JSON-Schema + Handler, analog zu `agentMcpTools`:

```ts
export const connectMcpTools: McpToolDef[] = [
  { name: "list_agents", inputSchema: {...}, handler: ... },
  { name: "chat_with_agent", inputSchema: {...}, handler: ... },
  // ... 18 weitere
];
```

**`apps/server/src/connect-mcp/auth.ts`** (NEU) — Bearer-Token-Validation
gegen `connect_mcp_tokens`-Tabelle (müssen wir noch hinzufügen, oder wir
nutzen die User-Auth-Token direkt — TODO Phase A.1).

**`apps/server/src/app.ts`** — neue Routes einhängen:
```ts
app.use("/api/connect-mcp/*", createConnectMcpRouter(deps));
```

### 4.2 Phase B — Tool-Handler-Implementation (1-2 Commits, je 4-5 Tools)

**`apps/server/src/connect-mcp/handlers/agents.ts`** (NEU):
- `list_agents`, `get_agent_profile`, `chat_with_agent`, `query_agent`,
  `steer_agent`, `create_task`

**`apps/server/src/connect-mcp/handlers/browser.ts`** (NEU):
- `list_browser_tabs`, `open_browser_tab`, `browser_action`, `close_browser_tab`

**`apps/server/src/connect-mcp/handlers/mini-apps.ts`** (NEU):
- `list_mini_apps`, `mini_app_launch`, `mini_app_login`

**`apps/server/src/connect-mcp/handlers/knowledge.ts`** (NEU):
- `list_spark_notes`, `read_spark_note`, `write_spark_note`, `list_browser_links`

**`apps/server/src/connect-mcp/handlers/swarm.ts`** (NEU):
- `run_swarm` (siehe Stufe 6 Phase B)

**`apps/server/src/connect-mcp/handlers/market.ts`** (NEU):
- `crypto_quote`, `finance_summary` (Stub OK in Phase B — Datenquellen
  kommen in Stufe 6 Phase D)

### 4.3 Phase C — Grok-Bot-Engine (1 Commit)

**`apps/server/src/agent-hub/grok-runner.ts`** (NEU) — xAI-API-Wrapper
analog zu `antigravity-runner.ts`:

```ts
export async function invokeGrok(input: {
  agentId: string;
  prompt: string;
  systemPrompt?: string;
  model?: string;
}): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }>;
```

**`apps/server/src/agents/profile-types.ts`** — `AgentEngine`-Union
erweitern:

```ts
export type GrokEngine = {
  kind: "grok";
  model: string;          // "auto" | "grok-2-latest" | "grok-2-mini" | "grok-vision-beta"
  allowWrite: boolean;
  systemPrompt?: string;  // Default: "Du bist ein Grok-Bot..."
};
```

**`apps/app/src/components/agents/agent-engine-panel.tsx`** — Engine-Kind
`"grok"` rendern (Modell-Select, Allow-Write, System-Prompt).

### 4.4 Phase D — Die 3 Grok-Bots als Smart-Defaults (1 Commit)

**`apps/server/src/agents/seed-grok-bots.ts`** (NEU) — beim Server-Start
(seed wenn nicht vorhanden) drei Agents anlegen:

```ts
const GROK_BOTS = [
  { id: "grok-ecommerce", name: "Grok · E-Commerce", engine: { kind: "grok", model: "auto", systemPrompt: "Du bist Grok für E-Commerce. Du steuerst Antigravity, Codex-CLI und Freebuff, um Stripe/Shop-Operationen zu automatisieren." } },
  { id: "grok-finance", name: "Grok · Finanzen", engine: { kind: "grok", model: "auto", systemPrompt: "Du bist Grok für Finanzen/Trading. Du recherchierst mit Perplexity und orchestrierst Manus für Reports." } },
  { id: "grok-social", name: "Grok · Social-Media", engine: { kind: "grok", model: "auto", systemPrompt: "Du bist Grok für Social-Media. Du postest über Antigravity, generierst mit Claude-CLI, scrapest mit Freebuff." } },
];
```

### 4.5 Phase E — CLI-Stream-Panel + Engine-Panel Updates (1 Commit)

- `agent-cli-stream-panel.tsx`: `CliProvider` um `"grok"` erweitern
- `agent-engine-panel.tsx`: `"grok"` rendern mit Sub-Agent-Auswahl
- `agent-mcp-tools.tsx`: zeigt jetzt auch `grok_chat` als Sub-Tool

### 4.6 Phase F — UI für Connect-MCP-Tokens (1 Commit)

**`apps/app/src/routes/_authed/admin/connect-mcp.tsx`** (NEU) — Admin-Page
zum Verwalten der externen MCP-Tokens:

- "Token generieren" (60s Probe / Permanent mit Passwort-Bestätigung)
- Liste aktiver Tokens mit Last-Used-Timestamp
- "Token widerrufen"-Button
- **Verbindungs-Block** mit der JSON-RPC-URL und einem Curl-Beispiel,
  kopierbar — damit der User sie in Perplexity/Grok/Codex eintragen kann

### 4.7 Verifikation Stufe 5

1. `GET /api/connect-mcp/manifest` → 20 Tools gelistet
2. `POST /api/connect-mcp/jsonrpc` mit `{"method":"tools/list"}` → JSON-RPC-Antwort
3. Tool `list_agents` aufrufen → 3 Grok-Bots sichtbar
4. Tool `chat_with_agent(grok-ecommerce, "Hi")` → xAI antwortet (oder Stub)
5. UI: Settings → Connect-MCP zeigt Token + URL

---

## 5. Stufe 6 — Swarm + Mini-Apps + CLI-Sandbox + Web-UI

### 5.1 Phase A — `run_swarm` Tool (1 Commit, groß)

**`apps/server/src/connect-mcp/handlers/swarm.ts`** — der Kern:

```ts
/**
 * Swarm-Orchestrator: Perplexity oder Sonnet zerlegt einen Task in
 * Sub-Tasks, jedes Sub-Task wird an einen passenden Connect-Agent
 * geschickt, die Ergebnisse werden zur Antwort zusammengeführt.
 *
 * Flow:
 *  1. Wir lesen die Liste der erreichbaren Agenten (per-tool: list_agents).
 *  2. Wir rufen Perplexity/Sonnet mit (Task, Agent-Liste, Fähigkeiten) auf.
 *  3. LLM antwortet mit JSON: { plan: [{ agentId, tool, args, why }] }
 *  4. Wir führen alle Plan-Einträge parallel aus (max 8 gleichzeitig).
 *  5. Wir rufen LLM erneut mit allen Sub-Ergebnissen + "synthesize"-Prompt.
 *  6. Wir geben die finale Synthese + Plan + Results zurück.
 */
export async function runSwarm(input: {
  task: string;
  maxAgents?: number;
  strategy?: "fastest" | "cheapest" | "best-quality";
  actorId: string;
  deps: ConnectMcpDeps;
}): Promise<{ synthesis: string; plan: SwarmPlanEntry[]; results: SwarmResult[] }>;
```

**Strategy-Defaults**:
- `fastest` → Antigravity, Codex-CLI (parallel, nehme erste Antwort)
- `cheapest` → Lokales Hermes-Modell (Stufe 1.1+ Stub wenn nicht da)
- `best-quality` → Sonnet + Grok (zwei LLM-Aufrufe, kombiniert)

### 5.2 Phase B — Mini-Apps-Binding an Agent-Engine (1 Commit)

**`apps/server/src/agents/profile-types.ts`** — `AgentEngine` um
`app_instance` erweitern (existiert konzeptuell, fehlt im TypeScript-Type):

```ts
export type AppInstanceEngine = {
  kind: "app_instance";
  appId: AppId;          // "codex" | "ottermind" | "manus" | "grokbot" | "perplexity" | ...
  defaultSlot: number;
};
```

**`apps/app/src/components/agents/agent-workspace.tsx`** — neuer Pane
`"app"` der `AgentAppInstancePanel` groß rendert. Vorhandenes Panel wird
nur als Sidebar-Tab gezeigt, das war zu klein.

### 5.3 Phase C — CLI-Sandbox-Bridge (2 Commits)

**`apps/server/src/connect-mcp/cli-sandbox.ts`** (NEU) — Mini-Bun-Server
pro Agent-Run auf `localhost:18765 + hash%1000`:

```ts
/**
 * CLI-Sandbox: ein Mini-Bun-Server pro Agent-Run, der die CLI
 * (codex/claude/antigravity/freebuff/grok) als text/event-stream
 * exposed. Auth: 60s-Bearer-Token.
 *
 * Endpoints:
 *   GET  /          → Mini-Web-UI (Live-Stream in einem Browser-Tab-Look)
 *   POST /prompt    → startet einen neuen Run
 *   GET  /stream    → text/event-stream
 *   WS   /ws        → bidirektional
 */
```

**UI-Integration:** `agent-workspace.tsx` bekommt einen View-Mode-Toggle
`Chat | Web-UI | Off` für AI-Bots. Web-UI rendert ein iframe auf die
Sandbox-URL.

### 5.4 Phase D — Markt-Daten-Handler (1 Commit)

**`apps/server/src/connect-mcp/handlers/market.ts`**:
- `crypto_quote(symbol)` — ruft CoinGecko oder Kraken public API
- `finance_summary()` — Stub, der DB-Daten liest (Cash, Crypto-Werte,
  Stripe-Balance)

### 5.5 Phase E — Wissens-Tools (1 Commit)

**`apps/server/src/connect-mcp/handlers/knowledge.ts`**:
- `list_spark_notes(path?)` — liest aus `~/.connect/spark/` (analog zur
  Vault-Logik)
- `read_spark_note(path)`, `write_spark_note(path, content)`
- `list_browser_links(folder?)` — liest aus dem Browser-Links-Store

### 5.6 Verifikation Stufe 6

1. **Swarm-Test:** Task "Schreibe SWOT für Bäckerei-CMS" → 3 Agenten
   geplant → Synthese kommt zurück
2. **Mini-Apps-Test:** Agent `Codex-Account` mit Engine `app_instance`
   (appId=codex, slot=1) → Klick "App öffnen" → Codex-Desktop startet
   mit `codex3://start?email=...&slot=1`
3. **Sandbox-Test:** Antigravity-Agent läuft in Sandbox auf Port 18801
   → View-Mode-Toggle auf "Web-UI" → iframe mit Live-Stream
4. **Markt-Daten:** `crypto_quote("BTC")` → echter CoinGecko-Preis
5. **Wissens-Tools:** `list_spark_notes()` → Liste der MD-Dateien

---

## 6. Reihenfolge der Commits (Final)

| # | Inhalt | Größe |
|---|--------|-------|
| 1 | Stufe 5 A: `connect-mcp/router.ts` + JSON-RPC + Auth + Tool-Registry-Skelett | mittel |
| 2 | Stufe 5 B1: Handlers `agents.ts` (6 Tools) | mittel |
| 3 | Stufe 5 B2: Handlers `browser.ts` + `mini-apps.ts` (7 Tools) | mittel |
| 4 | Stufe 5 B3: Handlers `knowledge.ts` (4 Tools, Stubs OK) | klein |
| 5 | Stufe 5 C: `grok-runner.ts` + Grok-Engine-Type + Engine-Panel | klein |
| 6 | Stufe 5 D: 3 Grok-Bot-Smart-Defaults | klein |
| 7 | Stufe 5 E: CLI-Stream-Panel + MCP-Tools-UI Grok-Update | klein |
| 8 | Stufe 5 F: Admin-Page Connect-MCP-Tokens | mittel |
| 9 | Stufe 6 A: `run_swarm` Orchestrator (Perplexity/Sonnet) | groß |
| 10 | Stufe 6 B: Mini-Apps-Engine + Workspace-Pane `"app"` | mittel |
| 11 | Stufe 6 C1: `cli-sandbox.ts` Mini-HTTP-Server | groß |
| 12 | Stufe 6 C2: Web-UI-Pane im Workspace + View-Mode-Toggle | mittel |
| 13 | Stufe 6 D: Markt-Daten-Handler (CoinGecko, Finance-Stub) | klein |
| 14 | Stufe 6 E: Wissens-Tools (Spark + Browser-Links) | mittel |

Jeder Commit = eigener Build, eigener Sync, eigener Browser-Test.

---

## 7. Was wir **nicht** machen

- **Perplexity-Seite implementieren** — wir liefern die Connect-Seite des
  Connect-MCP. Perplexity selbst ist extern und muss vom User als
  MCP-Client konfiguriert werden (manuell, mit unserer URL + Token).
- **Echte AGI** — wir liefern die Bausteine.
- **1000-Agenten-Stresstest** — Swarm läuft mit max 8 parallel, mehr geht
  konzeptuell, ist aber UI-Engpass.
- **Auto-Spawn von Sub-Agents** — Agent-Liste kommt aus DB.
- **Token-Verschlüsselung** — wir nutzen den existierenden
  `credentials`-Vault (AES-256-GCM, schon da) für die MCP-Tokens.

---

## 8. Verifikations-Plan (am Ende testet der User)

### Stufe 5
1. `/api/connect-mcp/manifest` → 20 Tools
2. `POST /api/connect-mcp/jsonrpc` mit Token → JSON-RPC-Antwort
3. UI: 3 Grok-Bots in `/agents` (E-Commerce, Finanzen, Social)
4. Tool `chat_with_agent(grok-ecommerce, "Hi")` → xAI antwortet

### Stufe 6
5. Tool `run_swarm("SWOT für Bäckerei-CMS", maxAgents=3)` → 3 Agenten geplant + Synthese
6. Mini-App-Agent `Codex-Account` → Klick "App öffnen" → Codex-Desktop startet
7. CLI-Sandbox: Antigravity-Agent → View-Mode "Web-UI" → iframe Live-Stream
8. Tool `crypto_quote("BTC")` → echter CoinGecko-Preis
9. Tool `list_spark_notes()` → Liste der MD-Dateien

### Externe Clients (vom User manuell einzurichten)
- **Perplexity** → MCP-Client auf `http://localhost:3101/api/connect-mcp/jsonrpc`
- **Grok-Bot** im Browser → ruft Connect-MCP auf
- **Codex-App** → `codex3://mcp?url=...&token=...`
- **Manus** → `manus://mcp?url=...&token=...`
- **Claude-App** → `claude://mcp?url=...&token=...`

---

## 9. Tipps für die nächste Session

- **Stub-First**: Wie bei `run-turn-helper.ts` — jeder Handler liefert im
  Fehlerfall (kein Key, kein Sandbox-Port frei) eine ehrliche Stub-Antwort.
- **Auth-Strategy**: Wir nutzen `better-auth`-Session-Cookies für Browser-
  Clients, Bearer-Tokens für externe MCP-Clients. Beide validieren gegen
  die gleiche User-Identität.
- **Port-Range für Sandbox**: 18765-19764 (1000 Ports). `hash(agentId) % 1000`.
  Kollisionen mit anderen Apps prüfen (`netstat -ano | Select-String "187"`).
- **Swarm-Strategie**: Default `best-quality` (Sonnet + Grok). User kann
  pro Aufruf überschreiben.
- **Spark-Notes-Pfad**: `~/.connect/spark/` (Windows: `%LOCALAPPDATA%/Connect/spark/`).
  Existiert schon als Vault-Verzeichnis.
- **Browser-Links**: aus `agents_browser_links`-Tabelle (müssen wir prüfen,
  ob die schon existiert) oder aus `agents_saved_links`.
- **Engine-Engine-Typen-Erweiterung**: bei `AgentEngine` UND bei
  `agent-engine-panel.tsx` gleichzeitig. TypeScript fängt Drift, aber
  nicht den fehlenden Render-Path.

---

**Bereit zum Start mit Commit 1: Globaler Connect-MCP-Router.**
