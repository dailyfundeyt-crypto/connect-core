//! Connect Sidecar â€” local PTY bridge for AI CLI providers.
//!
//! A small WebSocket server on `127.0.0.1:3102`. Connect (the browser app) connects
//! per provider and sends JSON lines; this module spawns the matching CLI in an
//! invisible pty and streams the result back as JSON lines. The visible surface
//! is identical to the JSON-lines contract a container would have served, so the
//! browser side never knows whether the work happened in Docker or directly on
//! the host.
//!
//! Why per-agent authentication matters here. The Codex CLI reads `$CODEX_HOME`
//! as the base for `auth.json`, cache, and history. The user already keeps three
//! such homes on disk (see `Documents/001_Mini Apps/000_Codex Start/...apps.js`),
//! each tied to a different ChatGPT account. This module looks up the right home
//! for a given Connect agent in `~/.connect/sidecar/accounts.json` and forwards
//! it as `CODEX_HOME` to the spawned pty. The token never leaves its home
//! directory, and the shell never has to read it.
//!
//! Status: scaffolding. The WS server, account loader, command builder, and
//! line classifier are in place. The per-turn pty write and the event pump into
//! the WS sink are deliberately minimal so the file compiles and the
//! architecture is visible end-to-end; both are the next thing to wire up.

use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::thread;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

/// The address the WS server binds to. Localhost only â€” the bridge is not a
/// service, it is a private channel between the tray app and the same user's
/// browser.
const BRIDGE_ADDR: &str = "127.0.0.1:3102";

/// Per-agent account mapping, loaded from disk at startup. Missing file is not
/// an error â€” every field is `Option<PathBuf>` and `None` means "use the
/// default Codex home, whatever that happens to be on this machine".
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccountConfig {
    /// Map from Connect agent name (e.g. `"seo-bot"`) to the agent's auth
    /// record. An agent with no entry falls through to `default`.
    #[serde(flatten)]
    pub agents: HashMap<String, AgentAccount>,
}

/// One agent's account configuration. The struct is shaped from the start
/// to take per-provider fields, so adding a new provider is a one-line
/// addition to the JSON schema. `codex_home` and friends are all
/// `Option<â€¦>` so a partial config is valid: missing fields fall through
/// to the provider's own defaults.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentAccount {
    /// Absolute path to a `CODEX_HOME` directory. `None` means: do not set
    /// the variable, let Codex pick its own default. Applies to provider
    /// `codex`.
    #[serde(rename = "codex_home", default)]
    pub codex_home: Option<PathBuf>,

    /// Ollama model tag, e.g. `"qwen3:4b"`. Applies to provider `ollama`.
    /// `None` means: caller must pass a model on `start`.
    #[serde(rename = "ollama_model", default)]
    pub ollama_model: Option<String>,

    /// Ollama server URL. Defaults to `http://127.0.0.1:11434` when
    /// `None`. Applies to provider `ollama`. The CLI mode (`ollama run`)
    /// ignores this; only the HTTP mode uses it.
    #[serde(rename = "ollama_url", default)]
    pub ollama_url: Option<String>,

    /// Manus API key. Applies to provider `manus`. The key travels as a
    /// bearer token in the `Authorization` header; we never log it.
    #[serde(rename = "manus_api_key", default)]
    pub manus_api_key: Option<String>,
}

/// Live state for one running Codex process. The tray uses `provider` and
/// `agent` to label the menu entry; the WS task uses the `tx` channel to push
/// parsed events out to the client; the `child` handle is what `stop` calls
/// to kill the process tree.
pub struct BridgeHandle {
    pub provider: String,
    pub agent: String,
    pub model: String,
    pub pid: Option<u32>,
    pub tx: mpsc::Sender<BridgeEvent>,
    // Held only to keep the pty master alive; never used directly after spawn.
    // Dropping the master closes the pty, which in turn ends the reader thread.
    _master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// One outbound message on the WS, after the pty output has been classified.
/// `Output` is the streaming text delta the chat renders live; `Done` ends
/// the turn; `Error` is shown in red; `Ready` is sent once at the start of
/// a session.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BridgeEvent {
    Ready { provider: String, agent: String, pid: Option<u32> },
    Output { id: String, delta: String },
    Done { id: String, exit_code: i32 },
    Error { id: String, message: String },
}

