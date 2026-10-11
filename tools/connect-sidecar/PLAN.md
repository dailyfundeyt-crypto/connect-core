# Plan: Connect Sidecar — Tray-App für unsichtbare CLI-Bots

> Verbindet die AI-CLIs (codex, claude-code, manus-cli, grok-bot-cli) als unsichtbare,
> Hintergrund-Prozesse in die Connect-Web-App. Kein Terminal-Popup. Kein Docker, keine
> Container-Isolation — die CLIs laufen direkt auf deinem Rechner. Die Tray-App startet
> sie über `portable-pty` (das Pattern, das die bestehende `apps/desktop`-App für den
> Sign-In-Flow schon benutzt) und streamt das Ergebnis an Connect.

**Reihenfolge:** Codex zuerst (kleinster Container… äh, kleinstes Setup). Danach Claude,
Manus, Grok.

**Warum kein Docker mehr:** Der initiale Versuch, Docker-Images zu bauen, scheiterte an
einem `auth.docker.io` TLS-Timeout. Für ein dev-Tool, das nur lokal auf deinem Rechner
läuft, ist Docker-Isolation ohnehin überdimensioniert. Das Pattern, das wir jetzt fahren,
ist identisch zu dem, den `apps/desktop/src-tauri/src/plan.rs` schon für den Sign-In-
Flow nutzt — bewährter Code, kein neues Tooling.

---

## Was du am Ende hast

1. **Tray-Icon** (Connect-Logo) in deiner Windows-Taskleiste
2. **Menü**: Start / Stop pro Provider, Logs anschauen, Autostart an/aus
3. **Container pro Provider** (`agent-claude`, `agent-codex`, `agent-manus`, `agent-grok`) mit dem jeweiligen CLI
4. **WebSocket-Bridge** auf `127.0.0.1:3102`, an die Connect Chat sendet
5. **PTY-basierte Kopplung** — kein sichtbares Terminal, alles im Hintergrund
6. **In Connect**: unter *Settings → Model Provider* ein neuer Eintrag **"Local PTY Bridge"**, der auf die Sidecar zeigt
7. **+ Bot-Button**: neue Option "Provider-Bot" mit Drop-Down (Claude, Codex, Manus, Grok)

---

## Was du über dein System wissen musst

| Tool | Status | Pfad |
|---|---|---|
| Rust (cargo) | ✅ installiert | `C:\Users\Kunc GmbH\.cargo\bin\` |
| Node.js | ✅ installiert | `C:\Program Files\nodejs\` |
| Bun | ✅ installiert | `C:\Users\Kunc GmbH\.bun\bin\` |
| Docker | ✅ installiert (laut User) | — |
| Tauri CLI | ❌ fehlt | `cargo install tauri-cli --version "^2"` (~30 min Build) |
| `cargo tauri` | ❌ fehlt | wird mit `tauri-cli` mitinstalliert |

---

## Was bereits im Repo existiert (NICHT neu erfinden)

Diese Annahmen sind verifiziert, der Plan nutzt sie:

| Datei | Was | Wiederverwendung |
|---|---|---|
| `apps/desktop/src-tauri/Cargo.toml` | Tauri 2 + `portable-pty = "0.9.0"` + `tray-icon` | Dependencies sind da |
| `apps/desktop/src-tauri/src/main.rs` | Haupt-Binary `connect-desktop` | Erweitern, nicht ersetzen |
| `apps/desktop/src-tauri/src/tray.rs` | Tray-Icon-Asset | Wiederverwenden |
| `apps/desktop/src-tauri/src/plan.rs` | PTY-basierte Container-Spawn-Pipeline mit `portable_pty` | Pattern übernehmen |
| `apps/desktop/src-tauri/src/plan.rs:23-30` | `SIGN_IN_IMAGE = "agent-claude-sdk"` | Vorbild für neue Images |
| `apps/desktop/src-tauri/src/plan.rs:211-225` | `SigningIn` struct mit child/writer/output/master | Struktur 1:1 übernehmen |
| `apps/app/src/lib/agents/agent-models.ts` | `AgentModelFamily` Liste mit `claude`, `chatgpt`, `grok`, `manus` | Existiert, wir hängen nur eine Quelle dran |
| `apps/app/src/lib/agents/agent-api-keys.ts` | `getAgentClaudeKey`, `getAgentGrokKey` (soeben hinzugefügt) | Existiert |
| `apps/app/src/lib/agents/global-api-keys.ts` | Globale Keys pro Anbieter (Manus, Claude, Grok, …) | Existiert |
| `apps/app/src/components/settings/model-provider-settings.tsx` | Provider-Settings-Panel | Hier fügen wir „Local PTY Bridge" ein |
| `apps/app/src/lib/copilot/provider.tsx` | Hermes-Plan / Sandboxed-Tools Mounts | Mount-Punkte existieren |

**Entscheidung:** Wir erweitern die bestehende Tauri-App `connect-desktop` und fügen der
`AgentModelFamily` `chatgpt` (Codex) und `claude`/`grok`/`manus` jeweils eine **neue Quelle** hinzu
(`pty-bridge`). Wir erzeugen **keine** zweite Desktop-App, weil dann Tray doppelt vorhanden ist.

---

## Architektur

```
┌──────────────────────────────────────────────────────────────────┐
│  Connect (Browser) — http://localhost:3010                       │
│  ────────────────────────────────────────                        │
│  • Settings → Model Provider → „Local PTY Bridge"                │
│  • Agent: Family=claude, Source=pty-bridge                       │
│  • Composer sendet: ws://127.0.0.1:3102/providers/claude/messages│
└──────────────────────────────┬───────────────────────────────────┘
                               │ WebSocket
