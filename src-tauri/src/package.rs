//! A package is a whole project folder in one file, for sending to someone or keeping a
//! snapshot: a zip holding `project.json` and `assets/`, named `<project>.matics`.

use crate::storage::{new_project_dir, ASSETS_DIR, PROJECT_FILE};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const PACKAGE_EXTENSION: &str = "matics";
// Unpacked size, so a small file cannot expand into something that fills the disk.
const MAX_UNPACKED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_PROJECT_BYTES: u64 = 200 * 1024 * 1024;
// Every collection a project holds; packages from older builds lack some and are refused.
// src/model/project-shape.ts checks the same list for folders and JSON imports.
const RECORD_FIELDS: [&str; 13] = [
    "presets", "devices", "buses", "zones", "connections", "bundles", "freeWires", "images", "documents", "notes", "frames", "messages", "sketches",
];

fn missing_fields(project: &serde_json::Value) -> Vec<&'static str> {
    let mut missing: Vec<&'static str> = RECORD_FIELDS.into_iter().filter(|field| !project.get(field).is_some_and(|v| v.is_object())).collect();
    if !project.get("docLinks").is_some_and(|v| v.is_array()) {
        missing.push("docLinks");
    }
    missing
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn is_package(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(PACKAGE_EXTENSION))
}

