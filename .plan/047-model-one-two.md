# 047 — Model One / Model Two (External vs Hermes)

**Datum:** 2026-09-22  
**Prompt:** [CURSOR-PROMPT-model-one-two.md](./CURSOR-PROMPT-model-one-two.md)  
**Bezug:** Plan 038/039 (Hermes/Codex), 044 (Bot-Shells), Manus Open API

## Produkt

| Name | Bedeutung | UX |
| --- | --- | --- |
| **Model One** | External Provider | Nur Chat + Datei-Upload; Agent unsichtbar |
| **Model Two** | Local = **Hermes** | Dieselbe Chat-UI; Hermes im Hintergrund |

Settings → **Model Provider** (`#model-provider`):

```
hermes | external
         ├─ terminal  → Invoke-Codex.ps1 (Hidden) oder /api/cli-bridge;
         │              Manus-as-CLI braucht ebenfalls Manus-Key
         └─ api_key   → HTTP; Manus-Features nur mit Manus-API-Key
```

## Hermes (Model Two)

- Client: CopilotKit → Connect AG-UI
- Agent-Bot: `http://127.0.0.1:4100/ag-ui` (siehe `agent-bot` listen log)
- API-Server: `:3001`, UI: `:3010` (Vite oft `:43123` in Cloud)
- Bot-Computer: `:4100` Umgebung / Docker computer

## Key-Gate (Manus)

- Key: Settings → Model Provider / API-Keys, oder `MANUS_API_KEY` / `VITE_MANUS_API_KEY`
- **Mit Key:** `task.create`, Mail Manus, Cloud-Agent
- **Ohne Key:** klare Ablehnung — kein Silent-Fake; Mail-Manus-UI zeigt „Deaktiviert“
- Status: `GET /api/connect/provider-status` → `{ hasManusKey, manusFeaturesEnabled, hasCodexBridge }` (keine Secrets)

## Router

Client: `dispatchModelTurn` → Composer (`channel-chat.tsx`)

1. Model Two → Hermes AG-UI (`useHermes`)
2. Model One `api_key` + Manus → `/api/manus` (Vite-Proxy → `api.manus.ai/v2`)
3. Model One `terminal` → `POST /api/connect/model-chat` (Invoke-Codex headless) → sonst `/api/cli-bridge/run`
4. Terminal · Manus → gleiche Manus-API (Key-Gate)

CLI-Panel ist **nie** sichtbar (`AgentCliPanel` → `null`).

## Acceptance (Prompt)

- [x] Settings: Model Two = Hermes, Model One = External
- [x] External: Terminal vs API-Key
- [x] Manus-Key in Settings; `provider-status` ohne Secret-Leak
- [x] Mit Key: Manus-Features; ohne Key: deaktiviert / Fehlertext
- [x] Chat + Upload einzige Oberfläche; kein Agent-TUI
- [x] Terminal headless (`-WindowStyle Hidden` / cli-bridge)
- [x] browser-use / sandbox / bot-computer nur Hintergrund-Tools
- [x] Codex: `Desktop\Codex Sandboxen\Invoke-Codex.ps1` + `cli-1` (env `CONNECT_CODEX_INVOKE`)
- [x] Hermes gleicher Chat
- [x] Smoke-Pfad dokumentiert (unten)

## Smoke (Stefan)

1. **Model Two:** Settings → Model Provider → Hermes → Chat senden → Hermes/AG-UI Antwort
2. **Model One API:** External → API-Key → Manus-Key speichern → Chat → Manus-Task-Link
3. **Model One Terminal:** External → Terminal → ZGPT/Codex → Chat ohne sichtbares Terminal
4. **Key-Gate:** Manus-Key entfernen → Manus-Send abgelehnt; Mail Manus „Deaktiviert“

```bash
curl -s http://127.0.0.1:3001/api/connect/provider-status
# Vite Manus-Proxy:
curl -s -X POST http://127.0.0.1:43123/api/manus/task.create \
  -H 'content-type: application/json' -H "x-manus-api-key: $MANUS_API_KEY" \
  -d '{"message":{"content":"ping"}}'
```

## Dateien

- `app/src/lib/agents/model-provider.ts`
- `app/src/lib/agents/model-provider-dispatch.ts`
- `app/src/lib/agents/zgpt-cli.ts` / `manus-api.ts`
- `app/src/components/settings/model-provider-settings.tsx`
- `app/src/components/agents/manus-mail-panel.tsx` (Key-Gate)
- `app/src/components/agents/agent-cli-panel.tsx` (hidden)
- `server/src/connect/routes.ts` — `provider-status`, `model-chat`, Invoke-Codex
- `Plan/CURSOR-PROMPT-model-one-two.md`
