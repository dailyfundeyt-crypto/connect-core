# Master-Plan: browser-use, MCP-pro-Agent, Manus, Grok, Perplexity, Claude-CLI, Freebuf

**Workspace:** `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium` (Connect-App, OpenBot-v2-Helium)
**Stack:** Bun + Vite + TanStack Router + React 19 + better-auth + Postgres
**Datum:** 2026-10-18

---

## Vision (User-Wortlaut, sinngemäß)

1. **Jeder Bot wird sein eigener MCP-Server.** Andere Agents/Tools rufen den Bot per MCP auf (chat, steer, query, profile, was auch immer passt).
2. **Codex-CLIs bekommen browser-use mit** (https://github.com/browser-use/browser-use.git) — die CLIs sollen Browser-Steuerung übernehmen.
3. **Jeder Agent hat einen eigenen Browser-Tab** mit persistiertem Profil (alle Logins, Cookies, localStorage, History).
4. **Manus-API** bekommt eine eingebaute Browser-Extension (Manus hat das schon eingebaut, einfach einbinden).
5. **Claude-CLIs** bekommen Browser-Steuerung (Codex-CLI + browser-use).
6. **Antigravity-CLIs (`agy`)** bekommen Browser-Use — Antigravity hat ein **eingebautes** Browser-Tool, also reicht es, den Provider wie Codex/Claude anzubinden.
7. **Perplexity** kann Agenten steuern (Recherche-Tool pro Agent).
8. **Freebuf** braucht GitHub-Steuerung (Repo-Navigation, PR-Erstellung, Code-Lesen).
9. **Grok-Bots** bekommen einen neuen Browser-Tab, sind aber im Browser gebaut — wir geben ihnen einen klaren Prompt.

---

## 6 Stufen — jede Stufe = eine neue Session

Jede Stufe endet mit:
- Build OK (`bun run build` exits 0)
- Sync nach `apps/connect-app/runtime/connect/apps/app/dist/`
- Screenshot/Verifikation im Browser
- Eintrag in `.plan/STUFE-N.md` (was gebaut wurde, was zu testen ist, was die nächste Session als Input braucht)

| Stufe | Inhalt | Aufwand | Output-Datei |
|-------|--------|---------|--------------|
| 1 | MCP-Server pro Agent + Per-Agent Browser-Tab/Profil | groß | `.plan/STUFE-1.md` |
| 2a | **Antigravity-CLI (`agy`) als 3. Provider mit eingebautem Browser-Use** — Google-OAuth, Gemini-3.x | klein | `.plan/STUFE-2a.md` |
| 2 | Codex-CLI + browser-use | mittel | `.plan/STUFE-2.md` |
| 3 | Manus-API + Claude-CLI Browser-Steuerung | mittel | `.plan/STUFE-3.md` |
| 4 | Freebuf GitHub-Steuerung | mittel | `.plan/STUFE-4.md` |
| 5 | Grok-Bots (Prompt-only) | klein | `.plan/STUFE-5.md` |
| 6 | Perplexity-Anbindung an Agenten | mittel | `.plan/STUFE-6.md` |

---

## STUFE 1 — MCP-Server pro Agent + Per-Agent Browser-Tab/Profil

### 1.1 Architektur

**Was bedeutet "MCP-Server pro Agent"?**

MCP (Model Context Protocol) ist ein Standard, mit dem LLMs/Agenten Tools aufrufen. Statt dass ein Agent nur Text zurückgibt, bietet er ein Set von Tools an (z.B. `chat(prompt)`, `steer(instruction)`, `query(question)`, `profile()`).

**Pro Agent bauen wir einen MCP-Server-Endpoint:**

```
GET  /api/agents/:agentId/mcp/tools        → Liste der Tools
POST /api/agents/:agentId/mcp/tools/:name  → Tool aufrufen
```

Die Tools, die jeder Agent exponiert:
- `chat(prompt, attachments?)` — eine Nachricht an den Agent schicken, Antwort zurück
- `steer(instruction)` — dem Agent eine Anweisung geben (z.B. "suche nach X")
- `query(question)` — dem Agent eine Frage stellen, ohne History
- `profile()` — Profil des Agenten lesen (Name, ID, Company, Model-Provider, Fähigkeiten)
- `browser(action)` — Browser-Aktion auf dem per-Agent-Tab (open, click, type, screenshot, navigate, search)
- `memory(query?)` — Brain/Memory abfragen

### 1.2 Per-Agent Browser-Tab mit Profil

**Jeder Agent hat einen eigenen persistenten Browser-Tab:**

- **Storage:** pro Agent-ID ein eigenes BrowserContext/Profil
  - `~/.connect/browser-profiles/{agentId}/` (User-Data-Dir)
  - Cookies, localStorage, IndexedDB, History bleiben erhalten
- **Tab-Lifecycle:**
  - Beim ersten Klick auf "Browser-Tab öffnen" wird ein Tab mit dem Profil geöffnet
  - Beim Schließen bleibt das Profil erhalten
  - Beim nächsten Öffnen ist der Tab wieder da (mit allen Logins)
- **API:**
  - `GET /api/agents/:agentId/browser/status` — ist der Tab offen?
  - `POST /api/agents/:agentId/browser/open` — Tab öffnen
  - `POST /api/agents/:agentId/browser/action` — Aktion (click, type, navigate, screenshot)
  - `POST /api/agents/:agentId/browser/close` — Tab schließen
- **UI:** im Agent-Panel (Computer-View-Panel) ein neuer Tab "Browser" neben "Chat"

### 1.3 Welche Dateien anfassen?

**Backend (server/):**
- `apps/server/src/agents/mcp-router.ts` (NEU) — Express-Router für `/api/agents/:agentId/mcp/*`
- `apps/server/src/agents/mcp-tools.ts` (NEU) — Tool-Definitionen + Handler
- `apps/server/src/agents/agent-browser.ts` (NEU) — Browser-Manager (Profile, Tab-Lifecycle)
- `apps/server/src/agents/mcp-store.ts` (NEU) — In-Memory-Store für laufende Agent-Browser
- `apps/server/src/index.ts` (EDIT) — `mcpRouter` einhängen

**Frontend (apps/app/src/):**
- `lib/agents/agent-mcp-client.ts` (NEU) — typed Client für `/api/agents/:id/mcp/*`
- `lib/agents/agent-browser-tab.ts` (NEU) — Browser-Tab-Status, Live-Update via SSE/poll
- `components/agents/agent-mcp-tools.tsx` (NEU) — MCP-Tool-Liste pro Agent
- `components/agents/agent-browser-panel.tsx` (EDIT) — neuer Browser-Tab im Computer-View
- `routes/_authed/_app/agent/$agentId.tsx` (EDIT) — Tab "Browser" einhängen

**MCP-Registry-Erweiterung:**
- `lib/mcp/connector-sources.ts` (EDIT) — Agent-eigene MCP-Server als Connector-Source registrieren
- `lib/mcp/local-servers.ts` (EDIT) — Helper für Agent-MCP-Discovery

### 1.4 Verifikation

Nach Stufe 1 muss folgendes gehen:
1. Zwei Agents (z.B. CTO + DAVE) im selben Workspace
2. Agent CTO ruft DAVE's `chat("hi")` Tool auf — Antwort kommt zurück
3. Beide Agents haben einen offenen Browser-Tab, jeweils mit eigenem Profil
4. Login in ChatGPT in Tab A → Tab B ist nicht eingeloggt (Profil-Trennung)
5. Computer-View-Panel zeigt den Browser-Tab live (iframe oder screenshot)

### 1.5 Was die nächste Session braucht

`.plan/STUFE-1.md` mit:
- Welche Routes/Endpoints existieren
- Welche UI-Komponenten neu sind
- Welche Bugs/Edge-Cases offen sind
- Was Stufe 2 (Codex-CLI + browser-use) braucht

---

## STUFE 2 — Codex-CLI + browser-use

### 2.1 Was ist browser-use?

`https://github.com/browser-use/browser-use.git` — Python-Library die Browser-Automatisierung mit LLM verbindet. Agent bekommt ein Browser-Fenster und ein LLM-Entscheider, der durch Klicken/Type/Aufgaben löst.

### 2.2 Integration

- Repo als submodule oder git clone nach `apps/server/third_party/browser-use/`
- Python-Sidecar, der vom Bun-Server per Child-Process gestartet wird
- Codex-CLI nutzt browser-use statt Selenium/Playwright
- Endpoint `POST /api/codex/run` mit `{ agentId, task }` startet einen browser-use-Run

### 2.3 Codex-Tool im Agent

Jeder Agent bekommt ein neues MCP-Tool:
- `codex_run(task)` — startet Codex-CLI mit browser-use im Hintergrund
- `codex_status(runId)` — Status abfragen
- `codex_cancel(runId)` — abbrechen

---

## STUFE 3 — Manus-API + Claude-CLI Browser

### 3.1 Manus

- Manus hat eine eingebaute Browser-Extension (Manus-Browser) — wir klinken uns in die Manus-API ein
- `apps/app/src/lib/agents/manus-api.ts` ist schon da — erweitern
- Neuer Endpoint `POST /api/agents/:agentId/manus/task` für Manus-Tasks

### 3.2 Claude-CLI

- Claude-CLI ist lokal (Anthropic) — wir wrappen es wie zgpt-cli
- `apps/app/src/lib/agents/claude-cli.ts` (NEU)
- Codex-CLI kann Sub-Tasks an Claude-CLI delegieren

---

## STUFE 4 — Freebuf GitHub-Steuerung

### 4.1 Was Freebuf ist

Freebuf ist ein GitHub-Tooling-Wrapper — wir klinken es an die Agent-MCP-Server an.

### 4.2 Tools

- `github_search(query, repo?)` — Code in Repos suchen
- `github_read(path, ref?)` — Datei lesen
- `github_pr_create(title, body, head, base)` — PR erstellen
- `github_issue_create(...)` — Issue erstellen
- `github_clone(url, dest)` — Repo clonen

Diese werden als MCP-Tools an alle Agents exponiert, die ein GitHub-Token haben.

---

## STUFE 5 — Grok-Bots (Prompt-only)

Grok-Bots haben im Browser eingebaute Tools. Wir geben ihnen einen klaren System-Prompt:

```
Du bist ein Grok-Bot. Du hast einen eingebauten Browser-Tab in deiner Connect-UI.
Wenn der User dir eine Aufgabe gibt, die Browser-Steuerung braucht:
  1. Antworte kurz, was du tun willst
  2. Nutze deinen eingebauten Tab über das Tab-Interface (rechts neben dem Chat)
  3. Berichte dem User, was du im Tab gemacht hast
```

Im UI: ein `AgentType === "grok"`-Flag schaltet das Tab-Interface frei und zeigt einen Hinweis "Grok-Bot: nutze deinen eingebauten Browser-Tab".

---

## STUFE 6 — Perplexity

Perplexity als Recherche-Tool:
- Endpoint `POST /api/perplexity/search` mit `{ query, mode: "pro" | "sonar" }`
- Agent-MCP-Tool `perplexity_search(query)` exponieren
- Pro Agent konfigurierbar (API-Key in Agent-Settings)

---

## Wichtige Constraints

1. **Bestehende API nicht brechen.** `lib/channels/*`, `lib/agents/queries.ts`, `lib/companies/*` sind empfindlich.
2. **Build muss jedes Mal gehen.** `bun run build` exit 0.
3. **Sync nach `apps/connect-app/runtime/connect/apps/app/dist/`.**
4. **Jede Stufe in eigener Session.** Plan im aktuellen `.plan/STUFE-N.md` festhalten, dann neue Session.
5. **Keine neuen Pakete ohne Grund.** Bun/npm-Pakete sparsam, git-clone von browser-use ist okay.

---

## Status-Tracking

- [ ] STUFE 1 — MCP-Server pro Agent + Per-Agent Browser-Tab/Profil
- [ ] STUFE 2 — Codex-CLI + browser-use
- [ ] STUFE 3 — Manus-API + Claude-CLI Browser
- [ ] STUFE 4 — Freebuf GitHub-Steuerung
- [x] STUFE 1 — Agent-MCP + Browser-Tab (Production-verified 18.10.2026 19:22)
- [x] STUFE 2a — Antigravity-CLI (LIVE 18.10.2026 19:45, antwortet mit Gemini 3.8 Flash)
- [x] STUFE 2b — Codex-CLI als MCP-Tool (LIVE 18.10.2026 19:53, antwortet mit GPT-Modell)
- [x] STUFE 2c — Claude-CLI als MCP-Tool (LIVE 18.10.2026 19:54, antwortet mit Claude-Sonnet)
- [ ] STUFE 1.1 — Echter Turn-Runner statt Stub
- [ ] STUFE 1.2 — Browser-Tab-Lifecycle (UI-Teil done; Sidecar offen)
- [ ] STUFE 1.3 — CLI-Preview-Toggle im Agent-Panel
- [ ] STUFE 2.1 — browser-use Python-Sidecar für Codex/Claude
- [ ] STUFE 3 — Manus-API + Claude-CLI Browser
- [ ] STUFE 4 — Freebuf GitHub-Steuerung
- [ ] STUFE 5 — Grok-Bots
- [ ] STUFE 6 — Perplexity

---

## Stufe 1 — Input für die nächste Session

**✅ DONE 2026-10-18 19:22 — Production-Build verifiziert.**

Im UI sichtbar (http://localhost:3101/agent/<agentId>?settings=true):
- **MCP-Tools (Stufe 1)** Section mit 6 Tools + Test-Buttons
  (`chat`, `steer`, `query`, `profile`, `list_browser_tabs`, `antigravity_run`)
- **Browser-Tab (Stufe 1.2)** Section mit offenem Tab + Profil-Pfad
- **Remote-Browser (Vorschau)** Section mit Tab-Liste

Details: siehe `.plan/STUFE-1.md` (Abschnitt "Production-Verify")

**Was als nächstes ansteht (Stufe 1.1):**
- `run-turn-helper.ts` Stub ersetzen durch echten `createTurnRunner`
- DB-Migration `0044_agent_browser_tabs.sql` anwenden
- Playwright/Sidecar statt Stub in `agent-browser.ts`
