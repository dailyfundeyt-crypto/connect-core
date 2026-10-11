//! Echo-Echo test: a tiny shell script that prints one line per stdin line,
//! wrapped in JSON. The bridge should read those lines, classify them as
//! plain text, and stream them as `Output` events. If we see a `Done` and
//! at least one `Output`, the bridge itself is end-to-end correct; the
//! Codex turn failure earlier was a model/account issue, not a wiring
//! bug.

use std::sync::Arc;
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use connect_desktop_lib::pty_bridge;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let bridge = Arc::new(pty_bridge::Bridge::new());
    pty_bridge::start_ws_server(bridge.clone());
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Override the codex binary by writing a one-line .cmd shim that
    // behaves like a codex-cli that actually answers. The shim reads
    // stdin line-by-line and prints each one back as a JSON line, then
    // exits. We use a `.cmd` so the bridge's `codex.cmd` lookup resolves
    // to it via PATH manipulation below.
    let shim_dir = std::env::temp_dir().join("connect-bridge-test");
    let _ = std::fs::create_dir_all(&shim_dir);
    let shim_path = shim_dir.join("codex.cmd");
    std::fs::write(
        &shim_path,
        "@echo off\r\nsetlocal\r\nset /p line=\r\necho {\"type\":\"item.completed\",\"item\":{\"type\":\"assistant_message\",\"text\":\"echo: %line%\"}}\r\necho {\"type\":\"turn.completed\"}\r\nendlocal\r\n",
    )
    .expect("write shim");

    // Prepend the shim dir to PATH so `codex.cmd` resolves to it. We
    // also unset CODEX_HOME so the bridge does not try to load config
    // from a path that does not exist.
    let path = std::env::var_os("PATH").unwrap_or_default();
    let mut new_path = shim_dir.as_os_str().to_os_string();
    new_path.push(";");
    new_path.push(path);
    std::env::set_var("PATH", new_path);
    std::env::remove_var("CODEX_HOME");

    let (mut ws, _) = match tokio_tungstenite::connect_async("ws://127.0.0.1:3102").await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[echo] connect: {e}");
            std::process::exit(1);
        }
    };
    eprintln!("[echo] connected");

    let start = serde_json::json!({"type":"start","provider":"codex","agent":"echo-test"});
    ws.send(WsMessage::Text(start.to_string())).await.unwrap();
    let prompt = serde_json::json!({"type":"message","id":"e1","content":"hello bridge"});
    ws.send(WsMessage::Text(prompt.to_string())).await.unwrap();

    let result = timeout(Duration::from_secs(10), async {
        let mut outputs = 0u32;
        let mut done = false;
        while let Some(frame) = ws.next().await {
            let frame = frame.map_err(|e| format!("ws: {e}"))?;
            let text = match frame {
                WsMessage::Text(t) => t,
                WsMessage::Close(_) => break,
                _ => continue,
            };
            println!("[echo] {text}");
            let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            match v.get("type").and_then(|t| t.as_str()) {
                Some("output") => outputs += 1,
                Some("done") => {
                    done = true;
                    break;
                }
                _ => {}
            }
        }
        Ok::<_, String>((outputs, done))
    })
    .await;

    match result {
        Ok(Ok((outputs, true))) if outputs > 0 => {
            eprintln!("[echo] bridge works: {outputs} output(s) + done");
            std::process::exit(0);
        }
        Ok(Ok((outputs, done))) => {
            eprintln!("[echo] bad: outputs={outputs} done={done}");
            std::process::exit(1);
        }
        Ok(Err(e)) => {
            eprintln!("[echo] error: {e}");
            std::process::exit(1);
        }
        Err(_) => {
            eprintln!("[echo] timeout");
            std::process::exit(2);
        }
    }
}