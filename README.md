<div align="center">

<img src="apps/app/public/brand/connect-logo.png" alt="Connect Logo" width="120" height="120" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);" />

# Connect

**The self-hosted AI coworker workspace your company actually owns.**  
Same intuitive experience as ChatGPT, Claude or Grok — running on your own infrastructure, with full control over data, agents, and an integrated real browser.

[**Quick Start**](#quick-start) · [**Desktop App & AI-Browser**](#desktop-app--integrierter-ai-browser) · [**Monorepo-Architektur**](TOP-LEVEL-OVERVIEW.md) · [**Docs**](docs/README.md) · [**Cloud Deploy**](docs/CLOUD-DEPLOY.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Status: Production Ready](https://img.shields.io/badge/status-active-emerald.svg)
![Platform: Windows | Linux | macOS](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)

<br/>

<a href="development/assets/demo-connect.mp4">
  <img src="development/assets/demo-connect-preview.jpg" alt="Connect Hand-Drawn Animation Film Demo" width="880" style="border-radius: 12px; box-shadow: 0 15px 35px rgba(0,0,0,0.3);" />
</a>

<p><em>🎬 Handgezeichneter Animationsfilm: Connect AI Coworker, integrierter Browser & isolierte Computer-Infrastruktur. (<a href="development/assets/demo-connect.mp4">Demo-Video ansehen: development/assets/demo-connect.mp4</a>)</em></p>

</div>

---

## Was ist Connect?

Connect ist eine vollwertige Plattform für autonome KI-Mitarbeiter (Agents), die direkt in deiner eigenen Infrastruktur läuft:

- **Echte Computer & echter Browser für jeden Agenten:** Jeder Bot erhält seinen eigenen isolierten Container mit Chromium, eigenem Dateisystem (`/workspace`) und separaten Logins.
- **Integrierter Windows Desktop AI-Browser:** Native .NET 8 / WebView2 Desktop-App ohne iframe-Sperren (`X-Frame-Options`) mit lokaler HTTP-Automations-Bridge.
- **Sicheres Gateway:** Jede Aktion (Browser-Klick, Datei-Zugriff, MCP-Aufruf) wird vor der Ausführung per CEL-Policy geprüft und im Audit-Log festgehalten.
- **Volle Datenhoheit:** Alle Konversationen und Daten liegen in deiner PostgreSQL-Datenbank. Keine Daten fließen ungefragt an Dritte ab.

---

## Desktop App & Integrierter AI-Browser

In Ergänzung zur Web-Oberfläche (`http://localhost:3010`) enthält Connect eine native Windows-Desktop-Anwendung unter `apps/desktop/connect-browser/`:

```
┌─────────────────────────────────────────────────────────────┐
│  Connect Desktop (.NET 8 + WebView2)                        │
├─────────────────────────────────────────────────────────────┤
│  Tabs: [ 🏢 Connect Workspace ]   [ 🌐 Echter AI-Browser ]  │
├─────────────────────────────────────────────────────────────┤
│  Toolbar: [◀] [▶] [↻] [⌂] [ https://google.com         ] [Go│
├──────────────────────────────┬──────────────────────────────┤
│                              │  Lokale AI-Automation Bridge │
│   WebView2 (Echter Browser)  │  (HTTP Port 3002)            │
│   • Keine iframe-Blockaden   ├──────────────────────────────┤
│   • Google & Web3 Logins     │  Befehle für KI-Agenten:     │
│   • Live-DOM & Screenshots   │  • POST /api/browser/navigate│
│                              │  • POST /api/browser/eval    │
│                              │  • GET  /api/browser/snapshot│
│                              │  • GET  /api/browser/screenshot│
└──────────────────────────────┴──────────────────────────────┘
```

### Starten der Desktop-App:
Einfach Doppelklick auf:
```cmd
START-CONNECT-BROWSER.cmd
```
Oder manuell bauen:
```cmd
cd apps\desktop\connect-browser
dotnet build -c Release
"bin\Release\net8.0-windows\Connect Desktop.exe"
```

---

## Monorepo-Architektur (inspiriert von OneKey)

Das Repository ist modular aufgebaut (siehe [MONOREPO-STRUCTURE.md](MONOREPO-STRUCTURE.md)):

```text
Connect Monorepo
├── apps/
│   ├── desktop/                # Native Windows Desktop App (.NET 8 + WebView2)
│   ├── web/ (app/)             # Vite + React Web Frontend (Port 3010)
│   ├── server/                 # Hono API & Better Auth Server (Port 3001)
│   ├── supervisor/             # Docker Sandbox Supervisor
│   └── worker/                 # Scheduled Routines Worker
├── packages/
│   ├── shared/                 # Gemeinsame Typen & Verträge
│   └── agents/                 # Runtimes: agent-computer, agent-bot, etc.
├── development/                # Entwicklungs-Tools (START-PC.cmd, activate-google-oauth.sh)
└── docs/                       # Dokumentation (Architektur, Cloud-Deploy, OAuth)
```

---

## Quick Start

### 1. Voraussetzungen
- **WSL 2 (Ubuntu)** mit PostgreSQL oder **Docker Desktop**
- **Bun 1.3+** (für App und API-Server)
- **.NET 8 SDK** (für die Windows Desktop-App)

### 2. Ein-Klick-Start (All-in-One)
Unter Windows einfach Doppelklick auf:
```cmd
START-CONNECT-BROWSER.cmd
```
Dieses Skript prüft und startet vollautomatisch:
1. PostgreSQL Datenbank (WSL / Docker)
2. Connect API Backend (`http://localhost:3001`)
3. Connect Workspace Web App (`http://localhost:3010`)
4. Connect Desktop App mit integriertem AI-Browser (`Connect Desktop.exe`)

### 3. Stack manuell starten
Unter Windows:
```cmd
START-PC.cmd
```
Unter Linux / WSL:
```sh
bash development/scripts/start.sh
```

- **Web-UI:** [http://localhost:3010](http://localhost:3010)
- **API-Server:** [http://localhost:3001](http://localhost:3001)
- **Desktop-App:** `START-CONNECT-BROWSER.cmd`

---

## Architektur

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="development/assets/architecture-dark.svg">
  <img src="development/assets/architecture-light.svg" alt="Connect Architecture: App, Server, Gateway, Bot Containers, and PostgreSQL">
</picture>

| Dienst | Port | Zweck |
|---|---|---|
| **Connect Web-UI** | `3010` | React / Vite Benutzeroberfläche |
| **Connect API Server** | `3001` | Hono Backend, Better Auth, Policies & Kanäle |
| **Desktop AI-Bridge** | `3002` | Lokale Automations-Schnittstelle im Desktop-Browser |
| **agent-computer** | `4100` | Chromium-Automationscontainer mit persistentem Workspace |
| **supervisor** | `4500` | Verwaltet und isoliert Bot-Container |
| **PostgreSQL** | `5432` | Sessions, Accounts, Audit-Logs, Kanäle und Routinen |

---

## Authentifizierung

Connect unterstützt enterprise-taugliche Authentifizierung über **Better Auth**:
* **Google OAuth:** Desktop- und Web-Client vorkonfiguriert.
* **Microsoft Entra ID (Azure AD):** Für Firmenaccounts.
* **SAML / OIDC:** Eigene Identity-Provider im Admin-Panel nach Domain routbar.

Anleitung: [Google OAuth Setup](development/scripts/web-google-oauth.md)

---

## Dokumentation

- [TOP-LEVEL-OVERVIEW.md](TOP-LEVEL-OVERVIEW.md) — Wo ist was im Repo
- [docs/architecture.md](docs/architecture.md) — Tiefgehende Systemarchitektur
- [docs/configuration.md](docs/configuration.md) — Alle Umgebungsvariablen
- [docs/CLOUD-DEPLOY.md](docs/CLOUD-DEPLOY.md) — Cloud Deployment & Hosting
- [development/scripts/web-google-oauth.md](development/scripts/web-google-oauth.md) — Google OAuth Setup

---

## Lizenz

[MIT](./LICENSE) © Connect Team
