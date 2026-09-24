//! The Connect product window: the same UI the dev server serves, inside a native frame.
//!
//! Nothing in here opens a browser, and nothing in here is allowed to name an address the
//! person can read. The window asks which loopback answered and then shows that page. The
//! sentences below are the only copy that reaches the splash.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

/// Default app port. The API stays on its own port; the window only navigates to the app.
pub const DEFAULT_APP_PORT: u16 = 3010;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Opening,
    Starting,
    Waiting,
    Ready,
    Offline,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Status {
    pub phase: Phase,
    pub detail: String,
}

impl Status {
    pub fn opening() -> Self {
        Self::line(Phase::Opening, "Connect wird geöffnet.")
    }

    pub fn starting() -> Self {
        Self::line(Phase::Starting, "Der lokale Dienst startet.")
    }

    pub fn waiting() -> Self {
        Self::line(Phase::Waiting, "Connect wird vorbereitet.")
    }

    pub fn ready() -> Self {
        Self::line(Phase::Ready, "Connect ist bereit.")
    }

    pub fn offline() -> Self {
        Self::line(
            Phase::Offline,
            "Connect ist noch nicht bereit. Starte den Dienst auf diesem PC und versuche es erneut.",
        )
    }

    /// The native window is up. The UI behind it is not, and this PC cannot start it.
    pub fn offline_no_wsl() -> Self {
        Self::line(
            Phase::Offline,
            "Das Fenster läuft. Die Oberfläche braucht Docker mit WSL — auf diesem PC ist WSL nicht installiert.",
        )
    }

    fn line(phase: Phase, detail: &str) -> Self {
        Self {
            phase,
            detail: detail.to_string(),
        }
    }
}

impl Default for Status {
    fn default() -> Self {
        Self::opening()
    }
}

/// Compile-time flag, `--connect`, or `CONNECT_PRODUCT_WINDOW=1`.
pub fn product_requested(compile_time: bool, args: &[String], env_value: Option<&str>) -> bool {
    compile_time || args.iter().any(|arg| arg == "--connect") || env_value == Some("1")
}

pub fn app_port_from_env(value: Option<&str>) -> u16 {
    value
        .and_then(|raw| raw.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_APP_PORT)
}

/// Whether `CONNECT_AUTOSTART` allows this window to spawn `START.sh`.
///
/// Unset means yes: opening Connect should bring the service up. `0` is the opt-out.
pub fn autostart_enabled(value: Option<&str>) -> bool {
    value != Some("0")
}

/// A listening socket is not the Connect UI. Cursor's port forward accepts the
/// connection and then sends nothing; that must not become the window document.
pub fn looks_like_connect_ui(body: &str) -> bool {
    body.to_ascii_lowercase().contains("<title>connect</title>")
}

/// Where the Connect UI actually answered, or `None` when the port is closed,
/// hung, empty, or serving something else.
pub fn connect_ui_origin(port: u16) -> Option<String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_millis(400))
        .timeout(Duration::from_millis(800))
        .build()
        .ok()?;
    for host in ["localhost", "127.0.0.1", "[::1]"] {
        let base = format!("http://{host}:{port}");
        let Ok(response) = client.get(format!("{base}/")).send() else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(body) = response.text() else {
            continue;
        };
        if looks_like_connect_ui(&body) && is_loopback_origin(&base) {
            return Some(base);
        }
    }
    None
}

/// `wsl.exe -l -q` is UTF-16 on Windows and empty when no distribution exists.
pub fn wsl_list_has_distro(stdout: &[u8]) -> bool {
    let text = decode_wsl_output(stdout);
    let trimmed = text.trim().trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("no installed distributions")
        || lower.contains("keine distribution")
        || lower.contains("nicht installiert")
    {
        return false;
    }
    true
}