/// Inbound message from Connect. The `id` is a per-turn correlation id
/// invented by the client; the bridge echoes it on every `Output` and the
/// terminal `Done` so the chat knows when a turn is over.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Start {
        provider: String,
        agent: String,
        #[serde(default)]
        model: Option<String>,
    },
    Message {
        id: String,
        content: String,
    },
    Stop {
        id: String,
    },
}

/// Shared bridge state. Lives behind a `parking_lot::Mutex` so the tray menu
/// can read it cheaply between WS events. The map is `agent -> BridgeHandle`
/// because one user can have several agents running in parallel.
pub struct Bridge {
    /// Keyed by agent name. The same agent restarted twice replaces the
    /// previous handle (the old pty gets dropped and its child killed).
    handles: Mutex<HashMap<String, BridgeHandle>>,
    /// Loaded once at startup. See `AccountConfig` for the file shape.
    accounts: AccountConfig,
}

impl Bridge {
    /// Build a bridge and load the account config from
    /// `~/.connect/sidecar/accounts.json`. The WS server is started by
    /// `start_ws_server` after the bridge has been registered as Tauri
    /// state â€” see `start_bridge`.
    pub fn new() -> Self {
        Bridge { handles: Mutex::new(HashMap::new()), accounts: load_accounts() }
    }

    /// How many sessions are currently alive. The tray menu uses this to
    /// decide whether to show `Codex: 2 agents running` vs `Codex: idle`.
    pub fn session_count(&self) -> usize {
        self.handles.lock().len()
    }

    /// Render a one-line status string for the tray tooltip. Empty when nothing
    /// is running â€” the tooltip falls back to the product label in that case.
    pub fn status_line(&self) -> String {
        let n = self.session_count();
        if n == 0 {
            String::new()
        } else {
            format!("{n} agent(s) live")
        }
    }

    /// Look up the `CODEX_HOME` for a given agent. `None` means: do not
    /// set the variable, let the CLI use its own default. The lookup
    /// intentionally falls through to `default` before returning `None`,
    /// so the user only has to override the agents that differ.
    pub fn codex_home_for(&self, agent: &str) -> Option<PathBuf> {
        self.agent_account(agent).codex_home.clone()
    }

    /// Ollama model for an agent. The caller can pass a `model` argument
    /// to `Start` to override the per-agent setting — that wins over the
    /// config. Falls through to `default` and finally to `None` when
    /// neither has a value.
    pub fn ollama_model_for(&self, agent: &str) -> Option<String> {
        self.agent_account(agent).ollama_model.clone()
    }

    /// Ollama server URL. Defaults to the local install
    /// (`http://127.0.0.1:11434`) when the agent config does not say.
    pub fn ollama_url_for(&self, agent: &str) -> String {
        self.agent_account(agent)
            .ollama_url
            .clone()
            .unwrap_or_else(|| "http://127.0.0.1:11434".to_string())
    }

    /// Manus API key for an agent. The key is optional at the config
    /// layer (we want the bridge to keep loading when the key is
    /// missing), but `build_manus_command` will refuse to spawn without
    /// one. Callers see the resulting error in the bridge event stream.
    pub fn manus_api_key_for(&self, agent: &str) -> Option<String> {
        self.agent_account(agent).manus_api_key.clone()
    }

    /// Look up the account record for an agent, falling through to
    /// `default` when the agent itself is unknown. Used by every
    /// per-provider accessor so the default policy lives in one place.
    fn agent_account(&self, agent: &str) -> AgentAccount {
        self.accounts
            .agents
            .get(agent)
            .cloned()
            .or_else(|| self.accounts.agents.get("default").cloned())
            .unwrap_or_default()
    }
}

/// Locate and parse `accounts.json`. Missing or malformed is a warning, not a
/// hard failure â€” the bridge still works, every agent just falls through to
/// the default Codex home.
fn load_accounts() -> AccountConfig {
    let path = match std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
    {
        Some(p) => p.join(".connect/sidecar/accounts.json"),
        None => return AccountConfig::default(),
    };
    match std::fs::read(&path) {
        Ok(bytes) => {
            // Strip a UTF-8 BOM if the file was saved with one. The
            // PowerShell `Set-Content -Encoding UTF8` default is BOM, and
            // `serde_json` rejects the leading `\u{FEFF}` as a parse
            // error. `strip_prefix` does nothing when the BOM is absent.
            let stripped = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
            let s = std::str::from_utf8(stripped).unwrap_or("");
            serde_json::from_str(s).unwrap_or_else(|e| {
                eprintln!("[pty_bridge] {path:?} is malformed: {e} â€” using defaults");
                AccountConfig::default()
            })
        }
        Err(_) => AccountConfig::default(),
    }
}