┌──────────────────────────────▼───────────────────────────────────┐
│  Connect-Desktop (Tauri) — Tray-App, lebt im System-Tray        │
│  ────────────────────────────────────────────────                │
│  • tray.rs erweitert: Menü „Start Claude / Stop Claude / Logs"   │
│  • Neue Datei: src-tauri/src/pty_bridge.rs                       │
│      - WebSocket-Server auf 127.0.0.1:3102 (tokio-tungstenite)   │
│      - Pro Provider ein „BridgeHandle" mit PTY-Master und Reader │
│      - Container-Manager: docker run, healthcheck, autorestart   │
│  • Container-Spawn via portable_pty (Pattern aus plan.rs)        │
└──────────────────────────────┬───────────────────────────────────┘
                               │ PTY (unsichtbar)
┌──────────────────────────────▼───────────────────────────────────┐
│  Docker-Container — pro Provider einer                            │
│  ──────────────────────────────────                              │
│  agent-claude    claude-code  (anthropics/claude-code)           │
│  agent-codex     codex        (openai/codex)                     │
│  agent-manus     manus-cli    (juan-xin-cai/manus-cli, geclont)  │
│  agent-grok      grok-bot-cli (ScriptedAlchemy/grok-bot-cli)     │
│                                                                  │
│  Container-Mounts:                                               │
│    -v %USERPROFILE%/.connect/sidecar/claude:/root/.claude   (Caches)│
│    -v %USERPROFILE%/.connect/sidecar/auth:/root/.connect/auth    │
│       (Env-Vars: ANTHROPIC_API_KEY, OPENAI_API_KEY, …)           │
└──────────────────────────────────────────────────────────────────┘
```

### NEUE ARCHITEKTUR (nach Docker-Drop)

```
┌──────────────────────────────────────────────────────────────────┐
│  Connect (Browser) — http://localhost:3010                       │
│  ────────────────────────────────────────                        │
│  • Settings → Model Provider → „Local PTY Bridge"                │
│  • Agent: Family=chatgpt, Source=pty-bridge                      │
│  • Composer sendet: ws://127.0.0.1:3102/providers/codex/messages │
└──────────────────────────────┬───────────────────────────────────┘
                               │ WebSocket
┌──────────────────────────────▼───────────────────────────────────┐
│  Connect-Desktop (Tauri) — Tray-App, lebt im System-Tray        │
│  ────────────────────────────────────────────────                │
│  • tray.rs erweitert: Menü „Start Codex / Stop Codex / Logs"     │
│  • Neue Datei: src-tauri/src/pty_bridge.rs                       │
│      - WebSocket-Server auf 127.0.0.1:3102 (tokio-tungstenite)   │
│      - Pro Provider ein „BridgeHandle" mit PTY-Master und Reader │
│      - Provider-Spawner: lokal installierte CLIs via portable-pty│
│  • Pattern: portable_pty (siehe apps/desktop/src-tauri/src/plan.rs)│
└──────────────────────────────┬───────────────────────────────────┘
                               │ PTY (unsichtbar)
