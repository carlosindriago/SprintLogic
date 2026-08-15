use tauri::{Manager, RunEvent};
use std::sync::Mutex;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::env;

struct AppState {
    sidecar_port: Mutex<Option<u16>>,
}

/// Wraps the spawned sidecar so we can recover it from app state on exit
/// and kill it explicitly. Without this the uvicorn Python process keeps
/// running orphaned after Tauri closes (especially on Linux, where closing
/// the parent does not auto-SIGTERM the child).
struct SidecarChild(Mutex<Option<std::process::Child>>);

#[tauri::command]
fn get_sidecar_port(state: tauri::State<'_, AppState>) -> Result<u16, String> {
    loop {
        {
            let port = state.sidecar_port.lock().unwrap();
            if let Some(p) = *port {
                return Ok(p);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

#[tauri::command]
fn show_main_window(window: tauri::Window) {
    window.show().unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            sidecar_port: Mutex::new(None),
        })
        .manage(SidecarChild(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_sidecar_port, show_main_window])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // In dev mode, we spawn the raw python script.
            // We use std::env::current_dir to accurately find the monorepo root
            let current_dir = env::current_dir().unwrap();
            // In tauri dev, current_dir is usually `apps/web/src-tauri`
            let root_dir = current_dir.parent().unwrap().parent().unwrap();

            let python_bin = root_dir.join("api").join(".venv").join("bin").join("python");
            let script_path = root_dir.join("api").join("app").join("main.py");

            println!("Spawning python: {:?} {:?}", python_bin, script_path);

            let mut child = Command::new(python_bin)
                .current_dir(root_dir.join("api"))
                .arg(script_path)
                .env("SPRINTLOGIC_DESKTOP", "1")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit()) // Pass stderr through to see Python errors in Rust console
                .spawn()
                .expect("Failed to spawn Python sidecar in dev mode");

            let stdout = child.stdout.take().expect("Failed to get stdout");

            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        println!("Python: {}", l);
                        if l.starts_with("[SPRINTLOGIC_READY::") && l.ends_with("]") {
                            let port_str = &l["[SPRINTLOGIC_READY::".len()..l.len()-1];
                            if let Ok(port) = port_str.parse::<u16>() {
                                println!("Detected FastAPI port: {}", port);
                                let state = app_handle.state::<AppState>();
                                *state.sidecar_port.lock().unwrap() = Some(port);
                            }
                        }
                    }
                }
            });

            // Keep the child handle in app state so the RunEvent::Exit handler
            // can kill it explicitly when the app closes. This is the primary
            // defense against zombie processes; the STDIN umbilical cord in
            // main.py is the secondary defense.
            let sidecar_state = app.state::<SidecarChild>();
            *sidecar_state.0.lock().unwrap() = Some(child);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| {
            // On app exit or exit requested, kill the Python sidecar explicitly.
            // Without this the uvicorn server keeps running orphaned on Linux.
            match event {
                RunEvent::Exit | RunEvent::ExitRequested { .. } => {
                    let sidecar_state = app_handle.state::<SidecarChild>();
                    let mut guard = sidecar_state.0.lock().unwrap();
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
                _ => {}
            }
        });
}