#[tauri::command]
pub fn export_package(dir: String, path: String) -> CmdResult<()> {
    let dir = Path::new(&dir);
    let target = Path::new(&path);
    if !is_package(target) {
        return Err(format!("Packages are saved as .{PACKAGE_EXTENSION} files."));
    }
    if !dir.join(PROJECT_FILE).is_file() {
        return Err(format!("{} is not a project folder", dir.display()));
    }
    // Written beside the target first, so a failed export never leaves half a package.
    let tmp = target.with_extension("matics-tmp");
    let result = write_package(dir, &tmp).and_then(|()| fs::rename(&tmp, target).map_err(err));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn write_package(dir: &Path, target: &Path) -> CmdResult<()> {
    let mut zip = ZipWriter::new(File::create(target).map_err(err)?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file(PROJECT_FILE, options).map_err(err)?;
    zip.write_all(&fs::read(dir.join(PROJECT_FILE)).map_err(err)?).map_err(err)?;
    let assets = dir.join(ASSETS_DIR);
    if assets.is_dir() {
        for entry in fs::read_dir(&assets).map_err(err)?.flatten() {
            // Plain files only: symlinks could point anywhere on the sender's disk.
            let Ok(kind) = entry.file_type() else { continue };
            if !kind.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            zip.start_file(format!("{ASSETS_DIR}/{name}"), options).map_err(err)?;
            io::copy(&mut File::open(entry.path()).map_err(err)?, &mut zip).map_err(err)?;
        }
    }
    zip.finish().map_err(err)?;
    Ok(())
}

/// Unpacks a package into a new folder under `root` and returns the folder.
#[tauri::command]
pub fn import_package(path: String, root: String) -> CmdResult<String> {
    let source = Path::new(&path);
    if !is_package(source) {
        return Err(format!("Only .{PACKAGE_EXTENSION} packages can be opened here."));
    }
    let mut archive = ZipArchive::new(File::open(source).map_err(err)?).map_err(|_| "That file is not a Matics package.".to_string())?;
    let mut project_json = String::new();
    archive
        .by_name(PROJECT_FILE)
        .map_err(|_| "The package has no project.json.".to_string())?
        .take(MAX_PROJECT_BYTES + 1)
        .read_to_string(&mut project_json)
        .map_err(err)?;
    if project_json.len() as u64 > MAX_PROJECT_BYTES {
        return Err("The package's project.json is too large.".into());
    }
    let project: serde_json::Value = serde_json::from_str(&project_json).map_err(|_| "The package's project.json is not valid.".to_string())?;
    let missing = missing_fields(&project);
    if missing.len() == RECORD_FIELDS.len() + 1 {
        return Err("The package's project.json is not a Matics project.".into());
    }
    if !missing.is_empty() {
        return Err(format!(
            "The package is missing {}. It was made by an older Matics build, which this version cannot open.",
            missing.join(", ")
        ));
    }
    let name = project.get("name").and_then(|v| v.as_str()).unwrap_or("Imported project");

    let dir = new_project_dir(root, name.to_string())?;
    let result = unpack(&mut archive, Path::new(&dir), &project_json);
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result.map(|()| dir)
}

fn unpack<R: Read + io::Seek>(archive: &mut ZipArchive<R>, dir: &Path, project_json: &str) -> CmdResult<()> {
    fs::write(dir.join(PROJECT_FILE), project_json).map_err(err)?;
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(err)?;
        if file.is_dir() || file.name() == PROJECT_FILE {
            continue;
        }
        // Anything but assets/<name> is ignored, which also rules out paths that climb out.
        let Some(asset_name) = asset_file_name(file.name()) else { continue };
        let declared = file.size();
        total += declared;
        if total > MAX_UNPACKED_BYTES {
            return Err("The package is too large to open.".into());
        }
        let mut out = File::create(dir.join(ASSETS_DIR).join(asset_name)).map_err(err)?;
        // One byte past the declared size, so a header that understates it is caught.
        let copied = io::copy(&mut (&mut file).take(declared + 1), &mut out).map_err(err)?;
        if copied != declared {
            return Err(format!("The package entry {} is damaged.", file.name()));
        }
    }
    Ok(())
}

fn asset_file_name(entry: &str) -> Option<&str> {
    let mut parts = Path::new(entry).components();
    let first = matches!(parts.next(), Some(Component::Normal(c)) if c == ASSETS_DIR);
    match (first, parts.next(), parts.next()) {
        (true, Some(Component::Normal(name)), None) => name.to_str(),
        _ => None,
    }
}

/// Package paths opened from Finder that the webview has not picked up yet. They wait here
/// because the launch that opened them happens before the webview can listen.
#[derive(Default)]
pub struct OpenedFiles(Mutex<Vec<String>>);

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn files_opened(app: &AppHandle, urls: Vec<tauri::Url>) {
    let paths = urls
        .into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter(|path| is_package(path))
        .map(|path| path.to_string_lossy().into_owned());
    app.state::<OpenedFiles>().0.lock().unwrap().extend(paths);
    let _ = app.emit("files-opened", ());
}

#[tauri::command]
pub fn take_opened_files(opened: tauri::State<OpenedFiles>) -> Vec<String> {
    std::mem::take(&mut *opened.0.lock().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_flat_asset_entries_unpack() {
        assert_eq!(asset_file_name("assets/a.png"), Some("a.png"));
        assert_eq!(asset_file_name("assets/../x"), None);
        assert_eq!(asset_file_name("../assets/x"), None);
        assert_eq!(asset_file_name("/assets/x"), None);
        assert_eq!(asset_file_name("assets/sub/x"), None);
        assert_eq!(asset_file_name("other/x"), None);
    }

    const COMPLETE_PROJECT: &str = r#"{"id":"p1","name":"Round trip","presets":{},"devices":{},"buses":{},"zones":{},"connections":{},"bundles":{},"freeWires":{},"images":{},"documents":{},"docLinks":[],"notes":{},"frames":{},"messages":{},"sketches":{}}"#;

    fn import_error(name: &str, project_json: &str) -> String {
        let base = std::env::temp_dir().join(format!("dm-package-{name}-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        let package = base.join("bad.matics");
        let mut zip = ZipWriter::new(File::create(&package).unwrap());
        zip.start_file(PROJECT_FILE, SimpleFileOptions::default()).unwrap();
        zip.write_all(project_json.as_bytes()).unwrap();
        zip.finish().unwrap();
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        let error = import_package(package.to_string_lossy().into(), root.to_string_lossy().into()).unwrap_err();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir_all(&base).unwrap();
        error
    }

    #[test]
    fn a_package_without_a_project_is_refused() {
        assert!(import_error("none", r#"{"name":"Not a project"}"#).contains("not a Matics project"));
    }

    #[test]
    fn a_package_from_an_older_build_names_what_it_lacks() {
        let older = COMPLETE_PROJECT.replace(r#","messages":{},"sketches":{}"#, "");
        assert!(import_error("older", &older).contains("missing messages, sketches"));
    }

    #[test]
    fn a_package_round_trips() {
        let base = std::env::temp_dir().join(format!("dm-package-{}", std::process::id()));
        let project = base.join("source");
        fs::create_dir_all(project.join(ASSETS_DIR)).unwrap();
        fs::write(project.join(PROJECT_FILE), COMPLETE_PROJECT).unwrap();
        fs::write(project.join(ASSETS_DIR).join("pic.png"), b"png-bytes").unwrap();
        let package = base.join("out.matics");
        export_package(project.to_string_lossy().into(), package.to_string_lossy().into()).unwrap();

        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        let dir = import_package(package.to_string_lossy().into(), root.to_string_lossy().into()).unwrap();
        let dir = Path::new(&dir);
        assert!(dir.ends_with("round-trip"));
        assert_eq!(fs::read_to_string(dir.join(PROJECT_FILE)).unwrap(), COMPLETE_PROJECT);
        assert_eq!(fs::read(dir.join(ASSETS_DIR).join("pic.png")).unwrap(), b"png-bytes");
        fs::remove_dir_all(&base).unwrap();
    }
}