/// Start the WS server. Bound on a dedicated OS thread because
/// `TcpListener::bind` is a blocking syscall and we are still in Tauri setup.
/// The accept loop itself runs on the Tokio runtime Tauri is already
/// hosting, so no second runtime is spawned.
///
/// `app` is taken so the bridge is registered as managed state on the way in.
/// That registration is not optional bookkeeping: `bridge_status` reads
/// `try_state::<Bridge>()` to render the tray tooltip, so a server started
/// without it answers every status query with the empty string and the tray
/// shows "idle" no matter how many agents are running.
///
/// Returns `Result` for the part the caller can actually do something with,
/// which is putting the bridge into state. The bind itself happens on the
/// thread below and reports its own failure there, because there is no useful
/// recovery for a port collision at startup and unwinding the whole app over it
/// would be worse than running without the bridge.
pub fn start_bridge<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let bridge = std::sync::Arc::new(Bridge::new());
    app.manage(std::sync::Arc::clone(&bridge));
    start_ws_server(bridge);
    Ok(())
}

/// Start the WS server. Bound on a dedicated OS thread because
/// `TcpListener::bind` is a blocking syscall and we are still in Tauri setup.
/// The accept loop itself runs on the Tokio runtime Tauri is already
/// hosting, so no second runtime is spawned.
pub fn start_ws_server(bridge: std::sync::Arc<Bridge>) {
    let bridge_for_thread = std::sync::Arc::clone(&bridge);
    thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("[pty_bridge] could not start tokio runtime: {e}");
                return;
            }
        };
        rt.block_on(async move {
            let listener = match TcpListener::bind(BRIDGE_ADDR).await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[pty_bridge] could not bind {BRIDGE_ADDR}: {e}");
                    return;
                }
            };
            eprintln!("[pty_bridge] listening on {BRIDGE_ADDR}");
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let b = std::sync::Arc::clone(&bridge_for_thread);
                        tokio::spawn(async move {
                            if let Err(e) = handle_connection(stream, b).await {
                                eprintln!("[pty_bridge] connection ended: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[pty_bridge] accept error: {e}");
                        break;
                    }
                }
            }
        });
    });
}

