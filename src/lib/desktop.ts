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
  readImportFile: (path: string) => invoke<string>("read_import_file", { path }),
  writeExportFile: (path: string, base64Data: string) => invoke<void>("write_export_file", { path, base64Data }),
  exportPackage: (dir: string, path: string) => invoke<void>("export_package", { dir, path }),
  importPackage: (path: string, root: string) => invoke<string>("import_package", { path, root }),
  takeOpenedFiles: () => invoke<string[]>("take_opened_files"),

  pickFolder: (title: string) => openDialog({ directory: true, multiple: false, title }) as Promise<string | null>,
  pickFile: (title: string, filters: { name: string; extensions: string[] }[]) =>
    openDialog({ directory: false, multiple: false, title, filters }) as Promise<string | null>,
  pickSavePath: (title: string, defaultPath: string, filters: { name: string; extensions: string[] }[]) =>
    saveDialog({ title, defaultPath, filters }) as Promise<string | null>,
  reveal: (path: string) => revealItemInDir(path),

  fileUrl: (absolutePath: string) => convertFileSrc(absolutePath),
};

// The macOS app draws its own title bar: the window controls float over the app header.
export function hasOverlayTitleBar() {
  return isDesktop() && navigator.userAgent.includes("Mac");
}

export function joinPath(dir: string, rel: string) {
  return `${dir.replace(/[\\/]+$/, "")}/${rel}`;
}

export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

// Rust reports mtimes as "@<millis>"; everything else is ISO from the browser fallback.
export function entryDate(updatedAt: string) {
  return updatedAt.startsWith("@") ? new Date(Number(updatedAt.slice(1))) : new Date(updatedAt);
}
