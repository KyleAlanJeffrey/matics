mod menu;
mod package;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| menu::forward(app, event.id().as_ref()));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::load_config,
            storage::save_config,
            storage::default_root,
            storage::list_projects,
            storage::project_entry,
            storage::read_project,
            storage::write_project,
            storage::new_project_dir,
            storage::trash_project,
            storage::import_asset,
            storage::write_asset,
            storage::read_asset_base64,
            storage::remove_asset,
            storage::copy_asset,
            storage::open_asset,
            storage::read_import_file,
            storage::write_export_file,
            storage::fetch_pdf,
            package::export_package,
            package::import_package,
            package::take_opened_files,
        ])
        .manage(package::OpenedFiles::default())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Finder hands over double-clicked .matics files, also before the webview loads.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                package::files_opened(app, urls);
            }
        });
}
