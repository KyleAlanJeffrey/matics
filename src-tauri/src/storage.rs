//! Projects live on disk as `.matics` folders the user can copy, sync or commit:
//!
//! ```text
//! <projects root>/<name>.matics/
//!   project.json      the Project (see src/model/types.ts)
//!   assets/           device pictures and attached documents
//! ```
//!
//! The same folder zipped into one `<name>.matics` file is the compressed form (package.rs).
//!
//! The webview never touches the filesystem directly; every operation is a command here.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::BTreeMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

pub const PROJECT_FILE: &str = "project.json";
pub const ASSETS_DIR: &str = "assets";
/// Both forms of a project, the folder and the compressed file, end in `.matics`.
pub const MATICS_EXTENSION: &str = "matics";

pub fn has_matics_extension(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case(MATICS_EXTENSION))
}

pub fn is_project_dir(path: &Path) -> bool {
    path.is_dir() && has_matics_extension(path) && path.join(PROJECT_FILE).is_file()
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Folder that holds project folders. Defaults to ~/Documents/Matics.
    pub root: Option<String>,
    /// Folder of the project that was open last.
    pub current: Option<String>,
    /// Project folders opened from outside the root.
    #[serde(default)]
    pub recent: Vec<String>,
    /// Starred and archived project folders, for the project home.
    #[serde(default)]
    pub starred: Vec<String>,
    #[serde(default)]
    pub archived: Vec<String>,
    /// When each project folder was last opened.
    #[serde(default)]
    pub opened: BTreeMap<String, String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub dir: String,
    pub id: String,
    pub name: String,
    pub updated_at: String,
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn config_path(app: &AppHandle) -> CmdResult<PathBuf> {
    let dir = app.path().app_config_dir().map_err(err)?;
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> CmdResult<AppConfig> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let text = fs::read_to_string(path).map_err(err)?;
    serde_json::from_str(&text).map_err(err)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> CmdResult<()> {
    let path = config_path(&app)?;
    let text = serde_json::to_string_pretty(&config).map_err(err)?;
    write_atomic(&path, text.as_bytes())
}

#[tauri::command]
pub fn default_root() -> CmdResult<String> {
    let docs = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "No home directory".to_string())?;
    let root = docs.join("Matics");
    fs::create_dir_all(&root).map_err(err)?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_projects(root: String) -> CmdResult<Vec<ProjectEntry>> {
    let mut entries = Vec::new();
    let read = match fs::read_dir(&root) {
        Ok(read) => read,
        Err(_) => return Ok(entries),
    };
    for item in read.flatten() {
        let dir = item.path();
        if is_project_dir(&dir) {
            if let Ok(entry) = read_project_entry(&dir) {
                entries.push(entry);
            }
        }
    }
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(entries)
}

#[tauri::command]
pub fn project_entry(dir: String) -> CmdResult<ProjectEntry> {
    read_project_entry(Path::new(&dir))
}

fn read_project_entry(dir: &Path) -> CmdResult<ProjectEntry> {
    let file = dir.join(PROJECT_FILE);
    let text = fs::read_to_string(&file).map_err(err)?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(err)?;
    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("{} has no project id", file.display()))?;
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled project");
    let modified = fs::metadata(&file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(ProjectEntry {
        dir: dir.to_string_lossy().into_owned(),
        id: id.to_string(),
        name: name.to_string(),
        updated_at: iso_from_millis(modified),
    })
}

// Good enough for sorting and display; the webview formats it with Date.
fn iso_from_millis(millis: u64) -> String {
    format!("@{millis}")
}

#[tauri::command]
pub fn read_project(dir: String) -> CmdResult<String> {
    fs::read_to_string(Path::new(&dir).join(PROJECT_FILE)).map_err(err)
}

#[tauri::command]
pub fn write_project(dir: String, json: String) -> CmdResult<()> {
    let dir = Path::new(&dir);
    fs::create_dir_all(dir.join(ASSETS_DIR)).map_err(err)?;
    write_atomic(&dir.join(PROJECT_FILE), json.as_bytes())
}

/// Picks a free `<name>.matics` folder under `root` for a new project.
#[tauri::command]
pub fn new_project_dir(root: String, name: String) -> CmdResult<String> {
    let base = safe_folder_name(&name);
    let root = Path::new(&root);
    let mut candidate = root.join(format!("{base}.{MATICS_EXTENSION}"));
    let mut n = 2;
    while candidate.exists() {
        candidate = root.join(format!("{base}-{n}.{MATICS_EXTENSION}"));
        n += 1;
    }
    fs::create_dir_all(candidate.join(ASSETS_DIR)).map_err(err)?;
    Ok(candidate.to_string_lossy().into_owned())
}

fn safe_folder_name(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_end_matches('-').to_string();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed
    }
}

#[tauri::command]
pub fn trash_project(dir: String) -> CmdResult<()> {
    let path = Path::new(&dir);
    if !path.is_dir() || !path.join(PROJECT_FILE).is_file() {
        return Err(format!("{dir} is not a project folder"));
    }
    trash::delete(&dir).map_err(err)
}

/// Copies a file the user picked into the project's assets folder.
/// Returns the path relative to the project folder, e.g. `assets/datasheet-1a2b3c4d.pdf`.
#[tauri::command]
pub fn import_asset(dir: String, source: String) -> CmdResult<String> {
    let bytes = fs::read(&source).map_err(err)?;
    let source = Path::new(&source);
    let stem = source
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string());
    let ext = source
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    store_asset(Path::new(&dir), &stem, &ext, &bytes)
}

