use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct ExportState {
    child: Mutex<Option<CommandChild>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ffmpeg_version(app: AppHandle) -> Result<String, String> {
    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;
    let output = sidecar
        .args(["-version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// ffmpeg サイドカーで書き出しを実行する。.ass を書き出してから args で ffmpeg を起動し、
/// `-progress pipe:1` の出力(out_time_ms=... / progress=end)を "export-progress" /
/// "export-progress-end" イベントとしてフロントエンドへ送る。
#[tauri::command]
async fn export_video(
    app: AppHandle,
    state: State<'_, ExportState>,
    args: Vec<String>,
    ass_path: String,
    ass_content: String,
) -> Result<(), String> {
    std::fs::write(&ass_path, ass_content).map_err(|e| e.to_string())?;

    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;
    let (mut rx, child) = sidecar.args(args).spawn().map_err(|e| e.to_string())?;

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let mut stdout_buf = String::new();
    let mut last_stderr = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                stdout_buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(pos) = stdout_buf.find('\n') {
                    let line = stdout_buf[..pos].trim().to_string();
                    stdout_buf.drain(..=pos);
                    if let Some(v) = line.strip_prefix("out_time_ms=") {
                        // ffmpeg の out_time_ms は名前に反してマイクロ秒(out_time_us と同値)。
                        // フロントはミリ秒を期待するので 1000 で割って送る。
                        if let Ok(us) = v.trim().parse::<i64>() {
                            let _ = app.emit("export-progress", (us.max(0) / 1000) as u64);
                        }
                    } else if line == "progress=end" {
                        let _ = app.emit("export-progress-end", ());
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                last_stderr = String::from_utf8_lossy(&bytes).to_string();
            }
            CommandEvent::Error(err) => {
                if let Ok(mut guard) = state.child.lock() {
                    *guard = None;
                }
                return Err(err);
            }
            CommandEvent::Terminated(payload) => {
                if let Ok(mut guard) = state.child.lock() {
                    *guard = None;
                }
                if payload.code != Some(0) {
                    return Err(format!(
                        "ffmpeg exited with code {:?}: {}",
                        payload.code, last_stderr
                    ));
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// 実行中の書き出しをキャンセルする(sidecar プロセスを kill)。
#[tauri::command]
fn cancel_export(state: State<'_, ExportState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ExportState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ffmpeg_version,
            export_video,
            cancel_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
