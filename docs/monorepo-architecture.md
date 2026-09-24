# Connect Monorepo Architektur (inspiriert von OneKey)

Dieses Repository ist nach dem modernen Monorepo-Muster strukturiert (analog zu [OneKey app-monorepo](https://github.com/OneKeyHQ/app-monorepo)), um Desktop, Web, Backend und AI-Agenten sauber zu trennen.

---

## Verzeichnisübersicht

```text
Connect / Connect Monorepo
├── apps/
│   ├── desktop/                # Native Windows Desktop App (.NET 8 + WebView2 + AI-Browser)
│   │   ├── connect-browser/    # C# WebView2 Shell & Automation Server (Port 3002)
│   │   │   ├── Connect Desktop.exe
│   │   │   ├── MainWindow.xaml (Connect + Echter AI-Browser Tabs)
│   │   │   └── BrowserAutomationServer.cs (AI HTTP-Bridge)
│   │   └── src-tauri/          # Optionale Tauri-Desktop-Alternative
│   ├── app / web/              # React / Vite Web Frontend (Port 3010)
│   ├── server/                 # Bun / Hono API & Better Auth Server (Port 3001)
│   ├── supervisor/             # Docker Sandbox & Isolation Supervisor
│   └── worker/                 # Scheduled Routines & Background Runner
│
├── packages/
│   ├── shared/                 # Gemeinsame TypeScript-Typen & Validierungen
│   └── agents/                 # Modulare Agent-Harnesses & Runtimes:
│       ├── agent-computer/     # Computer & Browser Action Agent
│       ├── agent-bot/          # Framework Bot Loop
│       ├── agent-mastra/       # Mastra Agent
│       ├── agent-langgraph/    # LangGraph Workflow Agent
│       └── ...
│
├── development/                # Entwicklungs-Tools & Scripts
│   ├── scripts/                # Start-, Restart- und Build-Skripte
│   ├── START-PC.cmd            # Windows Stack Launcher & Browser-Opener
│   ├── START-CONNECT-BROWSER.cmd # Direkter Launcher für die Desktop-App mit AI-Browser
│   └── activate-google-oauth.sh# Interaktives Google OAuth Setup
│
└── docs/                       # Vollständige Dokumentation
    ├── CLOUD-DEPLOY.md         # Anleitung für Cloud Deployment (Vercel / Supabase)
    ├── WEB-GOOGLE-AUTH.md      # Google OAuth Web-Client Konfiguration
    ├── DESKTOP-PC.md           # PC & Desktop Dokumentation
    └── WINDOWS.md              # Windows-Entwickleranleitung
```

---

## Echter AI-Browser vs. Alter Ansatz

| Merkmal | Alter Ansatz (`START-APP.cmd`) | Neuer Ansatz (`desktop/connect-browser`) |
|---|---|---|
| **Technologie** | Externes Chrome-Fenster oder Web-iframe | **Eingebettetes WebView2 (.NET 8 WPF)** |
| **Sicherheitssperren** | iframes blockiert durch `X-Frame-Options` | **Vollständig nativ (Google, Web3, dApps)** |
| **Benutzeroberfläche** | Getrenntes Browserfenster | **In-App Tabs:** `[Connect Workspace]` + `[Echter Browser]` |
| **AI-Automatisierung** | Nur über externe Headless-Container | **Direkte AI-Bridge (Port 3002):** Navigate, Click, Type, Snapshot, Screenshot |
| **Session / Logins** | Profilverzeichnis außerhalb | **Dauerhaft gespeicherte Web-Sessions** |

---

## AI-Automation Endpunkte (`http://127.0.0.1:3002`)

* **`GET /api/browser/status`**: Gibt aktuellen Browserzustand, Titel und URL zurück.
* **`POST /api/browser/navigate`**: Steuert den Browser zu einer Zielseite (`{"url": "https://..."}`).
* **`POST /api/browser/eval`**: Führt JavaScript im Browser aus (`{"script": "document.title"}`).
* **`POST /api/browser/click`**: Klickt ein DOM-Element an (`{"selector": "button.submit"}`).
* **`POST /api/browser/type`**: Schreibt Text in ein Eingabefeld (`{"selector": "input#search", "text": "..."}`).
* **`GET /api/browser/snapshot`**: Liest Titel, URL und Textinhalt für die KI aus.
* **`GET /api/browser/screenshot`**: Erstellt einen echten PNG-Screenshot des Bildschirms.
