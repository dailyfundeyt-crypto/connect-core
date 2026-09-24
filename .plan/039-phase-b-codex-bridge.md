# Phase B — Codex / ChatGPT-Plan Bridge

Umsetzung von [037](./037-gesamtplan-weiter.md) Phase B.

## Ziel

Channel-Nachricht / Bot-CLI an **ChatGPT** oder **Cursor** ohne `OPENAI_API_KEY` — Antwort über deinen lokalen Plan-Proxy (`codex login` / claudecodex / openclaw-tune).

## Was drin ist

1. **Server-Bridge** — `server/src/cli-bridge/`
   - `GET /api/cli-bridge/status` — erreichbar?
   - `POST /api/cli-bridge/run` — ein Befehl, **nur** User-Message (kein Bootstrap/Heartbeat)
   - Env:
     - `CONNECT_CODEX_BRIDGE_URL` (default `http://127.0.0.1:4096/v1`)
     - `CONNECT_CODEX_BRIDGE_TOKEN` (optional, Proxy-Session — **nicht** `OPENAI_API_KEY`)
     - `CONNECT_CODEX_BRIDGE_MODEL` (default `gpt-5`)
     - `CONNECT_CODEX_BRIDGE_MODE=live|mock`

2. **Bot-CLI verdrahtet** — `app/src/lib/agents/agent-cli.ts`
   - Targets `chatgpt` + `cursor` → Bridge
   - Andere Targets bleiben lokal gemockt
   - Default-Target: `chatgpt`

3. **UI**
   - Bridge-Statuszeile im `AgentCliPanel`
   - Settings → MCP → **Codex bridge** (Refresh / online|offline)

## Lokal (dein Beweis)

```bash
# 1. Plan-Proxy starten (Beispiel — dein Tool)
codex login   # oder claudecodex / openclaw-tune-codex-plus Proxy auf :4096

# 2. Connect
CONNECT_CODEX_BRIDGE_MODE=live
CONNECT_CODEX_BRIDGE_URL=http://127.0.0.1:4096/v1
# optional: CONNECT_CODEX_BRIDGE_TOKEN=<proxy-token>

# 3. In Connect: Bot-CLI → ChatGPT → Befehl tippen
#    oder Channel-Nachricht (Ask-anything enqueued bereits an CLI)
```

Cloud/Dev ohne Proxy: `CONNECT_CODEX_BRIDGE_MODE=mock` — zeigt den Pfad ohne echte Plan-Antwort.

## Explizit nicht

- Kein Fallback auf `OPENAI_API_KEY` für diesen Pfad
- Kein Multi-Account-Hopping
- Kein fettes System-Prompt / Heartbeat (Quota)

## Done-Kriterium (037)

Mit `MODE=live` und laufendem Proxy: Channel/CLI-Nachricht an ChatGPT kommt als Plan-Antwort zurück.

## Nächster Schritt

**Phase C** — Bot-CLI als Wave-artige Command-Blocks (streamen, Interrupt, Scrollback).
