import type { Project } from "./types";

// Every collection a Project holds. Projects saved by older builds lack some of them, and
// those are refused where they come in (import, open folder, open package) instead of
// crashing whichever page reads the gap. src-tauri/src/package.rs checks the same list.
const RECORD_FIELDS = [
  "presets",
  "devices",
  "buses",
  "zones",
  "connections",
  "bundles",
  "freeWires",
  "images",
  "documents",
  "notes",
  "frames",
  "messages",
  "sketches",
] as const;

function isRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function missingProjectFields(value: unknown): string[] {
  if (!isRecord(value)) return ["everything"];
  const project = value as Record<string, unknown>;
  const missing: string[] = RECORD_FIELDS.filter((field) => !isRecord(project[field]));
  if (!Array.isArray(project.docLinks)) missing.push("docLinks");
  if (typeof project.id !== "string") missing.push("id");
  if (typeof project.name !== "string") missing.push("name");
  return missing;
}

export function assertCompleteProject(value: unknown, source: string): asserts value is Project {
  const missing = missingProjectFields(value);
  if (missing.length > 0) {
    throw new Error(`${source} is missing ${missing.join(", ")}. It was saved by an older Matics build, which this version cannot open.`);
  }
}
