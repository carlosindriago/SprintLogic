use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Spawn the Python sidecar. El plugin de shell de Tauri abre el canal STDIN por defecto.
            let sidecar_command = app.shell().sidecar("sprintlogic-backend").expect("Failed to create sidecar command");
            let (_rx, child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");
            
            // Mantener el hijo vivo en el estado de la app para que STDIN no se cierre prematuramente
            app.manage(child);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
