# 002 — Startversuch ohne echte API-Keys

**Datum:** 2026-09-21  
**Status:** Localhost UI läuft (degraded)

## Ergebnis

| Schritt | Status |
| --- | --- |
| Clone + `START.sh` + `Plan/` | ok |
| Bun + Docker | ok |
| Postgres / Supervisor / Computer | ok |
| DB-Migration | ok (Docker-Migrate hing → Fallback: lokal `bun drizzle-kit migrate`) |
| Agent-Bot / LangGraph | ok mit Placeholder-Keys |
| API Server `:3001` | ok |
| App `:3010` | **ok — http://localhost:3010** |
| CopilotKit Licence | `none` (echte `INTELLIGENCE_API_KEY` fehlt) |

## Änderungen am Start-Pfad

- `scripts/start.sh`: lokaler Migrate-Fallback, optionale Bot-Health-Checks und Soft-Fail der Licence-Prüfung bei `CONNECT_FORCE_START=1`
- `START.sh`: Wrapper prüft Keys, erzwingt Start mit `CONNECT_FORCE_START=1`

## Für vollen Betrieb

In `Connect/.env` echte Werte setzen:

1. `INTELLIGENCE_API_KEY` — `npx copilotkit@latest login` + `project select`
2. `OPENAI_API_KEY` — OpenAI-Key

Dann: `cd Connect && ./START.sh`
