# 001 — Erstes Setup

**Datum:** 2026-09-21  
**Status:** vorbereitet (Localhost wartet auf API-Keys)

## Was gemacht wurde

1. Repository von https://github.com/CopilotKit/Connect.git nach `Connect/` geklont.
2. `START.sh` angelegt: prüft Bun/Docker, legt `.env` an, installiert Dependencies, startet `scripts/start.sh`.
3. Ordner `Plan/` für Änderungsnotizen angelegt.
4. Bun installiert; Docker CLI + Compose installiert und Daemon gestartet.
5. `.env` aus `.env.example` erzeugt (`CONNECT_SINGLE_USER=true` bleibt aktiv).

## Noch nötig für Localhost

Connect startet den API-Server nicht ohne:

- `INTELLIGENCE_API_KEY` — CopilotKit Runtime-Key (`cpk-…`)
- `OPENAI_API_KEY` (oder Anthropic-Variante laut README)

Keys in `Connect/.env` eintragen, dann:

```bash
cd Connect && ./START.sh
```

App: http://localhost:3010  
API: http://localhost:3001

## Ports

| Dienst | Port |
| --- | --- |
| App (UI) | 3010 |
| API | 3001 |
| Agent Computer | 4100 |
| Bot / LangGraph | 4200 / 4201 |
| Postgres | 5432 |
