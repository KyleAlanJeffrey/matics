import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Project } from "@/model/types";

// True inside the Tauri window. The plain Vite dev server (browser) has no filesystem
// and falls back to IndexedDB so the UI can still be developed there.
export function isDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface AppConfig {
  root?: string | null;
  current?: string | null;
  recent: string[];
  starred?: string[];
  archived?: string[];
  opened?: Record<string, string>;
}

export interface ProjectEntry {
  dir: string;
  id: string;
  name: string;
  updatedAt: string;
}

export const desktop = {
  loadConfig: () => invoke<AppConfig>("load_config"),
  saveConfig: (config: AppConfig) => invoke<void>("save_config", { config }),
  defaultRoot: () => invoke<string>("default_root"),
  listProjects: (root: string) => invoke<ProjectEntry[]>("list_projects", { root }),
  projectEntry: (dir: string) => invoke<ProjectEntry>("project_entry", { dir }),
  readProject: async (dir: string) => JSON.parse(await invoke<string>("read_project", { dir })) as Project,
  writeProject: (dir: string, project: Project) => invoke<void>("write_project", { dir, json: JSON.stringify(project, null, 2) }),
  newProjectDir: (root: string, name: string) => invoke<string>("new_project_dir", { root, name }),
  trashProject: (dir: string) => invoke<void>("trash_project", { dir }),
  importAsset: (dir: string, source: string) => invoke<string>("import_asset", { dir, source }),
  writeAsset: (dir: string, name: string, ext: string, base64Data: string) => invoke<string>("write_asset", { dir, name, ext, base64Data }),
  readAssetBase64: (dir: string, rel: string) => invoke<string>("read_asset_base64", { dir, rel }),
  removeAsset: (dir: string, rel: string) => invoke<void>("remove_asset", { dir, rel }),
  copyAsset: (fromDir: string, toDir: string, rel: string) => invoke<void>("copy_asset", { fromDir, toDir, rel }),
  openAsset: (dir: string, rel: string) => invoke<void>("open_asset", { dir, rel }),
  fetchPdf: (url: string) => invoke<string>("fetch_pdf", { url }),
  writeExportFile: (path: string, base64Data: string) => invoke<void>("write_export_file", { path, base64Data }),
  compressProject: (dir: string, path: string) => invoke<void>("compress_project", { dir, path }),
  openProjectPath: (path: string, root: string) => invoke<{ dir: string; unpacked: boolean }>("open_project_path", { path, root }),
  takeOpenedFiles: () => invoke<string[]>("take_opened_files"),

  pickFolder: (title: string) => openDialog({ directory: true, multiple: false, title }) as Promise<string | null>,
  pickFile: (title: string, filters: { name: string; extensions: string[] }[]) =>
    openDialog({ directory: false, multiple: false, title, filters }) as Promise<string | null>,
  pickSavePath: (title: string, defaultPath: string, filters: { name: string; extensions: string[] }[]) =>
    saveDialog({ title, defaultPath, filters }) as Promise<string | null>,
  reveal: (path: string) => revealItemInDir(path),

  fileUrl: (absolutePath: string) => convertFileSrc(absolutePath),
};

export type DesktopPlatform = "mac" | "windows" | "linux";

export function desktopPlatform(): DesktopPlatform | null {
  if (!isDesktop()) return null;
  const agent = navigator.userAgent;
  return agent.includes("Mac") ? "mac" : agent.includes("Windows") ? "windows" : "linux";
}

// The macOS app draws its own title bar: the window controls float over the app header.
export function hasOverlayTitleBar() {
  return desktopPlatform() === "mac";
}

// Only macOS has a native menu bar (src-tauri/src/lib.rs); elsewhere the header shows the
// in-app File menu and the page handles the menu shortcuts.
export function hasNativeMenu() {
  return desktopPlatform() === "mac";
}

// Windows has no native title bar (tauri.windows.conf.json), so the header draws the
// window buttons.
export function drawsWindowControls() {
  return desktopPlatform() === "windows";
}

export function fileManagerName() {
  const platform = desktopPlatform();
  return platform === "mac" ? "Finder" : platform === "windows" ? "File Explorer" : "the file manager";
}

export function trashName() {
  return desktopPlatform() === "windows" ? "Recycle Bin" : "Trash";
}

export function joinPath(dir: string, rel: string) {
  return `${dir.replace(/[\\/]+$/, "")}/${rel}`;
}

// The last two folders of a path, for a menu hint.
export function shortPath(path: string) {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `...${separator}${parts.slice(-2).join(separator)}` : path;
}

export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

// Rust reports mtimes as "@<millis>"; everything else is ISO from the browser fallback.
export function entryDate(updatedAt: string) {
  return updatedAt.startsWith("@") ? new Date(Number(updatedAt.slice(1))) : new Date(updatedAt);
}
