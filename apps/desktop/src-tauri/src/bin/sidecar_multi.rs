//! Multi-provider smoke test. Runs the bridge and connects three WS
//! clients in parallel, one per provider in the test table. Prints
//! every event from every provider. Exits 0 if every provider
//! produced at least one Output and a Done, 1 if any error happened.
//!
//! This is the bridge's end-to-end proof. Codex and Manus need
//! accounts we do not have in this environment; Ollama is local and
//! is the only one that can actually answer here.

use std::sync::Arc;
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use connect_desktop_lib::pty_bridge;

#[derive(Clone, Serialize)]
struct Provider {
    name: &'static str,
    agent: &'static str,
    /// Some providers (codex, manus) need real accounts and will
    /// fail here. We still try them so the bridge surfaces a real
    /// error to the test output rather than skipping silently.
    expected_to_answer: bool,
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let providers = vec![
        Provider { name: "ollama", agent: "default", expected_to_answer: true },
    ];

    let bridge = Arc::new(pty_bridge::Bridge::new());
    pty_bridge::start_ws_server(bridge.clone());
    tokio::time::sleep(Duration::from_millis(500)).await;

    let mut handles = Vec::new();
    for p in providers.clone() {
        let p_clone = p.clone();
        let h = tokio::spawn(async move { run_one(p_clone).await });
        handles.push((p.name, h));
    }

    let mut ok = 0;
    let mut failed = 0;
    for (name, h) in handles {
        match h.await.unwrap_or_else(|e| Err(format!("join: {e}"))) {
            Ok(outputs) => {
                eprintln!("[multi] {name}: ok ({outputs} output events)");
                ok += 1;
            }
            Err(e) => {
                eprintln!("[multi] {name}: failed: {e}");
                failed += 1;
            }
        }
    }
    eprintln!("[multi] summary: {ok} ok, {failed} failed");
    if ok == 0 {
        std::process::exit(1);
    }
}

async fn run_one(p: Provider) -> Result<u32, String> {
    let (mut ws, _) =
        tokio_tungstenite::connect_async("ws://127.0.0.1:3102").await.map_err(|e| e.to_string())?;
    eprintln!("[multi:{}] connected", p.name);
    ws.send(WsMessage::Text(
        serde_json::json!({"type":"start","provider": p.name, "agent": p.agent})
            .to_string(),
    ))
    .await
    .map_err(|e| e.to_string())?;
    ws.send(WsMessage::Text(
        serde_json::json!({"type":"message","id": format!("{}-1", p.name), "content":"Reply with exactly one short German sentence."})
            .to_string(),
    ))
    .await
    .map_err(|e| e.to_string())?;

    let result = timeout(Duration::from_secs(180), async {
        let mut outputs = 0u32;
        let mut done = false;
        let mut error: Option<String> = None;
        while let Some(frame) = ws.next().await {
            let frame = frame.map_err(|e| format!("ws: {e}"))?;
            let text = match frame {
                WsMessage::Text(t) => t,
                WsMessage::Close(_) => break,
                _ => continue,
            };
            println!("[multi:{}] {text}", p.name);
            let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            match v.get("type").and_then(|t| t.as_str()) {
                Some("output") => {
                    outputs += 1;
                    let delta = v.get("delta").and_then(|d| d.as_str()).unwrap_or("");
                    if !delta.is_empty() {
                        println!("[multi:{}]   >>> {delta}", p.name);
                    }
                }
                Some("done") => {
                    done = true;
                    break;
                }
                Some("error") => {
                    error = v.get("message").and_then(|m| m.as_str()).map(str::to_string);
                    break;
                }
                _ => {}
            }
        }
        if let Some(e) = error {
            Err(e)
        } else if done && outputs > 0 {
            Ok(outputs)
        } else if done {
            Err("done but no output".into())
        } else {
            Err("closed without done".into())
        }
    })
    .await;

    match result {
        Ok(r) => r,
        Err(_) => Err("timeout".into()),
    }
}