fn decode_wsl_output(bytes: &[u8]) -> String {
    let utf16 = bytes.len() >= 4
        && (bytes.starts_with(&[0xFF, 0xFE])
            || bytes.chunks(2).any(|pair| pair.len() == 2 && pair[1] == 0));
    if !utf16 {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let start = if bytes.starts_with(&[0xFF, 0xFE]) {
        2
    } else {
        0
    };
    let units: Vec<u16> = bytes[start..]
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

/// An origin the window may navigate to. Loopback only, no path, no userinfo, no other host.
pub fn is_loopback_origin(origin: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(origin) else {
        return false;
    };
    if url.scheme() != "http" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if url.query().is_some() || url.fragment().is_some() {
        return false;
    }
    if url.path() != "/" && !url.path().is_empty() {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]") && url.port().is_some()
}

/// `http://127.0.0.1:3010` + `connect-shell.html`, including a base that has no trailing slash.
pub fn splash_from_base(base: &str) -> Result<String, String> {
    let base: reqwest::Url = base
        .parse()
        .map_err(|error| format!("invalid shell base: {error}"))?;
    let joined = base
        .join("connect-shell.html")
        .map_err(|error| format!("invalid splash path: {error}"))?;
    Ok(joined.to_string())
}

pub fn is_deployment(path: &Path) -> bool {
    path.join("START.sh").is_file() && path.join("app").join("package.json").is_file()
}

pub fn deployment_root(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|path| is_deployment(path))
}

pub fn ancestor_dirs(start: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut current = Some(start);
    while let Some(path) = current {
        out.push(path.to_path_buf());
        current = path.parent();
    }
    out
}

/// `C:\Users\Kunc GmbH\OpenBot` → `/mnt/c/Users/Kunc GmbH/OpenBot`.
pub fn to_wsl_path(path: &Path) -> Option<String> {
    let raw = path.to_string_lossy().replace('\\', "/");
    let bytes = raw.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        let drive = (bytes[0] as char).to_ascii_lowercase();
        let rest = raw[2..].trim_start_matches(['/', ':']);
        return Some(format!("/mnt/{drive}/{rest}"));
    }
    if raw.starts_with('/') {
        return Some(raw);
    }
    None
}

