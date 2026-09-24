# Connect — Monorepo Overview

> **Du findest alles. Sofort.**

---

## Wo ist was?

```
Connect/
├── apps/                          ← PRODUKTIVER CODE
│   ├── app/                       React / Vite Web UI (Port 3010)
│   ├── server/                    Bun / Hono API + Auth (Port 3001)
│   ├── desktop/                   .NET 8 / WebView2 Windows Desktop App
│   ├── landing/                   Next.js Marketing Landingpage
│   ├── supervisor/                Docker Sandbox Supervisor (Port 4500)
│   └── worker/                    Scheduled Routines Worker
│
├── packages/                      ← GETEILTE PACKAGES
│   ├── shared/                    TypeScript-Typen, Utils, Contracts
│   └── agents/                    AI Agent Runtimes
│       ├── agent-computer/         Browser & Desktop Action Agent
│       ├── agent-bot/             Framework Bot Loop
│       ├── agent-langgraph/       LangGraph Workflow Agent
│       ├── agent-mastra/          Mastra Agent
│       └── ... (11 weitere Agent-Frameworks)
│
├── development/                   ← ENTWICKLUNG
│   ├── scripts/                   Build-, Start-, Deploy-Skripte
│   ├── supabase-config/           Supabase CLI + Migration Config
│   ├── spire-config/              Spire Auth Server Config
│   ├── assets/                    Logos, Diagramme, Demo-Videos
│   └── research/                  Interne Analysen, Charts
│
├── docs/                          ← DOKUMENTATION
│   ├── architecture.md            Systemarchitektur
│   ├── configuration.md           Alle Umgebungsvariablen
│   ├── deployment.md             Cloud-Deploy Anleitung
│   ├── development.md            Entwickleranleitung
│   ├── plugins/
│   └── ...
│
├── .cursor/                      ← CURSOR IDE
│   ├── skills/                    Agent-Skills für dieses Projekt
│   └── (Rules und Projektanweisungen)
│
├── .claude/                      ← CLAUDE CODE IDE
│   └── skills/                    Agent-Skills (Cloned)
│
├── .plan/                        ← PERSÖNLICHE PLANUNG
│   └── 000-index.md .. 014-*.md  Deine Entwicklungsnotizen
│
├── .github/workflows/            ← CI/CD
│   ├── ci.yml                    Lint, Typecheck, Test
│   ├── desktop.yml               Desktop Build
│   ├── desktop-signing.yml       Windows Signierung
│   └── publish-release.yml      Release Pipeline
│
└── .env.example                  ← CONFIG TEMPLATE
    └── Kopieren → .env, Werte eintragen
```

---

## Ports & Services

| Dienst | Port | Beschreibung |
|--------|------|-------------|
| **Connect Web-UI** | `3010` | React / Vite Benutzeroberfläche |
| **Connect API Server** | `3001` | Hono Backend, Better Auth, Policies |
| **Desktop AI-Bridge** | `3002` | Lokale Browser-Automations-Schnittstelle |
| **agent-computer** | `4100` | Chromium-Container mit Workspace |
| **supervisor** | `4500` | Container-Isolation & Management |
| **PostgreSQL** | `5432` | Datenbank |

---

## Quick Start

```cmd
# Windows: alles starten
development\scripts\START-CONNECT.ps1

# Oder einzelne Dienste:
bun run dev                          # App + Server (Ports 3010 + 3001)
dotnet run --project apps/desktop    # Desktop App
```

---

## Trennung: Was gehört wohin?

| Frage | Antwort |
|-------|---------|
| Ich will die **Web UI** ändern | `apps/app/src/` |
| Ich will das **Backend** ändern | `apps/server/src/` |
| Ich will die **Desktop App** ändern | `apps/desktop/` |
| Ich will einen **Agent** hinzufügen | `packages/agents/` |
| Ich will **Config** ändern | `.env` (lokal) / `development/supabase-config/` |
| Ich will **Dokumentation** lesen | `docs/` |
| Ich will **Testen** | `apps/server/tests/` |
| Ich will **Plan-Notizen** sehen | `.plan/` |

---

## Namenskonvention

| Alt (vor Migration) | Neu (nach Migration) |
|--------------------|---------------------|
| `app/` | `apps/app/` |
| `server/` | `apps/server/` |
| `desktop/` | `apps/desktop/` |
| `landing/` | `apps/landing/` |
| `worker/` | `apps/worker/` |
| `supervisor/` | `apps/supervisor/` |
| `shared/` | `packages/shared/` |
| `agent-*/` | `packages/agents/*/` |
| `docs/` | `docs/` |
| `development/` | `development/` (Scripts neu in `development/scripts/`) |
| `spire/` | `development/spire-config/` |
| `supabase/` | `development/supabase-config/` |
| `assets/` | `development/assets/` |
| `charts/` | `development/research/` |
| `Plan/` | `.plan/` |
| `tests/` | `apps/server/tests/` |
| `.agents/` | `.cursor/skills/.agents/` |
