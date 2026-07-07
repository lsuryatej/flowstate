// Rust host: spawns the Node sidecar, ferries UiEvents (sidecar stdout ->
// webview via Tauri events) and ControlMsgs (webview commands -> sidecar
// stdin), and owns the privileged bits: OS keychain for the API key and OS
// notifications. See SPEC_v0.md §2. Rust knows nothing about event shapes
// beyond "one JSON object per line". The webview NEVER sees the raw key.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const UI_EVENT_CHANNEL: &str = "ui-event";
const KEYCHAIN_SERVICE: &str = "com.suryatejlalam.flowstate";
const KEYCHAIN_USER: &str = "anthropic_api_key";

struct Sidecar {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    // Flag for the CURRENT child, shared with its ferry thread. respawn_sidecar
    // and shutdown set it true before killing so the ferry thread can tell an
    // intentional kill (session switch, key change, quit) from a real crash and
    // stay quiet instead of firing a false "sidecar exited" banner.
    expected_exit: Mutex<Option<Arc<AtomicBool>>>,
}

fn keychain_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())
}

fn stored_api_key() -> Option<String> {
    keychain_entry().ok()?.get_password().ok()
}

/// Dev-mode path resolution: the Node sidecar script under the repo root.
fn sidecar_script() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent")
        .join("sidecar/dist/index.js")
}

/// Bundled externalBins live next to the app's main executable (Tauri strips
/// the target-triple suffix at bundle time). Present only in a packaged .app;
/// absent under `tauri dev`, which is how we tell the two apart.
fn bundled_binary(name: &str) -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.join(name);
    candidate.exists().then_some(candidate)
}

fn spawn_sidecar(app: &AppHandle) -> std::io::Result<Child> {
    // Packaged app: run the self-contained sidecar binary and point it at the
    // bundled native Claude executable (no node/node_modules/repo on the user's
    // machine). Dev: run the Node script from the repo, letting the SDK resolve
    // the native binary from node_modules as usual.
    let mut cmd = match bundled_binary("flowstate-sidecar") {
        Some(sidecar_bin) => {
            let mut cmd = Command::new(&sidecar_bin);
            if let Some(claude_bin) = bundled_binary("claude") {
                cmd.env("FLOWSTATE_CLAUDE_BIN", claude_bin);
            }
            // No repo to sit in; a stable, writable cwd for anything unscoped.
            if let Some(home) = std::env::var_os("HOME") {
                cmd.current_dir(home);
            }
            cmd
        }
        None => {
            let script = sidecar_script();
            let repo_root = script
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .expect("sidecar script lives two levels under repo root")
                .to_path_buf();
            let mut cmd = Command::new("node");
            cmd.arg(&script).current_dir(&repo_root);
            cmd
        }
    };
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Keychain key (if pasted) wins; otherwise the sidecar inherits the
    // environment (dev ANTHROPIC_API_KEY or an existing `claude /login`).
    if let Some(key) = stored_api_key() {
        cmd.env("ANTHROPIC_API_KEY", key);
    }
    let mut child = cmd.spawn()?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    // Fresh exit flag for this child. Stored in state so respawn/shutdown can
    // flip it before killing; a clone goes to the ferry thread below.
    let expected_exit = Arc::new(AtomicBool::new(false));
    if let Ok(mut g) = app.state::<Sidecar>().expected_exit.lock() {
        *g = Some(expected_exit.clone());
    }

    // Ferry thread: sidecar stdout -> Tauri events. Buffer by newline, guard
    // the parse, never crash the pipe on one bad frame (SPEC §9).
    let handle = app.clone();
    let exit_flag = expected_exit.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(event) => {
                    println!("[pipe] sidecar -> webview: {line}");
                    if let Err(e) = handle.emit(UI_EVENT_CHANNEL, event) {
                        eprintln!("[pipe] emit failed: {e}");
                    }
                }
                Err(e) => eprintln!("[pipe] dropping bad frame ({e}): {line}"),
            }
        }
        eprintln!("[pipe] sidecar stdout closed");
        // Only a genuine, unexpected death is worth alarming the user. An
        // intentional kill (respawn on session switch / key change, or quit)
        // flips this flag first, and the new sidecar's own boot is the real
        // signal — so stay quiet here.
        if exit_flag.load(Ordering::SeqCst) {
            eprintln!("[pipe] expected exit (intentional respawn); no error emitted");
        } else {
            let _ = handle.emit(
                UI_EVENT_CHANNEL,
                serde_json::json!({ "t": "error", "message": "sidecar exited; restart the session to continue" }),
            );
        }
    });

    // Sidecar logs (stderr) -> host log.
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            eprintln!("{line}");
        }
    });

    Ok(child)
}

/// Kill any running sidecar and start a fresh one (fresh agent session).
/// Used at startup, after an API key is saved, and by restart_session.
fn respawn_sidecar(app: &AppHandle) -> Result<(), String> {
    let state: State<Sidecar> = app.state();
    // Mark the outgoing child's exit as expected BEFORE killing it, so its
    // ferry thread stays quiet instead of firing a false "sidecar exited"
    // banner. spawn_sidecar (below) then installs a fresh flag for the new child.
    if let Ok(guard) = state.expected_exit.lock() {
        if let Some(flag) = guard.as_ref() {
            flag.store(true, Ordering::SeqCst);
        }
    }
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut old) = guard.take() {
            let _ = old.kill();
        }
    }
    let mut child = spawn_sidecar(app).map_err(|e| format!("sidecar spawn failed: {e}"))?;
    let stdin = child.stdin.take();
    *state.stdin.lock().map_err(|e| e.to_string())? = stdin;
    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    Ok(())
}

