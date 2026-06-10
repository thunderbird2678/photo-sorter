mod cache;
mod commands;
mod io;
mod metadata;
mod scanner;
mod wal;

use cache::PreviewCache;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let cache_dir = app
                .path()
                .app_cache_dir()
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("photo-sorter-preview-cache");
            let cache = PreviewCache::open(&cache_dir);
            app.manage(cache);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_wal_themes,
            commands::scan_destination,
            commands::start_destination_scan,
            commands::cancel_destination_scan,
            commands::start_preview_scan,
            commands::cancel_preview_scan,
            commands::execute_transfer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
