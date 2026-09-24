import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import type { Project, ProjectMeta } from "@/model/types";
import { saveFile } from "@/lib/save-file";

const INDEX_KEY = "diagram-maker:projects";
const CURRENT_KEY = "diagram-maker:current";

const projectKey = (id: string) => `diagram-maker:project:${id}`;

export async function loadIndex(): Promise<ProjectMeta[]> {
  return (await idbGet<ProjectMeta[]>(INDEX_KEY)) ?? [];
}

export async function saveIndex(index: ProjectMeta[]) {
  await idbSet(INDEX_KEY, index);
}

export async function loadCurrentId(): Promise<string | null> {
  return (await idbGet<string>(CURRENT_KEY)) ?? null;
}

export async function saveCurrentId(id: string) {
  await idbSet(CURRENT_KEY, id);
}

// IndexedDB layout, used by the browser dev build only. The desktop app stores folders
// on disk (see storage.ts and src-tauri/src/storage.rs).
export async function loadStoredProject(id: string): Promise<Project | undefined> {
  return idbGet<Project>(projectKey(id));
}

export async function saveStoredProject(project: Project) {
  await idbSet(projectKey(project.id), project);
}

export async function deleteStoredProject(id: string) {
  await idbDel(projectKey(id));
}

export async function downloadJson(filename: string, payload: unknown) {
  await saveFile(filename, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
}

export async function readJsonFile<T>(file: File): Promise<T> {
  return JSON.parse(await file.text()) as T;
}

export function safeFilename(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "project";
}