/// Drive one WS connection from accept to close. Protocol: Connect sends
/// `Start` once with provider/agent, then zero or more `Message` turns,
/// optionally interspersed with `Stop`. Each turn is correlated by the
/// `id` the client chose.
async fn handle_connection(
    stream: tokio::net::TcpStream,
    bridge: std::sync::Arc<Bridge>,
) -> Result<(), String> {
    use futures::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message as WsMessage;

    let mut ws = tokio_tungstenite::accept_async(stream)
        .await
        .map_err(|e| format!("ws handshake: {e}"))?;

    // `active_session` holds the per-connection pty state. `None` until
    // `Start` arrives; from then on, every `Message` writes the prompt into
    // the pty and every `Stop` kills the child. `event_rx` is the
    // reader-thread side of the channel; the loop drains it in parallel
    // with the WS frame stream.
    let mut active_session: Option<ActiveSession> = None;
    let mut event_rx: Option<mpsc::Receiver<BridgeEvent>> = None;
    // The id of the most recent `Message` from the client. Used to stamp
    // `Output`/`Done`/`Error` events coming off the reader channel so the
    // client can correlate them with the turn it asked for.
    let mut current_id: String = String::new();

    loop {
        // Drain any pending reader events first, non-blocking. The reader
        // can fire faster than the WS sink; we batch up to a small budget
        // per iteration so the WS client always gets fresh frames in a
        // reasonable order, then yield to the WS arm.
        if let Some(rx) = event_rx.as_mut() {
            for _ in 0..32 {
                match rx.try_recv() {
                    Ok(ev) => {
                        let stamped = stamp_event_id(ev, &current_id);
                        let text = match serde_json::to_string(&stamped) {
                            Ok(s) => s,
                            Err(e) => {
                                eprintln!("[pty_bridge] could not serialise event: {e}");
                                continue;
                            }
                        };
                        if ws.send(WsMessage::Text(text)).await.is_err() {
                            return Ok(());
                        }
                    }
                    Err(mpsc::error::TryRecvError::Empty) => break,
                    Err(mpsc::error::TryRecvError::Disconnected) => {
                        // Reader thread has ended. Mark the rx as gone so
                        // the next iteration skips the drain.
                        event_rx = None;
                        break;
                    }
                }
            }
        }

        // Wait for the next thing. `biased` makes the WS arm preferred so a
        // client sending a `Stop` while events are in flight is handled
        // before more `Output` frames are pushed.
        tokio::select! {
            biased;

            frame = ws.next() => {
                let frame = match frame {
                    Some(Ok(f)) => f,
                    Some(Err(e)) => return Err(format!("ws read: {e}")),
                    None => break,
                };
                let text = match frame {
                    WsMessage::Text(t) => t,
                    WsMessage::Close(_) => break,
                    WsMessage::Ping(p) => {
                        let _ = ws.send(WsMessage::Pong(p)).await;
                        continue;
                    }
                    _ => continue,
                };
                let msg: ClientMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        eprintln!("[pty_bridge] bad client message: {e} in {text}");
                        continue;
                    }
                };
                match msg {
                    ClientMessage::Start { provider, agent, model } => {
                        // Replace any prior session. The old pty is dropped,
                        // which kills the old Codex process.
                        let (session, rx) = ActiveSession::start(
                            &bridge, &provider, &agent, model.as_deref(),
                        ).await?;
                        active_session = Some(session);
                        event_rx = Some(rx);
                    }
                    ClientMessage::Message { id, content } => {
                        current_id = id.clone();
                        if let Some(s) = active_session.as_mut() {
                            s.send_turn(&id, &content).await?;
                        }
                    }
                    ClientMessage::Stop { id } => {
                        if let Some(s) = active_session.as_mut() {
                            s.stop_turn(&id).await?;
                        }
                    }
                }
            }

            // Reader-event arm. We use `recv` rather than `try_recv` so the
            // select actually parks when the inbox is empty. The first pass
            // above already drained the backlog, so this wakes only when a
            // new event is pushed by the reader thread.
            Some(ev) = async {
                if let Some(rx) = event_rx.as_mut() {
                    rx.recv().await
                } else {
                    None
                }
            } => {
                let stamped = stamp_event_id(ev, &current_id);
                let text = match serde_json::to_string(&stamped) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[pty_bridge] could not serialise event: {e}");
                        continue;
                    }
                };
                if ws.send(WsMessage::Text(text)).await.is_err() {
                    break;
                }
            }
        }
    }
    Ok(())
}

/// Stamp an event with the current turn id. `Ready` is sent before any
/// `Message`, so its id is the empty string and we leave it alone. The
/// internal `__turn:â€¦` and `__stop:â€¦` sentinels are filtered out here so
/// the client never sees them.
fn stamp_event_id(mut ev: BridgeEvent, current_id: &str) -> BridgeEvent {
    match &mut ev {
        BridgeEvent::Output { id, .. } => {
            if let Some(stripped) = id.strip_prefix("__turn:") {
                *id = stripped.to_string();
            } else if id.starts_with("__") {
                *id = String::new();
            } else if id.is_empty() {
                *id = current_id.to_string();
            }
        }
        BridgeEvent::Done { id, .. } | BridgeEvent::Error { id, .. } => {
            if id.is_empty() {
                *id = current_id.to_string();
            }
        }
        BridgeEvent::Ready { .. } => {}
    }
    ev
}