pub fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// Splash copy must not teach the address-bar model. A path or a port in a log is fine;
/// these sentences are what the window shows.
pub fn user_facing_lines() -> [&'static str; 6] {
    [
        "Connect wird geöffnet.",
        "Der lokale Dienst startet.",
        "Connect wird vorbereitet.",
        "Connect ist bereit.",
        "Connect ist noch nicht bereit. Starte den Dienst auf diesem PC und versuche es erneut.",
        "Das Fenster läuft. Die Oberfläche braucht Docker mit WSL — auf diesem PC ist WSL nicht installiert.",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn product_flag_accepts_the_three_switches() {
        assert!(product_requested(true, &[], None));
        assert!(product_requested(false, &["--connect".into()], None));
        assert!(product_requested(false, &[], Some("1")));
        assert!(!product_requested(false, &["--help".into()], Some("0")));
    }

    #[test]
    fn app_port_falls_back_when_unset_or_junk() {
        assert_eq!(app_port_from_env(None), 3010);
        assert_eq!(app_port_from_env(Some("")), 3010);
        assert_eq!(app_port_from_env(Some("0")), 3010);
        assert_eq!(app_port_from_env(Some(" 3012 ")), 3012);
    }

    #[test]
    fn autostart_is_on_unless_explicitly_disabled() {
        assert!(autostart_enabled(None));
        assert!(autostart_enabled(Some("1")));
        assert!(!autostart_enabled(Some("0")));
    }

    #[test]
    fn only_loopback_http_origins_are_navigable() {
        assert!(is_loopback_origin("http://localhost:3010"));
        assert!(is_loopback_origin("http://127.0.0.1:3010"));
        assert!(is_loopback_origin("http://[::1]:3010"));
        assert!(!is_loopback_origin("https://127.0.0.1:3010"));
        assert!(!is_loopback_origin("http://127.0.0.1:3010/channel"));
        assert!(!is_loopback_origin("http://example.com:3010"));
        assert!(!is_loopback_origin("http://127.0.0.1:3010@example.com"));
    }

    #[test]
    fn splash_url_keeps_the_dev_server_host() {
        assert_eq!(
            splash_from_base("http://localhost:3020").unwrap(),
            "http://localhost:3020/connect-shell.html"
        );
        assert_eq!(
            splash_from_base("http://127.0.0.1:3020/").unwrap(),
            "http://127.0.0.1:3020/connect-shell.html"
        );
        assert_eq!(
            splash_from_base("http://tauri.localhost/index.html").unwrap(),
            "http://tauri.localhost/connect-shell.html"
        );
    }

    #[test]
    fn windows_path_with_spaces_maps_into_wsl() {
        let path = PathBuf::from(r"C:\Users\Kunc GmbH\OpenBot");
        assert_eq!(
            to_wsl_path(&path).as_deref(),
            Some("/mnt/c/Users/Kunc GmbH/OpenBot")
        );
        assert_eq!(
            shell_single_quote("/mnt/c/Users/Kunc GmbH/OpenBot"),
            "'/mnt/c/Users/Kunc GmbH/OpenBot'"
        );
    }

    #[test]
    fn deployment_root_requires_start_script_and_app() {
        let root = std::env::temp_dir().join(format!(
            "connect-window-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let app = root.join("app");
        fs::create_dir_all(&app).unwrap();
        fs::write(root.join("START.sh"), "#!/bin/sh\n").unwrap();
        fs::write(app.join("package.json"), "{}\n").unwrap();
        let missed = root.join("not-it");
        fs::create_dir_all(&missed).unwrap();
        assert_eq!(
            deployment_root([missed, root.clone()]).as_ref(),
            Some(&root)
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn splash_file_does_not_name_an_address() {
        let html = include_str!("../../public/connect-shell.html").to_ascii_lowercase();
        assert!(!html.contains("localhost"), "{html}");
        assert!(!html.contains("127.0.0.1"));
        assert!(!html.contains("http://"));
        assert!(!html.contains("https://"));
    }

    #[test]
    fn splash_copy_does_not_name_an_address() {
        for line in user_facing_lines() {
            let lower = line.to_ascii_lowercase();
            assert!(!lower.contains("http"), "{line}");
            assert!(!lower.contains("localhost"), "{line}");
            assert!(!lower.contains("127.0.0.1"), "{line}");
            assert!(!lower.contains("://"), "{line}");
        }
        for status in [
            Status::opening(),
            Status::starting(),
            Status::waiting(),
            Status::ready(),
            Status::offline(),
            Status::offline_no_wsl(),
        ] {
            assert!(
                user_facing_lines().contains(&status.detail.as_str()),
                "{}",
                status.detail
            );
        }
    }

    #[test]
    fn only_the_connect_document_counts_as_the_ui() {
        assert!(looks_like_connect_ui("<html><title>Connect</title></html>"));
        assert!(looks_like_connect_ui("<TITLE>connect</TITLE>"));
        assert!(!looks_like_connect_ui(""));
        assert!(!looks_like_connect_ui("<title>OpenBot</title>"));
    }

    #[test]
    fn wsl_list_without_a_distro_does_not_count() {
        assert!(!wsl_list_has_distro(b""));
        assert!(!wsl_list_has_distro(
            "Es ist keine Distribution installiert.\n".as_bytes()
        ));
        assert!(!wsl_list_has_distro(
            b"Windows Subsystem for Linux has no installed distributions."
        ));
        let ubuntu: Vec<u8> = "Ubuntu\n"
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect();
        assert!(wsl_list_has_distro(&ubuntu));
        let mut with_bom = vec![0xFF, 0xFE];
        with_bom.extend(ubuntu);
        assert!(wsl_list_has_distro(&with_bom));
    }

    #[test]
    fn a_hung_listener_is_not_the_connect_ui() {
        use std::io::Write;
        use std::net::TcpListener;

        let hung = TcpListener::bind("127.0.0.1:0").unwrap();
        let hung_port = hung.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let _hold = hung.accept();
            std::thread::sleep(Duration::from_secs(3));
        });

        let live = TcpListener::bind("127.0.0.1:0").unwrap();
        let live_port = live.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut sock, _) = live.accept().unwrap();
            let body = "<!doctype html><title>Connect</title>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = sock.write_all(response.as_bytes());
        });

        let empty = TcpListener::bind("127.0.0.1:0").unwrap();
        let empty_port = empty.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut sock, _) = empty.accept().unwrap();
            let body = "";
            let response =
                format!("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n{body}");
            let _ = sock.write_all(response.as_bytes());
        });

        assert!(connect_ui_origin(hung_port).is_none());
        assert!(connect_ui_origin(empty_port).is_none());
        assert_eq!(
            connect_ui_origin(live_port).as_deref(),
            Some(format!("http://127.0.0.1:{live_port}").as_str())
        );
    }
}