fn write_to_sidecar(state: &State<Sidecar>, msg: serde_json::Value) -> Result<(), String> {
    let mut guard = state.stdin.lock().map_err(|e| e.to_string())?;
    let stdin = guard.as_mut().ok_or("sidecar stdin not available")?;
    writeln!(stdin, "{msg}").map_err(|e| format!("write to sidecar failed: {e}"))
}

#[tauri::command]
fn send_prompt(state: State<Sidecar>, text: String, cwd: Option<String>) -> Result<(), String> {
    write_to_sidecar(
        &state,
        serde_json::json!({ "type": "prompt", "text": text, "cwd": cwd }),
    )
}

#[tauri::command]
fn interrupt(state: State<Sidecar>) -> Result<(), String> {
    write_to_sidecar(&state, serde_json::json!({ "type": "interrupt" }))
}

/// Generic ControlMsg pass-through (v1+). Rust stays shape-agnostic; the
/// webview and sidecar share the ControlMsg contract in shared/uiEvents.ts.
#[tauri::command]
fn send_control(state: State<Sidecar>, msg: serde_json::Value) -> Result<(), String> {
    if !msg.is_object() {
        return Err("control message must be a JSON object".into());
    }
    write_to_sidecar(&state, msg)
}

/// Store the pasted key in the OS keychain, then restart the sidecar so it
/// picks the key up. The key never flows back to the webview.
#[tauri::command]
fn set_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("empty key".into());
    }
    keychain_entry()?
        .set_password(trimmed)
        .map_err(|e| e.to_string())?;
    respawn_sidecar(&app)
}

#[tauri::command]
fn has_api_key() -> bool {
    stored_api_key().is_some()
}

/// Remove the key from the keychain and restart the sidecar without it (it
/// falls back to the inherited environment / `claude /login`, same as before
/// a key was ever pasted).
#[tauri::command]
fn clear_api_key(app: AppHandle) -> Result<(), String> {
    keychain_entry()?
        .delete_credential()
        .map_err(|e| e.to_string())?;
    respawn_sidecar(&app)
}

#[tauri::command]
fn restart_session(app: AppHandle) -> Result<(), String> {
    respawn_sidecar(&app)
}

/// Interactive region screenshot via macOS `screencapture -i`. Returns the
/// temp png path, or Err("cancelled") if the user escaped out (no file).
#[tauri::command]
fn capture_region_screenshot() -> Result<String, String> {
    let path = std::env::temp_dir().join(format!(
        "flowstate-shot-{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    let status = Command::new("screencapture")
        .arg("-i")
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() || !path.exists() {
        return Err("cancelled".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Persist a pasted clipboard image (base64 png from the webview) to a temp
/// file so it can ride the paths-only attachment pipe.
#[tauri::command]
fn save_temp_image(data_base64: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| e.to_string())?;
    let path = std::env::temp_dir().join(format!(
        "flowstate-paste-{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Show + focus the capture pill if hidden, hide it if already visible.
/// Called from the global hotkey handler (⌥Space / Cmd+Shift+K fallback,
/// see the capture-pill feature note). The `capture-shown` event lets the
/// pill refocus/select its input each time it's summoned (SPEC IDEOLOGY §5:
/// capture, don't switch).
fn toggle_capture(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
            let _ = w.emit("capture-shown", ());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_capture(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            interrupt,
            send_control,
            set_api_key,
            has_api_key,
            clear_api_key,
            restart_session,
            capture_region_screenshot,
            save_temp_image
        ])
        .setup(|app| {
            app.manage(Sidecar {
                child: Mutex::new(None),
                stdin: Mutex::new(None),
                expected_exit: Mutex::new(None),
            });
            respawn_sidecar(app.handle()).map_err(std::io::Error::other)?;

            // Global capture-pill hotkey: ⌥Space, falling back to Cmd+Shift+K
            // if the primary binding is already claimed by another app.
            let global_shortcut = app.global_shortcut();
            if let Err(e) = global_shortcut.register("Alt+Space") {
                eprintln!("[hotkey] Alt+Space registration failed ({e}); trying CmdOrCtrl+Shift+K");
                if let Err(e) = global_shortcut.register("CmdOrCtrl+Shift+K") {
                    eprintln!("[hotkey] CmdOrCtrl+Shift+K registration also failed ({e})");
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let state: State<Sidecar> = app.state();
                // Expected exit: quitting the app, not a crash.
                if let Ok(guard) = state.expected_exit.lock() {
                    if let Some(flag) = guard.as_ref() {
                        flag.store(true, Ordering::SeqCst);
                    }
                }
                let child = state.child.lock().ok().and_then(|mut g| g.take());
                if let Some(mut child) = child {
                    let _ = child.kill();
                }
            }
        });
}
