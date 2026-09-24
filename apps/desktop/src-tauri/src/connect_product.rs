//! Drive the native Connect window onto the running app.
//!
//! The splash is ours. The page it navigates to is the Connect UI (the same
//! process the dev stack serves). No system browser is started from here.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use openbot_desktop_lib::connect_window::{self, Status};
use tauri::{Emitter, Manager};

use crate::Shell;

pub fn enabled() -> bool {
    connect_window::product_requested(
        cfg!(connect_product),
        &std::env::args().skip(1).collect::<Vec<_>>(),
        std::env::var("CONNECT_PRODUCT_WINDOW").ok().as_deref(),
    )
}

pub fn current_status<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Status {
    app.state::<Shell>().connect_status.lock().unwrap().clone()
}

pub fn focus<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Enter the product window. Safe to call from setup and from the splash.
pub fn attach<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    {
        let shell = app.state::<Shell>();
        shell
            .connect_product
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
    prepare_window(&app);
    start(app);
    Ok(())
}

fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    let shell = app.state::<Shell>();
    if shell
        .connect_attach_started
        .swap(true, std::sync::atomic::Ordering::SeqCst)
    {
        return;
    }
    std::thread::Builder::new()
        .name("connect-window".into())
        .spawn(move || run(app))
        .ok();
}

fn run<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    let port = connect_window::app_port_from_env(std::env::var("APP_PORT").ok().as_deref());
    publish(&app, Status::opening());

    // A port that accepts and then sends nothing is not Connect. Cursor's
    // forward does that. Only a document titled Connect may fill the window.
    if connect_window::connect_ui_origin(port).is_none() {
        ensure_splash(&app);
        if windows_without_wsl() {
            give_up(&app, Status::offline_no_wsl());
            eprintln!("[connect] no WSL distribution; the window stays open without a service");
            return;
        }
        if connect_window::autostart_enabled(std::env::var("CONNECT_AUTOSTART").ok().as_deref()) {
            let shell = app.state::<Shell>();
            let already = shell
                .connect_service_spawned
                .swap(true, std::sync::atomic::Ordering::SeqCst);
            if !already {
                publish(&app, Status::starting());
                match spawn_service() {
                    Ok(()) => eprintln!("[connect] local service start requested"),
                    Err(error) => eprintln!("[connect] could not start local service: {error}"),
                }
            }
        }
    }

    publish(&app, Status::waiting());
    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        if let Some(origin) = connect_window::connect_ui_origin(port) {
            if connect_window::is_loopback_origin(&origin) {
                match navigate(&app, &origin) {
                    Ok(()) => {
                        publish(&app, Status::ready());
                        eprintln!("[connect] showing the Connect UI");
                        return;
                    }
                    Err(error) => {
                        eprintln!("[connect] navigation failed: {error}");
                    }
                }
            } else {
                eprintln!("[connect] refused a non-loopback app origin");
            }
        }
        if Instant::now() >= deadline {
            let status = if windows_without_wsl() {
                Status::offline_no_wsl()
            } else {
                Status::offline()
            };
            give_up(&app, status);
            eprintln!("[connect] app did not answer before the deadline");
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn publish<R: tauri::Runtime>(app: &tauri::AppHandle<R>, status: Status) {
    *app.state::<Shell>().connect_status.lock().unwrap() = status.clone();
    let _ = app.emit("connect-status", status);
}

fn prepare_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.set_title("Connect");
    let _ = window.set_decorations(true);
    let _ = window.set_resizable(true);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: 1440.0,
        height: 900.0,
    }));
    let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
        width: 1024.0,
        height: 700.0,
    })));
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn ensure_splash<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let already = window
        .url()
        .ok()
        .is_some_and(|url| url.path().ends_with("connect-shell.html"));
    if already {
        return;
    }
    let Ok(base) = crate::setup_destination(app) else {
        return;
    };
    let Ok(splash) = connect_window::splash_from_base(base.as_str()) else {
        return;
    };
    let Ok(url) = splash.parse() else {
        return;
    };
    let _ = window.navigate(url);
}

fn navigate<R: tauri::Runtime>(app: &tauri::AppHandle<R>, origin: &str) -> Result<(), String> {
    if !connect_window::is_loopback_origin(origin) {
        return Err("refused non-loopback origin".into());
    }
    let destination = format!("{origin}/");
    let window = app
        .get_webview_window("main")
        .ok_or("the Connect window is missing")?;
    let url: tauri::Url = destination
        .parse()
        .map_err(|_| "the app origin is not a URL".to_string())?;
    window
        .navigate(url)
        .map_err(|_| "Connect could not open its window content.".to_string())?;
    let _ = window.set_title("Connect");
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn give_up<R: tauri::Runtime>(app: &tauri::AppHandle<R>, status: Status) {
    publish(app, status);
    app.state::<Shell>()
        .connect_attach_started
        .store(false, std::sync::atomic::Ordering::SeqCst);
}

/// Stefan's PC has no WSL distribution. Calling `wsl.exe` there does not start Connect.
fn windows_without_wsl() -> bool {
    if !cfg!(windows) {
        return false;
    }
    !wsl_has_distro()
}

fn wsl_has_distro() -> bool {
    let Ok(output) = Command::new("wsl.exe").args(["-l", "-q"]).output() else {
        return false;
    };
    output.status.success() && connect_window::wsl_list_has_distro(&output.stdout)
}

fn spawn_service() -> Result<(), String> {
    let root = connect_window::deployment_root(candidate_roots())
        .ok_or("no OpenBot directory with START.sh was found")?;
    eprintln!("[connect] service directory {}", root.display());
    if cfg!(windows) {
        if !wsl_has_distro() {
            return Err("WSL has no distribution, so the service was not started".into());
        }
        let linux = connect_window::to_wsl_path(&root)
            .ok_or("the OpenBot path could not be mapped for WSL")?;
        let quoted = connect_window::shell_single_quote(&linux);
        let script = format!(
            "cd {quoted} && chmod +x START.sh scripts/*.sh 2>/dev/null || true; OPENBOT_FORCE_START=1 ./START.sh"
        );
        let mut command = Command::new("wsl.exe");
        command.args(["-e", "bash", "-lc", &script]);
        spawn_logged(command, &root)
    } else {
        let mut command = Command::new("bash");
        command
            .arg("START.sh")
            .current_dir(&root)
            .env("OPENBOT_FORCE_START", "1");
        spawn_logged(command, &root)
    }
}

fn candidate_roots() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Some(root) = std::env::var_os("CONNECT_ROOT") {
        out.push(std::path::PathBuf::from(root));
    }
    if let Ok(cwd) = std::env::current_dir() {
        out.extend(connect_window::ancestor_dirs(&cwd));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            out.extend(connect_window::ancestor_dirs(dir));
        }
    }
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(openbot) = manifest.parent().and_then(|desktop| desktop.parent()) {
        out.push(openbot.to_path_buf());
    }
    out
}

fn spawn_logged(mut command: Command, root: &Path) -> Result<(), String> {
    let logs = root.join(".logs");
    let _ = std::fs::create_dir_all(&logs);
    let log_path = logs.join("connect-desktop.log");
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("could not open {}: {error}", log_path.display()))?;
    let stderr = file
        .try_clone()
        .map_err(|error| format!("could not open {}: {error}", log_path.display()))?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(file))
        .stderr(Stdio::from(stderr));
    let mut child = command
        .spawn()
        .map_err(|error| format!("could not spawn the local service: {error}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
