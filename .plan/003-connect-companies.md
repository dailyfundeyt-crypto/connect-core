# 003 — Connect branding, companies, local-first

**Datum:** 2026-09-21

## UI

- App name: **Connect** (`brand.yaml` + generated config)
- Sidebar header: **Company switcher** (logo + großer Name + Beschreibung)
- **+** öffnet `/company/new` (Logo-Upload + Beschreibung)
- Home: „Explore companies“ statt Agenten-Karten; OPENBOT / „Start a new channel“ entfernt
- Erster Bot: **CTO** (verwaltet andere Coworker, nimmt deine Stellung ein)
- Bot-Profile mit Bildern + Upload im Agent-Dialog

## CopilotKit / lokal

- Inspector / „Powered by CopilotKit“ Badge: `enableInspector={false}` + CSS-Hide
- Modell: Qwen via OpenAI-kompatiblem Endpoint (`model.yaml` → `qwen-plus`)
- Vollständiges Abschalten der Intelligence-Cloud bleibt nachgelagert (Threads nutzen den Runtime-Stack); LLM kann lokal (Ollama/DashScope) laufen

## Dateien

- `app/src/components/companies/*`
- `app/src/lib/companies/*`
- `app/src/routes/_authed/_app/company/*`
- `examples/fintech/agents.yaml`, `channels.yaml`, `brand.yaml`, `model.yaml`
