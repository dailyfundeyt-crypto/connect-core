# Stufe 1.3 — CLI-Preview-Toggle im Agent-Panel

**Status:** ✅ ABGESCHLOSSEN — Live-Stream läuft, Frontend-Panel mit Toggle LEBT.

## Was Stufe 1.3 macht

Der User sah bisher nach 30s plötzlich die finale Antwort des CLI-Runs,
ohne zu wissen, was währenddessen passiert ist. Stufe 1.3 macht den
gesamten Stream sichtbar — Token für Token, Tool-Call für Tool-Call.

## Backend (Server)

### Neues Modul `agent-cli-stream.ts`

Eine **Run-Registry** für laufende CLI-Runs. Mehrere Subscriber können
den gleichen Run live mitlesen.

- `startAgentCliRun({ agentId, provider, model, prompt, allowWrite? })`
  startet `runCli(...)` und gibt sofort eine `runId` zurück
- `subscribeAgentCliRun(agentId, runId)` liefert ein
  `AsyncGenerator<CliRunEvent>` mit `meta`/`event`/`done`
- `lastAgentCliRun(agentId)` — der letzte Run wird 60s gecached,
  damit ein Panel-Refresh nicht alles verliert
- `abortAgentCliRun(agentId, runId)` bricht den laufenden Prozess ab
- `MAX_RUNS = 64` — wir behalten nicht ewig alle Runs im RAM; älteste
  fertige werden zuerst entfernt

### `cli-model.ts` — Bugs gefixt

Der Antigravity-Stream hatte **drei Bugs** im alten `parseAntigravityLine` /
`argsFor`:

1. **`-p` schluckte `--output-format`**: `-p` braucht zwingend ein Argument
   direkt danach, und `-p --output-format …` interpretierte `--output-format`
   als Prompt-Text. **Fix:** alle Flags zuerst, `-p <prompt>` als letztes.
2. **Echte Stream-Format falsch geparst**: Antigravity schickt `event:`
   als Top-Level, nicht `type:`. Außerdem `event: "init" | "step_update"
   | "result"` statt `assistant`/`tool_use`/`done`. **Fix:** `parseAntigravityLine`
   liest jetzt das echte Format und liefert für `step_update` mit
   `step_type: "agent_response"` die `text_delta` als Text-Event.
3. **`--no-color` und `-C` existieren in agy nicht** — sie waren aus der
   Codex-Adapter kopiert. **Fix:** nur `--output-format stream-json` und
   ggf. `--dangerously-skip-permissions` (für Write-Tasks); cwd kommt
   aus dem `spawn(..., { cwd })`-Parameter.

### Neuer SSE-Endpoint

`POST /api/agent-mcp/:agentId/cli/stream`

Body: `{ provider, model, prompt, allowWrite? }` → startet neuen Run
Body: `{ runId }` → subscribed nur auf laufenden Run

Antwort: `text/event-stream` mit:
- `event: meta` (initialer Run-Meta)
- `event: delta` (Text-/Error-/Usage-Updates)
- `event: end` (finale Meta mit fullText, status, usage)
- `event: error` (Stream-Fehler)
- `: ping\n\n` (Heartbeat alle 15s gegen Proxy-Timeouts)

Plus zwei kleine Helfer:
- `GET /api/agent-mcp/:agentId/cli/last` — letzter Run (60s-Cache)
- `POST /api/agent-mcp/:agentId/cli/abort` — Run abbrechen

## Frontend (App)

### `agent-mcp-client.ts` — SSE-Client

`streamAgentCli(agentId, body, { signal })` ist ein `AsyncGenerator<CliStreamEvent>`,
der die SSE-Chunks parst und jedes Server-Event an den Caller liefert.
Browser-native, kein `EventSource` weil wir POST + JSON-Body brauchen.

`getLastAgentCliRun(agentId)` und `abortAgentCliRun(agentId, runId)`
sind dünne Wrapper.

### Neue Komponente `<AgentCliStreamPanel>`

- **Toggle oben rechts**: `Live` (default) | `Final` | `Aus`
- **Form**: Provider-Select (antigravity/codex/claude), Model-Input
  (mit Provider-spezifischem Placeholder), „Schreiben"-Checkbox
  (übersetzt in `allowWrite`)
- **Senden/Stop-Buttons** mit Run-Meta-Anzeige (input/output tokens, status)
- **Live-Stream-Panel**: max. 400px hoch, monospace, schwarzer
  Hintergrund, **Auto-Scroll** zum Ende
- **Beim Mount**: letzter Run aus dem 60s-Cache wird sofort gerendert,
  damit der User nicht „nichts" sieht
- **Stop** schickt zwei Sachen: `AbortController.abort()` (Fetch-Stream
  abbrechen) UND `abortAgentCliRun(...)` (Server killt den Prozess)

### Eingebunden in `agent-profile.tsx`

Direkt unter dem `AgentBrowserPanel`, sodass das Agent-Profil
nacheinander zeigt: MCP-Tools → Browser-Tab → CLI-Stream.

## E2E-Test (`apps/server/scripts/test-agent-cli-stream.ts`)

```
[e2e] starting run: provider=antigravity model=auto prompt="Antworte mit genau: PING_STUFE13_OK"
[e2e] runId=run_mve7t8nm_pplzu8
[e2e] delta(1): "\n[Antigravity bereit — Browser-Tools: 20]\n"
[e2e] delta(2): "PING"
[e2e] delta(3): "_STUFE13_OK\n"
[e2e] usage: input=13124 output=203
[e2e] done: status=done duration=10352ms textLen=58 error=-
[e2e] fullText: "\n[Antigravity bereit — Browser-Tools: 20]\nPING_STUFE13_OK\n"
[e2e] stats: 3 deltas, first delta after 2965ms
[e2e] lastAgentCliRun: match
[e2e] ✅ E2E OK
```

- 3 Live-Deltas (init-Hinweis + 2 Token-Groups)
- usage-Info: 13124 input / 203 output
- Antwort enthält `PING_STUFE13_OK` korrekt
- 60s-Cache funktioniert

## Geänderte/neue Dateien

- `apps/server/src/agent-hub/agent-cli-stream.ts` — **neu** (Registry)
- `apps/server/src/agent-hub/agent-mcp-routes.ts` — neuer SSE-Endpoint + Helpers
- `apps/server/src/agent-hub/cli-model.ts` — parseAntigravityLine + argsFor gefixt
- `apps/app/src/lib/agents/agent-mcp-client.ts` — SSE-Client hinzugefügt
- `apps/app/src/components/agents/agent-cli-stream-panel.tsx` — **neu**
- `apps/app/src/components/agents/agent-profile.tsx` — Panel eingebunden
- `apps/server/scripts/test-agent-cli-stream.ts` — **neu** (E2E-Test)

## Was als nächstes ansteht

- **Stufe 1.1** — Echter Turn-Runner statt Stub (jetzt hat `runCli` einen
  Live-Stream, der Turn-Runner kann ihn für chat/steer/query nutzen)
- **Stufe 1.3.1** — der User soll klicken können auf einen Tool-Call im
  Stream, um den passenden Browser-Tab zu öffnen
- **Stufe 3+** — Manus-API + Claude-CLI Browser etc.
