//! Standalone smoke test for the Connect Sidecar.
//!
//! This binary runs the bridge without the Tauri tray app. It is the
//! shortest path from "code compiles" to "Codex actually answers through
//! a WebSocket". The Tauri stack is heavy: it would build a window, mount
//! a tray icon, and possibly trigger the browser sign-in flow. None of
//! that is what we are testing. We just want to see the WS handshake, the
//! `codex exec` spawn, and a real streamed answer come back.
//!
//! Usage:
//!     sidecar-smoke
//!     sidecar-smoke <agent>       # e.g. sidecar-smoke seo-bot
//!
//! Reads accounts from ~/.connect/sidecar/accounts.json. If the agent
//! does not exist in the file, the default `CODEX_HOME` is used.
//!
//! Exits 0 if the bridge produced a `Done` frame within the timeout
//! (default 90 s). Exits 1 on any other outcome.

use std::sync::Arc;
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use connect_desktop_lib::pty_bridge;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let agent = std::env::args().nth(1).unwrap_or_else(|| "default".to_string());

    let bridge = Arc::new(pty_bridge::Bridge::new());
    let home = bridge.codex_home_for(&agent);
    eprintln!("[smoke] agent={agent} codex_home={home:?}");

    pty_bridge::start_ws_server(bridge.clone());

    // Give the server a beat to bind. Tokio's `spawn` is not synchronous
    // and the bind happens off the main task; sleeping a little is the
    // simplest correct thing for a smoke test.
    tokio::time::sleep(Duration::from_millis(500)).await;

    let url = "ws://127.0.0.1:3102";
    let (mut ws, _) = match tokio_tungstenite::connect_async(url).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[smoke] could not connect: {e}");
            std::process::exit(1);
        }
    };
    eprintln!("[smoke] connected");

    let start = serde_json::json!({
        "type": "start",
        "provider": "codex",
        "agent": agent,
        "model": null,
    });
    if let Err(e) = ws.send(WsMessage::Text(start.to_string())).await {
        eprintln!("[smoke] send start: {e}");
        std::process::exit(1);
    }

    let prompt = serde_json::json!({
        "type": "message",
        "id": "smoke-1",
        "content": "Reply with exactly one short German sentence.",
    });
    if let Err(e) = ws.send(WsMessage::Text(prompt.to_string())).await {
        eprintln!("[smoke] send message: {e}");
        std::process::exit(1);
    }

    // Drain up to 90 s, print every frame, return success on the first
    // `done` frame. The point of the smoke test is to see whether the
    // bridge can carry one full round-trip; we do not try to assert
    // anything about the *content* of the answer.
    let answer = timeout(Duration::from_secs(90), async {
        while let Some(frame) = ws.next().await {
            let frame = match frame {
                Ok(f) => f,
                Err(e) => return Err(format!("ws read: {e}")),
            };
            let text = match frame {
                WsMessage::Text(t) => t,
                WsMessage::Close(_) => return Err("closed".into()),
                _ => continue,
            };
            println!("[smoke] {text}");
            let v: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if v.get("type").and_then(|t| t.as_str()) == Some("done") {
                return Ok::<_, String>(v);
            }
        }
        Err("no more frames".into())
    })
    .await;

    match answer {
        Ok(Ok(_)) => {
            eprintln!("[smoke] done — bridge works end-to-end");
            std::process::exit(0);
        }
        Ok(Err(e)) => {
            eprintln!("[smoke] bridge error: {e}");
            std::process::exit(1);
        }
        Err(_) => {
            eprintln!("[smoke] timeout");
            std::process::exit(2);
        }
    }
}