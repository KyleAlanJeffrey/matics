import type { Project, ProjectMeta, WorkspacePrefs } from "@/model/types";
import { desktop, isDesktop, type AppConfig, type ProjectEntry } from "@/lib/desktop";
import { materializeAssets } from "@/lib/assets";
import { assertCompleteProject } from "@/model/project-shape";
import {
  deleteStoredProject,
  loadCurrentId,
  loadIndex,
  loadPrefs,
  loadStoredProject,
  saveCurrentId,
  saveIndex,
  savePrefs,
  saveStoredProject,
} from "./persistence";

// Where projects live. The desktop app uses folders on disk; the browser dev build keeps
// projects in IndexedDB so the UI can be worked on without Tauri.
export interface ProjectStorage {
  init(): Promise<{ projects: ProjectMeta[]; currentId: string | null; prefs: WorkspacePrefs }>;
  load(id: string): Promise<Project | undefined>;
  // The stored project as it is, for previews: not checked, and nothing is written back.
  peek(id: string): Promise<unknown>;
  save(project: Project, meta?: { name: string }): Promise<void>;
  remove(id: string): Promise<void>;
  setCurrent(id: string): Promise<void>;
  updateIndex(projects: ProjectMeta[]): Promise<void>;
  savePrefs(prefs: WorkspacePrefs): Promise<void>;
  // Folder of a project, when it has one.
  dirOf(id: string): string | null;
  // Opens a project folder from anywhere on disk and returns its meta.
  openFolder?(): Promise<ProjectMeta | null>;
  // Unpacks a .matics package into a new folder under the root and returns its meta.
  openPackage?(path: string): Promise<ProjectMeta>;
  rootDir?: string;
}

class DesktopStorage implements ProjectStorage {
  private config: AppConfig = { recent: [] };
  private dirs = new Map<string, string>();
  // Inline pictures already written to a folder, so autosave does not write them again.
  private materialized = new Map<string, string>();
  rootDir = "";

  async init() {
    this.config = await desktop.loadConfig();
    this.rootDir = this.config.root || (await desktop.defaultRoot());
    const entries = await desktop.listProjects(this.rootDir);
    for (const dir of this.config.recent) {
      if (entries.some((e) => e.dir === dir)) continue;
      try {
        entries.push(await desktop.projectEntry(dir));
      } catch {
        // The folder moved or was deleted; forget it.
        this.config.recent = this.config.recent.filter((d) => d !== dir);
      }
    }
    this.dirs.clear();
    const claimed: ProjectEntry[] = [];
    for (const entry of entries) claimed.push(await this.claim(entry));
    const current = claimed.find((e) => e.dir === this.config.current)?.id ?? null;
    const prefs = { starred: this.config.starred ?? [], archived: this.config.archived ?? [], opened: this.config.opened ?? {} };
    return { projects: claimed.map(({ dir, ...meta }) => ({ ...meta, dir })), currentId: current, prefs };
  }

  // A copied folder carries its original's id. Give it a fresh one so both folders stay
  // selectable and autosave cannot write one folder's project into the other.
  private async claim(entry: ProjectEntry): Promise<ProjectEntry> {
    const existing = this.dirs.get(entry.id);
    if (existing && existing !== entry.dir) {
      const raw = await desktop.readProject(entry.dir);
      const id = `project-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await desktop.writeProject(entry.dir, { ...raw, id });
      entry = { ...entry, id };
    }
    this.dirs.set(entry.id, entry.dir);
    return entry;
  }

  dirOf(id: string) {
    return this.dirs.get(id) ?? null;
  }

  async load(id: string) {
    const dir = this.dirs.get(id);
    if (!dir) return undefined;
    const raw = await desktop.readProject(dir);
    assertCompleteProject(raw, typeof raw.name === "string" ? `"${raw.name}"` : dir);
    const project = await materializeAssets(raw, dir, this.materialized);
    if (JSON.stringify(project) !== JSON.stringify(raw)) {
      try {
        await desktop.writeProject(dir, project);
      } catch {
        // A read-only folder still opens; autosave reports the error later.
      }
    }
    return project;
  }

  async peek(id: string) {
    const dir = this.dirs.get(id);
    return dir ? desktop.readProject(dir) : undefined;
  }

  async save(project: Project) {
    let dir = this.dirs.get(project.id);
    if (!dir) {
      dir = await desktop.newProjectDir(this.rootDir, project.name);
      this.dirs.set(project.id, dir);
    }
    const stored = await materializeAssets(project, dir, this.materialized);
    await desktop.writeProject(dir, stored);
  }

  async remove(id: string) {
    const dir = this.dirs.get(id);
    if (!dir) return;
    await desktop.trashProject(dir);
    this.dirs.delete(id);
    this.config.recent = this.config.recent.filter((d) => d !== dir);
    await desktop.saveConfig(this.config);
  }

  async setCurrent(id: string) {
    this.config.current = this.dirs.get(id) ?? null;
    await desktop.saveConfig(this.config);
  }

  // The folder listing is the index; nothing to persist.
  async updateIndex() {}

  async savePrefs(prefs: WorkspacePrefs) {
    this.config = { ...this.config, ...prefs };
    await desktop.saveConfig(this.config);
  }

  async openFolder() {
    const dir = await desktop.pickFolder("Open a diagram project folder");
    if (!dir) return null;
    assertCompleteProject(await desktop.readProject(dir), "That folder's project");
    const entry = await this.claim(await desktop.projectEntry(dir));
    // Only direct children of the root are listed on their own; remember everything else.
    const listed = (await desktop.listProjects(this.rootDir)).some((e) => e.dir === entry.dir);
    if (!listed && !this.config.recent.includes(entry.dir)) {
      this.config.recent.push(entry.dir);
      await desktop.saveConfig(this.config);
    }
    return { id: entry.id, name: entry.name, updatedAt: entry.updatedAt, dir: entry.dir };
  }

  async openPackage(path: string) {
    const dir = await desktop.importPackage(path, this.rootDir);
    // Always a fresh id: the package may be a snapshot of a project that is open here.
    const raw = await desktop.readProject(dir);
    const id = `project-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await desktop.writeProject(dir, { ...raw, id });
    const entry = await desktop.projectEntry(dir);
    this.dirs.set(entry.id, entry.dir);
    return { id: entry.id, name: entry.name, updatedAt: entry.updatedAt, dir: entry.dir };
  }
}

class BrowserStorage implements ProjectStorage {
  async init() {
    return { projects: await loadIndex(), currentId: await loadCurrentId(), prefs: await loadPrefs() };
  }

  dirOf() {
    return null;
  }

  async load(id: string) {
    const project = await loadStoredProject(id);
    if (project) assertCompleteProject(project, `"${project.name}"`);
    return project;
  }

  peek(id: string) {
    return loadStoredProject(id);
  }

  save(project: Project) {
    return saveStoredProject(project);
  }

  remove(id: string) {
    return deleteStoredProject(id);
  }

  setCurrent(id: string) {
    return saveCurrentId(id);
  }

  updateIndex(projects: ProjectMeta[]) {
    return saveIndex(projects);
  }

  savePrefs(prefs: WorkspacePrefs) {
    return savePrefs(prefs);
  }
}

export const storage: ProjectStorage = isDesktop() ? new DesktopStorage() : new BrowserStorage();
