//! The compressed form of a project: its `.matics` folder zipped into one `.matics` file,
//! for sending to someone or keeping a snapshot. Opening one unpacks it into a new folder.

use crate::storage::{has_matics_extension, is_project_dir, new_project_dir, ASSETS_DIR, MATICS_EXTENSION, PROJECT_FILE};
use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

// Unpacked size, so a small file cannot expand into something that fills the disk.
const MAX_UNPACKED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_PROJECT_BYTES: u64 = 200 * 1024 * 1024;
// Every collection a project holds; compressed projects from older builds lack some and are
// refused. src/model/project-shape.ts checks the same list for folders.
const RECORD_FIELDS: [&str; 18] = [
    "presets", "devices", "buses", "zones", "connections", "bundles", "freeWires", "images", "documents", "notes", "frames", "messages", "sketches",
    "ioModules", "ioSignals", "netInterfaces", "netMappings", "routes",
];

fn missing_fields(project: &serde_json::Value) -> Vec<&'static str> {
    let mut missing: Vec<&'static str> = RECORD_FIELDS.into_iter().filter(|field| !project.get(field).is_some_and(|v| v.is_object())).collect();
    if !project.get("docLinks").is_some_and(|v| v.is_array()) {
        missing.push("docLinks");
    }
    if !project.get("name").is_some_and(|v| v.is_string()) {
        missing.push("name");
    }
    missing
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn compress_project(dir: String, path: String) -> CmdResult<()> {
    let dir = Path::new(&dir);
    let target = Path::new(&path);
    if !has_matics_extension(target) {
        return Err(format!("Compressed projects are saved as .{MATICS_EXTENSION} files."));
    }
    if !dir.join(PROJECT_FILE).is_file() {
        return Err(format!("{} is not a project folder", dir.display()));
    }
    // Written beside the target first, so a failed save never leaves half a file.
    let tmp = target.with_extension("matics-tmp");
    let result = write_compressed(dir, &tmp).and_then(|()| fs::rename(&tmp, target).map_err(err));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn write_compressed(dir: &Path, target: &Path) -> CmdResult<()> {
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

#[derive(Serialize)]
pub struct OpenedProject {
    dir: String,
    // True when a compressed file was unpacked into a new folder.
    unpacked: bool,
}

/// Opens a `.matics` project from anywhere: a folder opens where it is, a compressed file
/// is unpacked into a new folder under `root`.
#[tauri::command]
pub fn open_project_path(path: String, root: String) -> CmdResult<OpenedProject> {
    let source = Path::new(&path);
    if source.is_dir() {
        if !is_project_dir(source) {
            return Err(format!("Matics projects are folders ending in .{MATICS_EXTENSION} with a project.json inside."));
        }
        return Ok(OpenedProject { dir: path, unpacked: false });
    }
    Ok(OpenedProject { dir: uncompress(source, &root)?, unpacked: true })
}

fn uncompress(source: &Path, root: &str) -> CmdResult<String> {
    if !has_matics_extension(source) {
        return Err(format!("Only .{MATICS_EXTENSION} projects can be opened here."));
    }
    let mut archive = ZipArchive::new(File::open(source).map_err(err)?).map_err(|_| "That file is not a compressed Matics project.".to_string())?;
    let mut project_json = String::new();
    archive
        .by_name(PROJECT_FILE)
        .map_err(|_| "The compressed project has no project.json.".to_string())?
        .take(MAX_PROJECT_BYTES + 1)
        .read_to_string(&mut project_json)
        .map_err(err)?;
    if project_json.len() as u64 > MAX_PROJECT_BYTES {
        return Err("The compressed project's project.json is too large.".into());
    }
    let project: serde_json::Value = serde_json::from_str(&project_json).map_err(|_| "The compressed project's project.json is not valid.".to_string())?;
    let missing = missing_fields(&project);
    if RECORD_FIELDS.iter().all(|field| missing.contains(field)) {
        return Err("The compressed project's project.json is not a Matics project.".into());
    }
    if !missing.is_empty() {
        return Err(format!(
            "The compressed project is missing {}. It was made by an older Matics build, which this version cannot open.",
            missing.join(", ")
        ));
    }
    let name = project.get("name").and_then(|v| v.as_str()).unwrap_or_default();

    let dir = new_project_dir(root.to_string(), name.to_string())?;
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
            return Err("The compressed project is too large to open.".into());
        }
        let mut out = File::create(dir.join(ASSETS_DIR).join(asset_name)).map_err(err)?;
        // One byte past the declared size, so a header that understates it is caught.
        let copied = io::copy(&mut (&mut file).take(declared + 1), &mut out).map_err(err)?;
        if copied != declared {
            return Err(format!("The compressed project's entry {} is damaged.", file.name()));
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

/// Projects handed over by Finder or File Explorer that the webview has not picked up yet.
/// They wait here because the launch that opened them happens before the webview can listen.
#[derive(Default)]
pub struct OpenedFiles(Mutex<Vec<String>>);

fn queue_opened(app: &AppHandle, paths: impl Iterator<Item = PathBuf>) {
    let paths = paths.filter(|path| has_matics_extension(path)).map(|path| path.to_string_lossy().into_owned());
    app.state::<OpenedFiles>().0.lock().unwrap().extend(paths);
    let _ = app.emit("files-opened", ());
}

/// macOS delivers double-clicked projects as an event, also for the launch they cause.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn files_opened(app: &AppHandle, urls: Vec<tauri::Url>) {
    queue_opened(app, urls.into_iter().filter_map(|url| url.to_file_path().ok()));
}

/// Windows and Linux pass a double-clicked project as a command-line argument: to this
/// process at launch, or to the running one through the single-instance plugin.
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn opened_from_args(app: &AppHandle, args: impl Iterator<Item = PathBuf>, cwd: Option<&Path>) {
    queue_opened(app, absolute_paths(args, cwd).into_iter());
}

// An opened folder is remembered by its path, so a relative one would break on the next
// launch from somewhere else. Without a working directory, relative paths are dropped.
fn absolute_paths(args: impl Iterator<Item = PathBuf>, cwd: Option<&Path>) -> Vec<PathBuf> {
    args.filter_map(|path| if path.is_absolute() { Some(path) } else { cwd.map(|cwd| cwd.join(path)) }).collect()
}

#[tauri::command]
pub fn take_opened_files(opened: tauri::State<OpenedFiles>) -> Vec<String> {
    std::mem::take(&mut *opened.0.lock().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_line_paths_are_made_absolute() {
        let cwd = std::env::temp_dir();
        let absolute = cwd.join("a.matics");
        let args = || [absolute.clone(), PathBuf::from("b.matics")].into_iter();
        assert_eq!(absolute_paths(args(), Some(&cwd)), [absolute.clone(), cwd.join("b.matics")]);
        assert_eq!(absolute_paths(args(), None), [absolute.clone()]);
    }

    #[test]
    fn only_flat_asset_entries_unpack() {
        assert_eq!(asset_file_name("assets/a.png"), Some("a.png"));
        assert_eq!(asset_file_name("assets/../x"), None);
        assert_eq!(asset_file_name("../assets/x"), None);
        assert_eq!(asset_file_name("/assets/x"), None);
        assert_eq!(asset_file_name("assets/sub/x"), None);
        assert_eq!(asset_file_name("other/x"), None);
    }

    const COMPLETE_PROJECT: &str = r#"{"id":"p1","name":"Round trip","presets":{},"devices":{},"buses":{},"zones":{},"connections":{},"bundles":{},"freeWires":{},"images":{},"documents":{},"docLinks":[],"notes":{},"frames":{},"messages":{},"sketches":{},"ioModules":{},"ioSignals":{},"netInterfaces":{},"netMappings":{},"routes":{}}"#;

    fn uncompress_error(name: &str, project_json: &str) -> String {
        let base = std::env::temp_dir().join(format!("dm-compressed-{name}-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        let compressed = base.join("bad.matics");
        let mut zip = ZipWriter::new(File::create(&compressed).unwrap());
        zip.start_file(PROJECT_FILE, SimpleFileOptions::default()).unwrap();
        zip.write_all(project_json.as_bytes()).unwrap();
        zip.finish().unwrap();
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        let error = uncompress(&compressed, &root.to_string_lossy()).unwrap_err();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir_all(&base).unwrap();
        error
    }

    #[test]
    fn a_compressed_file_without_a_project_is_refused() {
        assert!(uncompress_error("none", r#"{"name":"Not a project"}"#).contains("not a Matics project"));
    }

    #[test]
    fn a_compressed_project_from_an_older_build_names_what_it_lacks() {
        let older = COMPLETE_PROJECT.replace(r#","messages":{},"sketches":{}"#, "");
        assert!(uncompress_error("older", &older).contains("missing messages, sketches."));
        let unnamed = COMPLETE_PROJECT.replace(r#""name":"Round trip","#, "");
        assert!(uncompress_error("unnamed", &unnamed).contains("missing name."));
    }

    #[test]
    fn a_compressed_project_round_trips() {
        let base = std::env::temp_dir().join(format!("dm-compressed-{}", std::process::id()));
        let project = base.join("source.matics");
        fs::create_dir_all(project.join(ASSETS_DIR)).unwrap();
        fs::write(project.join(PROJECT_FILE), COMPLETE_PROJECT).unwrap();
        fs::write(project.join(ASSETS_DIR).join("pic.png"), b"png-bytes").unwrap();
        let compressed = base.join("out.matics");
        compress_project(project.to_string_lossy().into(), compressed.to_string_lossy().into()).unwrap();

        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        let opened = open_project_path(compressed.to_string_lossy().into(), root.to_string_lossy().into()).unwrap();
        assert!(opened.unpacked);
        let dir = Path::new(&opened.dir);
        assert!(dir.ends_with("round-trip.matics"));
        assert_eq!(fs::read_to_string(dir.join(PROJECT_FILE)).unwrap(), COMPLETE_PROJECT);
        assert_eq!(fs::read(dir.join(ASSETS_DIR).join("pic.png")).unwrap(), b"png-bytes");
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn a_project_folder_opens_where_it_is() {
        let base = std::env::temp_dir().join(format!("dm-open-{}", std::process::id()));
        let project = base.join("here.matics");
        let plain = base.join("plain");
        for dir in [&project, &plain] {
            fs::create_dir_all(dir).unwrap();
            fs::write(dir.join(PROJECT_FILE), COMPLETE_PROJECT).unwrap();
        }
        let root = base.to_string_lossy().into_owned();
        let opened = open_project_path(project.to_string_lossy().into(), root.clone()).unwrap();
        assert!(!opened.unpacked);
        assert_eq!(opened.dir, project.to_string_lossy());
        let refused = open_project_path(plain.to_string_lossy().into(), root).err().unwrap();
        assert!(refused.contains("ending in .matics"));
        fs::remove_dir_all(&base).unwrap();
    }
}
