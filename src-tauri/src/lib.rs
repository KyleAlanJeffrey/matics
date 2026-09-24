// Only macOS gets a native menu bar. Windows and Linux use the in-app File menu, since a
// window menu there would stack a second bar between the title bar and the app header.
#[cfg(target_os = "macos")]
mod menu;
mod package;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Registered first, as the plugin requires. A project double-clicked while the app runs
    // opens in this window instead of a second copy whose config writes would race these.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let args = args.into_iter().skip(1).map(std::path::PathBuf::from);
        package::opened_from_args(app, args, Some(std::path::Path::new(&cwd)));
        if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let menu = menu::build(app.handle())?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| menu::forward(app, event.id().as_ref()));
            }
            #[cfg(not(target_os = "macos"))]
            package::opened_from_args(
                app.handle(),
                std::env::args_os().skip(1).map(std::path::PathBuf::from),
                std::env::current_dir().ok().as_deref(),
            );
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
            storage::write_export_file,
            storage::fetch_pdf,
            package::compress_project,
            package::open_project_path,
            package::take_opened_files,
        ])
        .manage(package::OpenedFiles::default())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Finder hands over double-clicked projects, also before the webview loads.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                package::files_opened(app, urls);
            }
        });
}
