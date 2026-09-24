//! The macOS menu bar. Items that need the app (saving, exporting, switching pages) emit
//! a "menu" event carrying the item id; src/lib/native-menu.ts handles them. Edit and window
//! items are the platform's own, so text fields keep their standard shortcuts.
//!
//! WKWebView offers key equivalents to the page first, so the page's own Cmd+S and Cmd+Z
//! handlers still win while the page has focus; the menu shortcut is the fallback.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

pub const MENU_EVENT: &str = "menu";

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, accelerator: Option<&str>) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accelerator)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let separator = || PredefinedMenuItem::separator(app);

    let app_menu = Submenu::with_items(
        app,
        "Matics",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Matics"), None)?,
            &item(app, "app:check-updates", "Check for Updates...", None)?,
            &separator()?,
            &PredefinedMenuItem::services(app, None)?,
            &separator()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &separator()?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item(app, "file:new", "New Diagram...", Some("CmdOrCtrl+N"))?,
            &item(app, "file:open-folder", "Open Project Folder...", Some("CmdOrCtrl+O"))?,
            &item(app, "file:open-package", "Open Package (.matics)...", Some("CmdOrCtrl+Shift+O"))?,
            &separator()?,
            &item(app, "file:save", "Save", Some("CmdOrCtrl+S"))?,
            &item(app, "file:export-package", "Package Project (.matics)...", Some("CmdOrCtrl+Shift+S"))?,
            &separator()?,
            &item(app, "file:import-diagram", "Import Diagram (.json)...", Some("CmdOrCtrl+Shift+I"))?,
            &item(app, "file:export-diagram", "Export Diagram (.json)...", Some("CmdOrCtrl+Shift+E"))?,
            &item(app, "file:import-products", "Import Products (.json)...", None)?,
            &item(app, "file:export-products", "Export Products (.json)...", None)?,
            &separator()?,
            &item(app, "file:export-report-pdf", "Export Report as PDF...", Some("CmdOrCtrl+P"))?,
            &item(app, "file:export-report-png", "Export Report as PNG...", None)?,
            &item(app, "file:export-schematic-png", "Export Schematic as PNG...", None)?,
            &separator()?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            // Not the predefined items: those send Cmd+Z to WebKit's own text undo, so the
            // diagram's history never saw it.
            &item(app, "edit:undo", "Undo", Some("CmdOrCtrl+Z"))?,
            &item(app, "edit:redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?,
            &separator()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item(app, "view:home", "All Projects", Some("CmdOrCtrl+0"))?,
            &separator()?,
            &item(app, "view:schematic", "Diagram", Some("CmdOrCtrl+1"))?,
            &item(app, "view:documentation", "Documentation", Some("CmdOrCtrl+2"))?,
            &item(app, "view:communications", "Communications", Some("CmdOrCtrl+3"))?,
            &item(app, "view:sketches", "Sketches", Some("CmdOrCtrl+4"))?,
            &item(app, "view:report", "Report", Some("CmdOrCtrl+5"))?,
            &separator()?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?],
    )?;

    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
}

pub fn forward<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // Predefined items (copy, quit...) are handled by the OS and never get here with our ids.
    if id.starts_with("app:") || id.starts_with("file:") || id.starts_with("edit:") || id.starts_with("view:") {
        let _ = app.emit(MENU_EVENT, id);
    }
}