┌──────────────────────────────▼───────────────────────────────────┐
│  Lokale CLIs (via npm install -g)                                │
│  ──────────────────────────────                                  │
│  @openai/codex          →  codex       (für chatgpt Family)      │
│  @anthropic-ai/claude-code → claude   (für claude Family)        │
│  manus-cli (geklont)    →  manus       (für manus Family)        │
│  grok-bot-cli (geklont) →  grok-bot    (für grok Family)         │
│                                                                  │
│  Aufruf: PTY-Master → codex exec --json "<msg>"                  │
│  Auth:   CODEX_HOME als ENV pro Agent (siehe Multi-Account-Block)│
└──────────────────────────────────────────────────────────────────┘
```

### Multi-Account per `CODEX_HOME`

Der Codex-CLI liest `$CODEX_HOME` als Basis für `auth.json`, Cache, History. Der User
hat bereits drei Instanzen unter `%LOCALAPPDATA%\CodexHomes\` eingerichtet (Pattern aus
`Documents\001_Mini Apps\000_Codex Start\Instanz-Register_files\apps.js`). Der Sidecar
ordnet jedem Connect-Agent einen dieser Pfade zu.

```
Connect-Agent: "seo-bot"     →  CODEX_HOME=…\CodexHomes\Codex2  → ChatGPT-Account #2
Connect-Agent: "code-helper" →  CODEX_HOME=…\CodexHomes\Codex3  → ChatGPT-Account #3
Connect-Agent: "default"     →  CODEX_HOME=$USERPROFILE\.codex  → Original-Login
```

Die Zuordnung lebt in `~/.connect/sidecar/accounts.json`. Der Sidecar liest sie beim
Start und übergibt `CODEX_HOME` per `CommandBuilder::env` an den PTY-Spawn. So bekommt
jeder Agent automatisch seinen eigenen Login — ohne dass der Sidecar je ein Token
anfasst.

### Nachrichten-Protokoll zwischen Connect ↔ Sidecar

JSON-Lines über WebSocket. Eine Verbindung pro Provider-Session.

**Client → Sidecar:**
```json
{"type":"start","provider":"claude","agent_id":"seo-agent","model":"claude-sonnet"}
{"type":"message","id":"m1","content":"Schreibe eine Meta-Beschreibung"}
{"type":"stop","id":"m1"}
```

**Sidecar → Client:**
```json
{"type":"ready","provider":"claude","pid":1234}
{"type":"output","id":"m1","delta":"Die Meta-Beschreibung..."}
{"type":"output","id":"m1","delta":" ist 156 Zeichen."}
{"type":"done","id":"m1","exit_code":0}
{"type":"error","id":"m1","message":"container failed to start: …"}
```

`type=output` ist Streaming — Connect zeigt es im Chat als Live-Text an.

---

## Verzeichnisstruktur (was im Repo entsteht)

```
apps/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── pty_bridge.rs              ← NEU: WebSocket-Server + Container-Mgmt
│   │   ├── pty_session.rs             ← NEU: pro-Session PTY-Logik
│   │   ├── container_providers.rs     ← NEU: Docker-Spawn-Logik pro Provider
│   │   ├── tray.rs                    ← ERWEITERN: Menü um Provider-Status
│   │   ├── main.rs                    ← ERWEITERN: pty_bridge beim Start laden
│   │   ├── lib.rs                     ← ERWEITERN: pub mod pty_bridge
│   │   └── plan.rs                    ← NICHT anfassen, dient als Referenz
│   └── Cargo.toml                     ← ERWEITERN: tokio-tungstenite, bollard
│
tools/connect-sidecar/                 ← NEU (Top-Level-Tool)
├── README.md
├── docker/
│   ├── Dockerfile.claude              ← Node + @anthropic-ai/claude-code
│   ├── Dockerfile.codex               ← Node + @openai/codex
│   ├── Dockerfile.manus               ← git clone juan-xin-cai/manus-cli + bun
│   ├── Dockerfile.grok                ← git clone ScriptedAlchemy/grok-bot-cli + bun
│   └── entrypoint.sh                  ← common: startet CLI mit TTY, json-lines output
├── scripts/
│   ├── build-images.ps1               ← docker build für alle vier
│   ├── start-sidecar.ps1              ← dev: spawnt Tauri im Debug
│   └── install-autostart.ps1          ← Windows: legt Sidecar in den Autostart
└── tests/
    └── container-e2e.test.mjs         ← bun:test, spawnt Sidecar, sendet WS