/// Stores bytes handed over by the webview (used when converting inline data URLs).
#[tauri::command]
pub fn write_asset(dir: String, name: String, ext: String, base64_data: String) -> CmdResult<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(err)?;
    store_asset(Path::new(&dir), &name, &ext, &bytes)
}

fn store_asset(dir: &Path, stem: &str, ext: &str, bytes: &[u8]) -> CmdResult<String> {
    // The extension comes from the webview; keep it a short plain token.
    let ext: String = ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(10)
        .collect::<String>()
        .to_ascii_lowercase();
    let assets = dir.join(ASSETS_DIR);
    fs::create_dir_all(&assets).map_err(err)?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    let digest = format!("{:08x}", hasher.finish() as u32);
    let file_name = if ext.is_empty() {
        format!("{}-{digest}", safe_folder_name(stem))
    } else {
        format!("{}-{digest}.{ext}", safe_folder_name(stem))
    };
    let target = assets.join(&file_name);
    if !target.exists() {
        write_atomic(&target, bytes)?;
    }
    Ok(format!("{ASSETS_DIR}/{file_name}"))
}

#[tauri::command]
pub fn read_asset_base64(dir: String, rel: String) -> CmdResult<String> {
    let path = asset_path(&dir, &rel)?;
    let bytes = fs::read(path).map_err(err)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

const MAX_PDF_BYTES: u64 = 64 * 1024 * 1024;
const PDF_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// Links come from shared project files, so a PDF request may only reach public hosts.
/// The check runs in the resolver, so it also covers redirects and DNS answers.
fn is_public_ip(ip: std::net::IpAddr) -> bool {
    use std::net::IpAddr;
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || a == 0
                || (a == 100 && (64..128).contains(&b)))
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(v4));
            }
            let first = v6.segments()[0];
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80)
        }
    }
}

fn public_only_resolver(netloc: &str) -> std::io::Result<Vec<std::net::SocketAddr>> {
    use std::net::ToSocketAddrs;
    let addrs: Vec<_> = netloc.to_socket_addrs()?.filter(|a| is_public_ip(a.ip())).collect();
    if addrs.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "PDF links must point at a public internet address.",
        ));
    }
    Ok(addrs)
}

