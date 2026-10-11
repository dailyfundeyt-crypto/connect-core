# Connect Sidecar — Schnellstart für einen Coding-Agent

Lies `PLAN.md` ganz, dann:

## 1. Setup-Check (5 min)

```bash
# Diese Tools müssen vorhanden sein — verifiziere jede Zeile:
rustc --version       # Rust 1.77+
cargo --version
node --version        # Node 18+
bun --version
codex --version       # OpenAI Codex CLI lokal installiert
claude --version      # Anthropic Claude CLI lokal (später)
```

Falls `cargo tauri` fehlt:

```bash
cargo install tauri-cli --version "^2"
# dauert 30–45 min, einmaliger Build
```

Falls `codex` fehlt:

```bash
npm install -g @openai/codex
# Voraussetzung: OPENAI_API_KEY ist gesetzt oder in auth.env (siehe unten)
```

## 2. Erste Aktion — Codex lokal installieren

```bash
npm install -g @openai/codex
codex --version
# Erwartet: codex-cli version XYZ

# Auth-Datei (damit der Tray sie lesen kann, ohne sie als ENV zu exportieren):
mkdir -p ~/.connect/sidecar

# Codex: pro Agent ein eigener Login via CODEX_HOME
# (deine bestehenden Homes unter %LOCALAPPDATA%\CodexHomes\Codex{2,3} werden erkannt)
cat > ~/.connect/sidecar/accounts.json <<EOF
{
  "codex": {
    "default":  { "codex_home": null },
    "seo-bot":  { "codex_home": "C:/Users/Kunc GmbH/AppData/Local/CodexHomes/Codex2" },
    "researcher": { "codex_home": "C:/Users/Kunc GmbH/AppData/Local/CodexHomes/Codex3" }
  }
}
EOF

# Optional: API-Keys für andere Provider
cat > ~/.connect/sidecar/auth.env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
EOF
```

## 3. Reihenfolge der Phasen (siehe PLAN.md)

| Phase | Ziel | Aufwand |
|---|---|---|
| 0 | Vorbereitung (Cargo-Tauri, Docker-Image) | 1 h |
| 1 | Minimaler Sidecar-Loop: WS-Server + Container-Spawn | 1 Tag |
| 2 | Connect-Integration (Settings + Model Provider) | 0,5 Tag |
| 3 | Streaming-Output im Composer | 0,5 Tag |
| 4 | Codex + Manus + Grok Container | 1 Tag |
| 5 | Autostart + Verteilung | 0,5 Tag |
| 6 | Polish (Logs, Healthcheck, Quota) | 1 Tag |

## 4. Wichtige Datei-Anker im Repo

| Datei | Warum wichtig |
|---|---|
| `apps/desktop/src-tauri/Cargo.toml` | Dependencies (portable-pty ist schon drin) |
| `apps/desktop/src-tauri/src/main.rs` | Tray-App Haupteinstieg |
| `apps/desktop/src-tauri/src/tray.rs` | Tray-Icon-Asset |
| `apps/desktop/src-tauri/src/plan.rs` | **Referenz-Pattern** für PTY-Container-Spawn |
| `apps/app/src/lib/agents/agent-models.ts` | `AgentModelFamily` (claude, chatgpt, grok, manus) |
| `apps/app/src/components/settings/model-provider-settings.tsx` | Hier wird „Local PTY Bridge" eingefügt |

## 5. Wenn etwas nicht funktioniert

- PTY-Probleme auf Windows → `plan.rs` ist die Referenz
- Docker-Socket nicht erreichbar → `\\.\pipe\docker_engine` für bollard
- Container pullt ewig → Phase 1 zeigt Progress im Tray
- Connect redet nicht mit Sidecar → WS-Origin prüfen, Browser DevTools Network-Tab

## 6. Was du NICHT tust

- Keine zweite Desktop-App bauen. Wir erweitern `apps/desktop/`.
- Kein Electron, kein Wails, keine andere Bridge.
- Keine Manus-Container bevor Claude grün ist.
- Keine API-Key-Speicherung in `localStorage` der Tray-App. Tray-App liest nur ENV-Files.
- Keine globalen npm-Installationen auf dem User-Rechner. Alles im Container.