│
apps/app/src/
├── lib/agents/
│   ├── agent-models.ts                ← ERWEITERN: neue Source „pty-bridge"
│   ├── pty-bridge-client.ts           ← NEU: WS-Client (browser-seitig)
│   └── pty-bridge-types.ts            ← NEU: WS-Protokoll als TS-Typen
├── lib/agents/dispatch/
│   └── pty-bridge-dispatch.ts         ← NEU: hookt in shell-dispatch.ts
├── components/settings/
│   └── pty-bridge-settings.tsx        ← NEU: Settings-Panel mit Status + Logs
└── components/agents/
    └── pty-bridge-bot-card.tsx        ← NEU: Agent-View mit Live-Output
```

---

## Reihenfolge der Umsetzung

**Phase 0 — Vorbereitung (15 min, kein Docker mehr)**
1. `cargo install tauri-cli --version "^2"` (manuell, dauert 30 min)
2. `npm install -g @openai/codex` lokal
3. Funktioniert `codex --version` direkt in der Shell?

**Phase 1 — Minimaler Sidecar-Loop (1 Tag)**
1. `apps/desktop/src-tauri/Cargo.toml` ergänzen um `tokio-tungstenite`, `parking_lot`
2. `pty_bridge.rs` schreiben:
   - WS-Server auf 127.0.0.1:3102
   - Auf `start`-Message: PTY-Spawn von `codex exec --json "<msg>"`
   - PTY-Master lesen, jede Zeile als `output`-JSON-Frame senden
   - Auf `stop`: `child.kill()`
3. `tray.rs` Menüpunkt „Codex: Off" → Click startet Container, Status ändert sich zu „On"
4. `cargo tauri dev` von `apps/desktop/` startet Tray → Logs landen in Konsole

**Phase 2 — Connect-Integration (0,5 Tag)**
1. `pty-bridge-types.ts` mit dem WS-Protokoll
2. `pty-bridge-client.ts` als dünner WS-Wrapper
3. `pty-bridge-settings.tsx` in `model-provider-settings.tsx` einhängen
4. Test: Connect öffnen → Model Provider = „Local PTY Bridge" → Agent mit Family=claude → Nachricht senden → Antwort erscheint

**Phase 3 — Streaming-Output im Chat (0,5 Tag)**
1. `pty-bridge-dispatch.ts` hängt in `shell-dispatch.ts` ein
2. Chat-View zeigt Live-Deltas (gleicher Pfad wie Manus-Stream heute)
3. `interruptWhileBusy` (Hermes-Logik) funktioniert auch für PTY-Sessions

**Phase 4 — Codex + Manus + Grok (1 Tag)**
1. Dockerfiles für die drei anderen CLIs
2. `container_providers.rs` generalisieren
3. Test jeder Provider einzeln

**Phase 5 — Autostart + Verteilung (0,5 Tag)**
1. `install-autostart.ps1` legt Sidecar in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
2. `cargo tauri build` für Release
3. README mit Install-Anleitung

**Phase 6 — Polish**
- Logs im Tray-Menü
- Container-Healthcheck, Auto-Restart
- Quota-Anzeige pro Provider
- Fehler-Toast bei Container-Crash

---

## Konkrete Code-Skizzen (damit der nächste Agent anfangen kann)

### 1. `apps/desktop/src-tauri/Cargo.toml` (Ergänzung)

```toml
[dependencies]
# … vorhandene Einträge …
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"
bollard = "0.15"          # Docker-API Client
parking_lot = "0.12"
```

### 2. `pty_bridge.rs` (Skeleton)

```rust
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::Manager;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

type SessionId = String;

pub struct PtyBridge {
    sessions: Arc<Mutex<HashMap<SessionId, Session>>>,
}

