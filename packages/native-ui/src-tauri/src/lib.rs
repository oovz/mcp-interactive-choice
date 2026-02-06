use tauri::{AppHandle, Manager, State};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri_plugin_cli::CliExt;

struct SubmissionState(AtomicBool);
struct InputState(String);

#[tauri::command]
fn get_input(state: State<'_, InputState>) -> String {
    state.0.clone()
}

#[tauri::command]
fn log_debug(msg: &str) {
    println!("DEBUG [JS]: {}", msg);
}

#[tauri::command]
fn on_submit(app: AppHandle, result: &str) {
    let submission = app.state::<SubmissionState>();
    if !submission.0.load(Ordering::SeqCst) {
        println!("{}", result);
        submission.0.store(true, Ordering::SeqCst);
    }
    
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("DEBUG: Rust run() started");
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let matches = app.cli().matches()?;
            let input = matches.args.get("input").and_then(|arg| arg.value.as_str());
            let input_val = input.unwrap_or("{}").to_string();
            
            println!("DEBUG: Received CLI input: {}", input_val);
            
            app.manage(InputState(input_val));
            app.manage(SubmissionState(AtomicBool::new(false)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_input, on_submit, log_debug])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    let submission = window.state::<SubmissionState>();
                    if !submission.0.load(Ordering::SeqCst) {
                        println!("{{\"choice\":null,\"index\":-1,\"custom_input\":null}}");
                        submission.0.store(true, Ordering::SeqCst);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
