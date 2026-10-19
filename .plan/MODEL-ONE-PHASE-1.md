# Model One - Phase 1 Plan (Minimal Viable Product)

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│ EXTERN                                                  │
│  Grok Bot (extern)                                      │
│      ↓ Connect MCP Server (apps/server/src/connect-mcp) │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ UNSER AGENT                                             │
│  Model One                                              │
│  Engine: Antigravity CLI (lokal, Subscription-basiert)  │
│  ├─ System-Prompt: "Du bist Model One..."               │
│  ├─ Tool-1: brain_*  (Markdown lesen/schreiben)         │
│  ├─ Tool-2: shell    (CLI spawnen)                      │
│  ├─ Tool-3: handover (Subagent rufen)                   │
│  └─ Tool-4: ask      (User fragen)                     │
│      ↓ wenn Aufgabe = Browser                           │
│  Subagent: Browser (Manus + Perplexity Computer Use)    │
└─────────────────────────────────────────────────────────┘
```

## Was wir bauen (Phase 1, ~1-2 Tage)

### 1. Model One als Agent-Typ
- **Datei**: `apps/server/src/agents/types/model-one.ts`
- **Engine**: Antigravity CLI (existiert bereits als CLI-Provider in AgentHub)
- **System-Prompt**: 1 Datei, klar, deutsch
- **Tools**: brain_*, shell, handover, ask

### 2. Subagent "Browser"
- **Datei**: `apps/server/src/agents/types/subagent-browser.ts`
- **Tools**: manus_steering, perplexity_computer_use, browser_screenshot
- Manus: Web-Login in Manus-Dashboard, dann Browser-Steuerung über Manus-Extension-Protocol
- Perplexity Computer Use: https://www.perplexity.ai/computer (Browser-basiert)

### 3. UI: Model One Chat
- **Datei**: `apps/app/src/routes/_authed/_app/model-one.tsx`
- 1 Seite, minimalistisch, Grok-Bot-like
- Input unten, Antworten oben
- Rechte Sidebar-Tab-Button: öffnet rechts ein Panel (NICHT Settings)

### 4. Rechte Sidebar (Tab-Pattern)
- **Datei**: `apps/app/src/components/model-one/usage-panel.tsx`
- Tab/Button: oben rechts "Usage" - klick öffnet rechts Slide-In
- Inhalt: Token-Verbrauch (Antigravity), Manus-Calls, Perplexity-Calls, Subagent-Queue
- KEIN Einstellungsbereich dort, nur Anzeige

### 5. Settings-Panel (minimal)
- **Datei**: `apps/app/src/routes/_authed/settings/model-one.tsx`
- 1 Panel in den bestehenden Settings
- Felder: Antigravity-Login-Status, Manus-Email/PW, Perplexity-Account
- Speichert in `connect_workspace_kv` (wie andere Settings)

### 6. MCP-Tool: model_one_chat
- **Datei**: `apps/server/src/connect-mcp/handlers/model-one.ts`
- 1 Tool für Grok Bot extern: `model_one_chat(agentId, message)` → gibt Antwort zurück
- 1 Tool: `model_one_status()` → zeigt Health

## Was wir NICHT bauen (Phase 1)

- 100-Swarm-Logic (kommt in Phase 2)
- Multi-Key-Round-Robin (Antigravity reicht erstmal)
- Token-Spar-Repository Auto-Search (manuell wenn nötig)
- Codex/Claude Code CLI Integration (Phase 2)
- Self-Research-Loop (Phase 3)

## Erfolg-Kriterien (Phase 1 done wenn)

- [ ] Browser öffnet `http://localhost:3101/model-one`
- [ ] User gibt "Was steht in meinem Brain?" ein
- [ ] Model One (Antigravity) liest Brain und antwortet
- [ ] User gibt "Öffne manus.im und suche nach AI News"
- [ ] Model One ruft Subagent Browser → Manus steuert Browser
- [ ] Rechte Usage-Sidebar zeigt: 1 Brain-Read, 1 Manus-Call
- [ ] Grok Bot (extern) ruft MCP `model_one_chat` auf → bekommt Antwort
- [ ] Keine Errors in Console/Logs

## Design-Prinzipien

1. **Weniger ist mehr**: 1 Hauptseite + 1 Sidebar-Tab + 1 Settings-Panel
2. **UI = Chat**: Wie Grok Bot - Input unten, Output oben, alles andere minimiert
3. **Keine doppelten Settings**: Was im Model One schon konfigurierbar ist, nicht nochmal woanders
4. **Echte Tests**: Nach jeder Datei, Browser öffnen, klicken, prüfen
5. **Mirror nicht vergessen**: Nach Build → dist/ nach runtime/ syncen → Connect neustarten

## Dateien die wir ANFASSEN (Liste, nichts anfangen ohne Plan)

### Backend (apps/server)
- `src/agents/types/model-one.ts` (NEU) - Engine-Wrapper für Antigravity
- `src/agents/types/subagent-browser.ts` (NEU) - Subagent für Browser
- `src/connect-mcp/handlers/model-one.ts` (NEU) - MCP-Tool für extern
- `src/connect-mcp/handlers/index.ts` (MODIFY) - registrieren
- `src/connect-mcp/router.ts` (MODIFY) - falls Tool-Registry anders

### Frontend (apps/app)
- `src/routes/_authed/_app/model-one.tsx` (NEU) - Hauptseite
- `src/components/model-one/model-one-chat.tsx` (NEU) - Chat-Komponente
- `src/components/model-one/usage-panel.tsx` (NEU) - Rechte Sidebar
- `src/components/layout/sidebar-shell.tsx` (MODIFY) - rechts Platz für Tab
- `src/routes/_authed/settings/model-one.tsx` (NEU) - Settings
- `src/routes/_authed/settings/index.tsx` (MODIFY) - Eintrag hinzufügen
- `src/components/settings/settings-sidebar.tsx` (MODIFY) - Eintrag

### Build/Mirror
- `apps/app/dist/...` (auto via Vite)
- `apps/connect-app/runtime/connect/apps/app/dist/...` (manuell kopieren)
- Connect.exe neustarten

## Reihenfolge der Implementation

1. **Backend: Model One Engine** (Antigravity wrapper) - testen
2. **Backend: Subagent Browser** (Manus + Perplexity) - testen
3. **Backend: MCP-Tool model_one_chat** - testen via curl
4. **Frontend: Model One Seite** (nur Input + Output) - testen im Browser
5. **Frontend: Usage-Sidebar** (rechts ausklappbar) - testen
6. **Frontend: Settings-Panel** (minimal) - testen
7. **Build + Mirror** - testen auf Port 3101
8. **End-to-End-Test**: User-Prompt im Browser → Antwort → Sidebar zeigt Stats

Jede Stufe: 5-10 Minuten, dann Browser-Test, dann weiter.