struct Session {
    provider: String,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn std::io::Write + Send>,
    _master: Box<dyn portable_pty::MasterPty + Send>,
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
enum ClientMsg {
    #[serde(rename = "start")]
    Start { provider: String, agent_id: String, prompt: String },
    #[serde(rename = "message")]
    Message { id: String, content: String },
    #[serde(rename = "stop")]
    Stop { id: String },
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
enum ServerMsg<'a> {
    #[serde(rename = "ready")]
    Ready { provider: &'a str, container_id: &'a str },
    #[serde(rename = "output")]
    Output { id: &'a str, delta: &'a str },
    #[serde(rename = "done")]
    Done { id: &'a str, exit_code: i32 },
    #[serde(rename = "error")]
    Error { id: &'a str, message: &'a str },
}

pub async fn run(app: tauri::AppHandle) {
    let listener = TcpListener::bind("127.0.0.1:3102").await.unwrap();
    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let bridge = app.state::<Arc<PtyBridge>>().inner().clone();
        tokio::spawn(handle_connection(bridge, stream));
    }
}

async fn handle_connection(bridge: Arc<PtyBridge>, stream: TcpStream) {
    let ws = tokio_tungstenite::accept_async(stream).await.unwrap();
    // … lese ClientMsg → spawn container → stream output zurück
}
```

### 3. `apps/desktop/src-tauri/Cargo.toml` (Ergänzung)

```toml
[dependencies]
# … vorhandene Einträge …
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"
parking_lot = "0.12"
```

### 4. Provider-Spawn (kein Docker)

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

pub fn spawn_codex(prompt: String, env: &[(String, String)]) -> Session {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 24, cols: 120, pixel_width: 0, pixel_height: 0 }).unwrap();
    let mut cmd = CommandBuilder::new("codex");
    cmd.arg("exec");
    cmd.arg("--quiet");
    cmd.arg("--json");
    cmd.arg(prompt);
    cmd.env("OPENAI_API_KEY", env_value("OPENAI_API_KEY"));
    let child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave); // Master reicht
    let reader = pair.master.try_clone_reader().unwrap();
    Session { child, writer: pair.master.take_writer().unwrap(), reader, _master: pair.master }
}
```

### 5. Connect-Seite: `pty-bridge-client.ts`

```typescript
export type ClientMsg =
  | { type: "start"; provider: string; agent_id: string }
  | { type: "message"; id: string; content: string }
  | { type: "stop"; id: string };

export type ServerMsg =
  | { type: "ready"; provider: string; container_id: string }
  | { type: "output"; id: string; delta: string }
  | { type: "done"; id: string; exit_code: number }
  | { type: "error"; id: string; message: string };

export class PtyBridgeClient {
  private ws: WebSocket | null = null;
  constructor(private url = "ws://127.0.0.1:3102") {}
  connect() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws!.onmessage = (e) => this.onMessage?.(JSON.parse(e.data));
    });
  }
  onMessage?: (msg: ServerMsg) => void;
  send(msg: ClientMsg) { this.ws!.send(JSON.stringify(msg)); }
}
```

### 6. Settings-Eintrag (in `model-provider-settings.tsx` einhängen)

```tsx
const SOURCES = [
  { id: "auto", label: "Auto (Server-Routing)" },
  { id: "pty-bridge", label: "Local PTY Bridge (Sidecar Tray-App)" },
  { id: "api-key", label: "API-Key direkt" },
] as const;

// Im bestehenden Provider-Switcher als zusätzliche Option ergänzen.
```

---

## Test-Plan

1. **Container-Smoke**:
   ```bash
   docker run -i agent-claude < test-message.json
   # Erwartet: {"type":"output",…} auf stdout
   ```
2. **Sidecar-WS-Smoke**:
   ```bash
   # In tools/connect-sidecar/tests/container-e2e.test.mjs
   const ws = new WebSocket("ws://127.0.0.1:3102");
   ws.send(JSON.stringify({type:"start",provider:"claude",agent_id:"test"}));
   ws.send(JSON.stringify({type:"message",id:"m1",content:"Hi"}));
   # Erwartet: ready, output, done in <30s
   ```
3. **End-to-End**:
   - Tray starten → Claude-Status = grün
   - Connect öffnen → Settings → Model Provider = „Local PTY Bridge" → Claude
   - + Bot → Provider-Bot → Claude
   - Nachricht: „Schreibe ein Haiku" → Live-Stream im Chat → 3 Zeilen

---

## Bekannte Risiken (nicht verschweigen)

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| `portable_pty` und `tokio` vertragen sich nicht ohne `spawn_blocking` | Hoch | Alle PTY-Reads in `tokio::task::spawn_blocking` |
| `bollard` (Docker-API) braucht Docker-Socket auf Windows: `\\.\pipe\docker_engine` | Mittel | `bollard::Docker::connect_with_socket_defaults()` |
| ConPTY vs WinPTY auf Windows | Mittel | `portable-pty` wählt automatisch; Tests laufen |
| Container-Image-Pull dauert beim ersten Start | Hoch | Tray zeigt „Pulling Claude 340 MB…" mit Progress |
| Codex/OpenAI lehnt Custom-Container-Origin ab | Niedrig | Key wird via ENV, nicht Origin übergeben |
| Manus-CLI ist GitHub-Repo, kein npm | Hoch | Dockerfile cloned via `git clone`, npm install im Image |
| Grok-Bot-CLI ebenso | Hoch | Gleich wie Manus |
| WS-Origin-Check im Browser | Mittel | `ws://127.0.0.1:3102` ist same-origin-lokal, Browser lässt durch |

---

## Was du **vor dem Coden** entscheiden solltest

- **Wo läuft die Tauri-App?** Lokal auf deinem Rechner oder in einem Container?
  → Auf deinem Rechner, der den Docker startet. Nicht im Container.
- **Auth-Tokens wo?** In `~/.connect/sidecar/auth/` als ENV-File, gemountet in den Container.
  → Alternativ: jeder Container holt sich seinen Key via `docker exec` von einem lokalen
  Secret-Store. ENV-File ist einfacher und für lokal OK.
- **Mehrere Connect-Instanzen?** Soll der Sidecar Multi-Tenancy unterstützen (mehrere Browser-Tabs)?
  → Phase 1 nicht. Eine WS-Verbindung genügt. Später ROUTING-Schlüssel im Protokoll.
- **Provider-Vertrag pro CLI** — claude-code, codex, manus-cli und grok-bot-cli haben
  **unterschiedliche Output-Formate**. claude-code hat `--output-format stream-json`,
  Codex hat `--json`, die anderen nicht. Der Entry-Point pro Container normalisiert das
  in das `entrypoint.sh` Pattern oben.
  → Pro Container ein eigenes Wrapper-Script, alle schreiben JSON-Lines.

---

## Anweisungen für den nächsten Agent

1. **Lies diese Datei ganz.**
2. **Verifiziere, dass die in „Was bereits im Repo existiert" genannten Dateien noch so aussehen.**
   Insbesondere: `portable-pty` ist in `Cargo.toml`, `agent-claude-sdk` ist in `plan.rs`.
3. **Starte mit Phase 0**: Cargo-Tauri-CLI installieren, `agent-claude` Image bauen, Smoke-Test.
4. **Dann Phase 1**: `pty_bridge.rs` schreiben. Nutze `plan.rs` als Referenz für die PTY-Mechanik.
5. **Phasen nur weitergehen, wenn die vorherige grün ist.** Typecheck, Build, Browser-Test.
6. **Bei Unklarheit**: Plan fragen, nicht raten. Der User hat diesen Plan explizit angefordert,
   damit er den Code notfalls selbst oder durch einen anderen Agent weitertreiben kann.
7. **Nicht eigenmächtig auf Electron oder Wails umsteigen.** Tauri ist die Entscheidung.
8. **Nicht eigenmächtig Manus- oder Grok-Container bauen, bevor Claude läuft.**

---

## Zusammenfassung in einem Satz

Wir bauen eine Tauri-Tray-App, die in Docker-Containern claude-code / codex / manus-cli / grok-bot-cli
über PTY startet, sie über einen lokalen WebSocket-Server mit Connect reden lässt und das so tut,
dass kein Terminal-Fenster aufpoppt — Connect sendet eine Nachricht, die Tray-App leitet sie in den
Container weiter, der Container-Output kommt als Stream zurück in den Chat.