/// Downloads a linked PDF for the in-app viewer. Most sites send no CORS headers, so the
/// webview cannot fetch them itself.
#[tauri::command]
pub async fn fetch_pdf(url: String) -> CmdResult<String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http and https links can be previewed.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let agent = ureq::AgentBuilder::new()
            .timeout(PDF_TIMEOUT)
            .resolver(public_only_resolver)
            .build();
        let response = agent.get(&url).call().map_err(err)?;
        let mut bytes = Vec::new();
        response
            .into_reader()
            .take(MAX_PDF_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(err)?;
        if bytes.len() as u64 > MAX_PDF_BYTES {
            return Err("The PDF is larger than 64 MB.".into());
        }
        if !bytes.starts_with(b"%PDF") {
            return Err("The link did not return a PDF.".into());
        }
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub fn remove_asset(dir: String, rel: String) -> CmdResult<()> {
    if !asset_rel_ok(&rel) {
        return Err(format!("Not an asset path: {rel}"));
    }
    if !Path::new(&dir).join(&rel).exists() {
        return Ok(());
    }
    fs::remove_file(asset_path(&dir, &rel)?).map_err(err)
}

/// Copies one asset between project folders, keeping its relative path.
#[tauri::command]
pub fn copy_asset(from_dir: String, to_dir: String, rel: String) -> CmdResult<()> {
    let source = asset_path(&from_dir, &rel)?;
    let target = Path::new(&to_dir).join(&rel);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::copy(source, target).map_err(err)?;
    Ok(())
}

/// Opens an attached file with the system's default application.
#[tauri::command]
pub fn open_asset(dir: String, rel: String) -> CmdResult<()> {
    let path = asset_path(&dir, &rel)?;
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(err)
}

// An asset path is `assets/<plain segments>`: no root, no `..`, no prefix tricks.
fn asset_rel_ok(rel: &str) -> bool {
    use std::path::Component;
    let mut components = Path::new(rel).components();
    let first = matches!(components.next(), Some(Component::Normal(c)) if c == ASSETS_DIR);
    first && components.all(|c| matches!(c, Component::Normal(_)))
}

// Resolves an existing asset and refuses anything that lands outside <dir>/assets,
// including through symlinks.
fn asset_path(dir: &str, rel: &str) -> CmdResult<PathBuf> {
    if !asset_rel_ok(rel) {
        return Err(format!("Not an asset path: {rel}"));
    }
    let root = fs::canonicalize(dir).map_err(err)?.join(ASSETS_DIR);
    let real = fs::canonicalize(Path::new(dir).join(rel)).map_err(err)?;
    if !real.starts_with(&root) {
        return Err(format!("Not an asset path: {rel}"));
    }
    Ok(real)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> CmdResult<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

#[cfg(test)]
mod tests {
    #[test]
    fn pdf_requests_skip_local_and_private_hosts() {
        for ip in ["127.0.0.1", "10.1.2.3", "192.168.0.10", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"] {
            assert!(!is_public_ip(ip.parse().unwrap()), "{ip} should be blocked");
        }
        for ip in ["93.184.216.34", "2606:4700::1111"] {
            assert!(is_public_ip(ip.parse().unwrap()), "{ip} should be allowed");
        }
    }

    use super::*;

    #[test]
    fn folder_names_are_safe() {
        assert_eq!(safe_folder_name("Demo Rover (sample)"), "demo-rover-sample");
        assert_eq!(safe_folder_name("///"), "project");
    }

    #[test]
    fn only_matics_folders_are_projects() {
        let root = std::env::temp_dir().join(format!("dm-list-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let project = r#"{"id":"p1","name":"Listed"}"#;
        let first = new_project_dir(root.to_string_lossy().into(), "Listed".into()).unwrap();
        let second = new_project_dir(root.to_string_lossy().into(), "Listed".into()).unwrap();
        assert!(first.ends_with("listed.matics") && second.ends_with("listed-2.matics"));
        fs::write(Path::new(&first).join(PROJECT_FILE), project).unwrap();
        fs::create_dir_all(root.join("plain")).unwrap();
        fs::write(root.join("plain").join(PROJECT_FILE), project).unwrap();
        let listed = list_projects(root.to_string_lossy().into()).unwrap();
        assert_eq!(listed.iter().map(|e| e.dir.as_str()).collect::<Vec<_>>(), [first.as_str()]);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn asset_paths_stay_inside_the_project() {
        assert!(asset_rel_ok("assets/a.pdf"));
        assert!(!asset_rel_ok("../etc/passwd"));
        assert!(!asset_rel_ok("assets/../../x"));
        assert!(!asset_rel_ok("/etc/passwd"));
        assert!(!asset_rel_ok("assets-other/x"));
        assert!(!asset_rel_ok("assetsX"));
    }

    #[test]
    fn asset_paths_follow_symlinks_out_and_refuse() {
        let dir = std::env::temp_dir().join(format!("dm-test-{}", std::process::id()));
        let assets = dir.join(ASSETS_DIR);
        fs::create_dir_all(&assets).unwrap();
        fs::write(assets.join("ok.txt"), b"x").unwrap();
        let outside = dir.join("outside.txt");
        fs::write(&outside, b"y").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, assets.join("link.txt")).unwrap();
        let dir_str = dir.to_string_lossy().into_owned();
        assert!(asset_path(&dir_str, "assets/ok.txt").is_ok());
        #[cfg(unix)]
        assert!(asset_path(&dir_str, "assets/link.txt").is_err());
        assert!(asset_path(&dir_str, "assets/missing.txt").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }
}

// Files the user picked in a native save panel for an export. Limited to the formats the
// app writes, so this command cannot touch anything else.
const EXPORT_EXTENSIONS: &[&str] = &["pdf", "png", "svg"];

fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| allowed.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[tauri::command]
pub fn write_export_file(path: String, base64_data: String) -> CmdResult<()> {
    let path = Path::new(&path);
    if !has_extension(path, EXPORT_EXTENSIONS) {
        return Err("Exports are saved as .pdf, .png or .svg.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64_data).map_err(err)?;
    fs::write(path, bytes).map_err(err)
}