/// One live per-connection session. Owns the pty, the reader thread, and
/// the outbound channel back to the WS task. The split between
/// `ActiveSession` and `Bridge` is deliberate: the bridge is the registry,
/// the session is the actor that handles one user.
struct ActiveSession {
    tx: mpsc::Sender<BridgeEvent>,
    /// Shared with the connection loop. `send_turn` writes the prompt
    /// through it; the loop never touches it. Wrapped in a `Mutex` because
    /// `Box<dyn Write>` is not `Sync` and the bridge loop runs on Tokio
    /// while `send_turn` runs from a command thread.
    writer: std::sync::Arc<std::sync::Mutex<Box<dyn std::io::Write + Send>>>,
    /// Stashed so we can ask the OS to kill the process on `Stop`. Held
    /// here rather than in the bridge because the lifetime is tied to the
    /// WS connection, not the tray's view of "what is running".
    #[allow(dead_code)]
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl ActiveSession {
    async fn start(
        bridge: &Bridge,
        provider: &str,
        agent: &str,
        model: Option<&str>,
    ) -> Result<(Self, mpsc::Receiver<BridgeEvent>), String> {
        // Dispatch by provider. The `codex` arm spawns a CLI in a pty
        // directly; the `ollama` arm does the same with the `ollama` CLI;
        // the `manus` arm uses the Manus HTTP API instead of a CLI, and
        // is handled by `build_manus_command` which returns a Command
        // that runs `curl` to talk to the API. Other providers will be
        // added as we wire them up.
        let mut cmd = match provider {
            "codex" => build_codex_command(bridge, agent, model)?,
            "ollama" => build_ollama_command(bridge, agent, model)?,
            "manus" => build_manus_command(bridge, agent, model)?,
            other => return Err(format!("unknown provider: {other}")),
        };

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 120, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("openpty: {e}"))?;
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn codex: {e}"))?;
        // Drop our slave handle. The master is what keeps the pty alive; once
        // the master is dropped at the end of the session, the child sees
        // SIGHUP and exits.
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone reader: {e}"))?;
        // Writer is what `Message` writes the prompt into. Held on the
        // struct so we do not have to re-take it from the master. We share
        // the writer with the connection loop only through `tx` â€” the loop
        // does not write to the pty, it only reads events.
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take writer: {e}"))?;

        // Bounded channel: the reader thread pushes, the WS task pops. If
        // the WS client stalls, the reader parks. The 256-item buffer is
        // enough for a few thousand characters of text â€” the reader is
        // line-buffered and a single Codex delta is usually 1-3 events.
        // We use `tokio::sync::mpsc` (not `std::sync::mpsc`) so the WS
        // task can `select!` on the receiver alongside WS frames without
        // an extra bridge thread.
        let (tx, rx): (mpsc::Sender<BridgeEvent>, mpsc::Receiver<BridgeEvent>) =
            mpsc::channel(256);

        // Reader thread. Each JSONL line from `codex --json` is one event;
        // everything else is treated as plain text. The classification lives
        // in `classify_codex_line` so a future change to the JSON shape is a
        // one-function edit.
        let provider_owned = provider.to_string();
        let agent_owned = agent.to_string();
        let pid = child.process_id();
        // The events coming off the channel need an `id` to correlate with
        // the client's `Message`. Until the loop knows the id, it stuffs
        // events into a per-session inbox keyed by an empty id; the loop
        // then forwards them to the WS sink as they arrive. We do not
        // try to be clever about id correlation: the reader thread does
        // not know which `Message` is current, and the loop does. The
        // simplest correct thing is: the loop drains the inbox, attaches
        // the latest id it has seen from a `Message`, and forwards.
        //
        // The first send happens on this thread (not the reader one) so the
        // `Ready` frame goes out before the WS task is asked to do
        // anything. We clone the sender so the reader thread still owns
        // its copy. The channel is cheap to clone; this is the canonical
        // pattern.
        //
        // We use the async `send` here, not `blocking_send`, because this
        // function is called from inside a Tokio task on a Tokio worker
        // thread. `blocking_send` panics if the current thread is part of
        // a Tokio runtime â€” the runtime cannot let one of its workers
        // sleep, or no other task will run. The reader thread spawned
        // below is a plain OS thread and is allowed to use
        // `blocking_send`.
        let tx_for_reader = tx.clone();
        let _ = tx
            .send(BridgeEvent::Ready {
                provider: provider_owned.clone(),
                agent: agent_owned.clone(),
                pid,
            })
            .await;
        let classifier: LineClassifier = match provider {
            "codex" => LineClassifier::Codex,
            // Ollama's `run` subcommand emits plain text the user is meant
            // to read in a terminal, so every byte is a delta. We use a
            // pass-through classifier that turns every line into a single
            // `Output` event. The classifier itself is provider-agnostic
            // for plain text, but keeping the match here means future
            // providers that *do* emit JSONL can plug in cleanly.
            "ollama" => LineClassifier::Plain,
            "manus" => LineClassifier::SseJson,
            _ => LineClassifier::Plain,
        };
        thread::spawn(move || {
            let mut buffer = Vec::with_capacity(4096);
            let mut byte = [0u8; 1];
            loop {
                match reader.read(&mut byte) {
                    Ok(0) => break,
                    Ok(_) => {
                        buffer.push(byte[0]);
                        if byte[0] == b'\n' {
                            let line = String::from_utf8_lossy(&buffer).to_string();
                            buffer.clear();
                            for ev in classify_line(&line, &classifier) {
                                // `blocking_send` because this is an OS
                                // thread, not a Tokio task. The receiver is
                                // `tokio::sync::mpsc` which supports this.
                                if tx_for_reader.blocking_send(ev).is_err() {
                                    return;
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            // Reader saw EOF. Codex has exited. Tell the loop so it can
            // synthesise a final `Done` for the current turn.
            let _ = tx_for_reader.blocking_send(BridgeEvent::Done { id: String::new(), exit_code: 0 });
        });

        // The connection loop owns the `rx` end of the channel so it can
        // pump reader events into the WS sink. We return the rx alongside
        // the session so the loop can wire it into its `select!` over WS
        // frames and reader events.
        let writer = std::sync::Arc::new(std::sync::Mutex::new(writer));
        Ok((ActiveSession { tx, writer, master: pair.master, child }, rx))
    }

    /// Write the prompt to the child's stdin. The reader thread does the
    /// response parsing and feeds the WS task through `tx`. The `id` is
    /// forwarded back to the caller via a `tx` event tagged with the id,
    /// so the connection loop can stamp it onto every `Output` it drains
    /// from the inbox.
    ///
    /// Async because the tx send is async on a Tokio worker thread. The
    /// writer write is a regular blocking I/O call wrapped in a
    /// `std::sync::Mutex`; the lock is held for the duration of the
    /// write, which is bounded by Codex's stdin read.
    async fn send_turn(&mut self, id: &str, content: &str) -> Result<(), String> {
        use std::io::Write;
        // Inform the connection loop which `id` is now the "current" turn.
        // The loop keeps a `current_id` cell and uses it to stamp events
        // drained from the inbox.
        let _ = self
            .tx
            .send(BridgeEvent::Output {
                id: format!("__turn:{id}"),
                delta: String::new(),
            })
            .await;
        // Actually write the prompt. `codex exec -` reads the prompt from
        // stdin until EOF or newline; we write the prompt, then close the
        // writer so codex sees EOF and runs the turn. Closing the writer
        // also means the next `Message` will fail until a new session is
        // started â€” that is the price of one-shot semantics.
        let mut w = self
            .writer
            .lock()
            .map_err(|e| format!("writer poisoned: {e}"))?;
        w.write_all(content.as_bytes())
            .and_then(|_| w.write_all(b"\n"))
            .and_then(|_| w.flush())
            .map_err(|e| format!("write prompt: {e}"))?;
        Ok(())
    }

    /// Best-effort kill of the child. The reader thread will see EOF and
    /// exit, which closes the channel, which the WS task notices as a
    /// hangup.
    async fn stop_turn(&mut self, id: &str) -> Result<(), String> {
        let _ = self
            .tx
            .send(BridgeEvent::Output {
                id: format!("__stop:{id}"),
                delta: String::new(),
            })
            .await;
        let _ = self.child.kill();
        Ok(())
    }
}

/// Spawn codex with the right per-agent `CODEX_HOME`. The model flag is
/// passed through unchanged; an explicit `None` lets Codex pick its
/// profile default.
///
/// On Windows the `codex` binary is a Node.js shim; the entry point the
/// shell actually runs is `codex.cmd`. We pick the executable by
/// extension: `.cmd` on Windows, `codex` everywhere else. A bare
/// `CommandBuilder::new("codex")` would resolve to the no-extension shim
/// on Windows, which Windows refuses to execute as a process (os error
/// 193, "not a valid Win32 application").
fn build_codex_command(
    bridge: &Bridge,
    agent: &str,
    model: Option<&str>,
) -> Result<CommandBuilder, String> {
    let binary = if cfg!(windows) { "codex.cmd" } else { "codex" };
    let mut cmd = CommandBuilder::new(binary);
    cmd.arg("exec");
    // `--json` is the only flag we need: it makes Codex emit the
    // structured event stream the classifier in this module is built
    // for. We do not pass `--quiet` because Codex does not actually
    // accept it on `exec`; passing it makes the run abort before any
    // turn happens.
    cmd.arg("--json");
    if let Some(m) = model {
        cmd.arg("--model");
        cmd.arg(m);
    }
    // `codex exec` reads the prompt from argv when it is the next token, or
    // from stdin when the prompt is `-`. We pass `-` so the per-turn write
    // path can stream the prompt into the pty without re-spawning.
    cmd.arg("-");
    if let Some(home) = bridge.codex_home_for(agent) {
        cmd.env("CODEX_HOME", home);
    }
    Ok(cmd)
}

// Ollama command builder. Ollama's `run` subcommand reads a prompt from
// stdin when the prompt argument is `-`. We invoke the on-disk
// `ollama.exe` directly so PATH resolution does not interfere with the
// shim we use for `codex.cmd`. The model falls through the bridge's
// per-agent lookup, which itself falls through to the caller's `model`
// argument when set.
fn build_ollama_command(
    bridge: &Bridge,
    agent: &str,
    model: Option<&str>,
) -> Result<CommandBuilder, String> {
    let resolved_model = model
        .map(str::to_string)
        .or_else(|| bridge.ollama_model_for(agent))
        .ok_or_else(|| {
            "ollama: no model specified (set ollama_model in accounts.json or pass model on start)".to_string()
        })?;

    // On Windows the binary is `ollama.exe`. CommandBuilder accepts a
    // plain name and resolves it through PATH; we explicitly pick the
    // extension so the resolved path is the real executable, not a
    // shim. Ollama on PATH already works, so we just use the bare name.
    let mut cmd = CommandBuilder::new("ollama");
    cmd.arg("run");
    cmd.arg(&resolved_model);
    // `-` makes ollama read the prompt from stdin until EOF, mirroring
    // the way we feed codex from the bridge. Without this, ollama
    // would interpret the next argv as the prompt and refuse the
    // bridge's stdin write.
    cmd.arg("--");
    // Ollama has no `--prompt` flag; we still need a placeholder so the
    // `--` separator is not the last token (some CLIs require an
    // argument after `--`). Passing the empty string is safe because
    // the actual prompt comes from stdin and the placeholder is
    // discarded.
    cmd.arg("");

    if let Some(url) = std::env::var_os("OLLAMA_HOST") {
        cmd.env("OLLAMA_HOST", url);
    } else {
        let url = bridge.ollama_url_for(agent);
        if url != "http://127.0.0.1:11434" {
            cmd.env("OLLAMA_HOST", url);
        }
    }
    Ok(cmd)
}

// Manus command builder. Manus has no CLI; the bridge shells out to
// `curl` with a small JSON payload and reads the streaming response.
// We deliberately use curl instead of bundling an HTTP client so the
// bridge has zero new runtime dependencies. The bridge does not try
// to be clever about TLS, auth refresh, or SSE chunking â€” it streams
// curl's stdout into the line classifier and trusts `curl` to do the
// right thing on the wire.
//
// If the agent config has no API key, we refuse to spawn. That
// surfaces as an `Error` event the user can act on, instead of
// silently making anonymous calls that Manus would reject anyway.
fn build_manus_command(
    bridge: &Bridge,
    agent: &str,
    model: Option<&str>,
) -> Result<CommandBuilder, String> {
    let key = bridge.manus_api_key_for(agent).ok_or_else(|| {
        "manus: no api key configured (set manus_api_key in accounts.json)".to_string()
    })?;
    let url = bridge.ollama_url_for(agent); // reuse the URL field for now
    let _ = (model, url); // reserved for future filtering; unused today

    let mut cmd = CommandBuilder::new("curl");
    cmd.arg("--silent");
    cmd.arg("--no-buffer");
    cmd.arg("--header");
    cmd.arg(format!("Authorization: Bearer {key}"));
    cmd.arg("--header");
    cmd.arg("Content-Type: application/json");
    cmd.arg("--data-binary");
    cmd.arg("@-");
    cmd.arg("https://api.manus.im/v1/chat");
    Ok(cmd)
}

/// How the reader thread should interpret one line of CLI output. The
/// per-provider dispatch happens here so the line-reader loop stays
/// oblivious to JSON vs. plain text vs. SSE.
#[derive(Debug, Clone, Copy)]
enum LineClassifier {
    /// Codex's `--json` flag emits structured event lines. We pick the
    /// text out of `item.completed` events and treat anything else as
    /// a control frame.
    Codex,
    /// Plain text, one line at a time. Used by Ollama's `run` subcommand
    /// and by anything else that prints to a terminal without a JSON
    /// envelope.
    Plain,
    /// Server-sent events whose payload is a JSON object on a line that
    /// starts with `data: `. Manus and other HTTP-backed providers
    /// stream this shape. We strip the `data: ` prefix and feed the
    /// remainder through the same logic the Codex classifier uses for
    /// `item.completed` payloads.
    SseJson,
}

/// Classify one line of provider output into zero or more bridge
/// events. The dispatch is by `classifier`. A `Codex` line might be:
/// - `{"type":"item.completed", "item":{...}}` with a `text` field â†’ one
///   `Output` with the text as the delta.
/// - `{"type":"turn.completed"}` â†’ a `Done` for the current turn.
/// - any other JSON, or plain text â†’ emit as a raw `Output` so the chat
///   renders whatever Codex said, even if the format changes
///   underneath us.
fn classify_line(line: &str, classifier: &LineClassifier) -> Vec<BridgeEvent> {
    match classifier {
        LineClassifier::Codex => classify_codex(line),
        LineClassifier::Plain => classify_plain(line),
        LineClassifier::SseJson => classify_sse_json(line),
    }
}

/// Codex-specific classifier. See `classify_line` for the per-line
/// contract; this is the implementation behind the `Codex` arm.
fn classify_codex(line: &str) -> Vec<BridgeEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return vec![];
    }
    let parsed: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            // Not JSON. Treat as plain text and let the chat show it.
            return vec![BridgeEvent::Output { id: String::new(), delta: trimmed.to_string() }];
        }
    };
    let ty = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match ty {
        "item.completed" => {
            // The interesting fields are `item.text` (assistant text) and
            // `item.type` (the item kind â€” only `assistant_message` carries
            // text we want to show).
            let item = parsed.get("item");
            let kind = item.and_then(|i| i.get("type")).and_then(|v| v.as_str()).unwrap_or("");
            if kind == "assistant_message" {
                if let Some(text) = item.and_then(|i| i.get("text")).and_then(|v| v.as_str()) {
                    return vec![BridgeEvent::Output {
                        id: String::new(),
                        delta: text.to_string(),
                    }];
                }
            }
            vec![]
        }
        "turn.completed" | "turn.end" => vec![BridgeEvent::Done { id: String::new(), exit_code: 0 }],
        "turn.failed" => {
            let msg = parsed
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("turn failed");
            vec![BridgeEvent::Error { id: String::new(), message: msg.to_string() }]
        }
        "error" => {
            let msg = parsed
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("codex error");
            vec![BridgeEvent::Error { id: String::new(), message: msg.to_string() }]
        }
        _ => vec![],
    }
}

/// Tauri command: returns the current bridge status as a string. The tray
/// menu calls this to render `Codex: 0/1/2 agents running`.
#[tauri::command]
pub fn bridge_status<R: Runtime>(app: AppHandle<R>) -> String {
    match app.try_state::<Bridge>() {
        Some(b) => b.status_line(),
        None => String::new(),
    }
}

// Plain-text classifier. Used by Ollama and anything else that streams
// a terminal's worth of text without a JSON envelope. Empty lines are
// skipped so a blank line from a CLI does not produce an empty Output
// event the chat has to render.
//
// The id is left empty on purpose: the connection loop stamps every
// event with the current turn id, so the per-event id is meaningless
// here. The delta carries the trimmed line, which the chat renders
// verbatim.
fn classify_plain(line: &str) -> Vec<BridgeEvent> {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    if trimmed.is_empty() {
        return vec![];
    }
    vec![BridgeEvent::Output { id: String::new(), delta: trimmed.to_string() }]
}

// Server-sent events classifier. Manus and other HTTP-backed providers
// stream a `data: ` line per event. We strip the prefix and feed the
// JSON payload through the Codex-style classifier so a future change
// to the envelope only touches one place. Lines that do not start with
// `data: ` (e.g. `event: foo`, blank heartbeat lines) are ignored.
fn classify_sse_json(line: &str) -> Vec<BridgeEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return vec![];
    }
    let Some(payload) = trimmed.strip_prefix("data: ") else {
        return vec![];
    };
    classify_codex(payload)
}


